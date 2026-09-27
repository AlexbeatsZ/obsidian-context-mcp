import { App, MarkdownView, Notice, editorInfoField } from "obsidian";
import { StateEffect, StateField, type EditorState, type Extension, type Range } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, WidgetType, type DecorationSet } from "@codemirror/view";
import type { ReviewEngine, Proposal, PreparedOperation } from "./engine";
import { inlineHunks, firstPendingOffset, type InlineHunk } from "./inline-model";

const refreshInline=StateEffect.define<null>();
interface Model {proposal:Proposal;operation:PreparedOperation;hunks:InlineHunk[];}

export class InlineReview {
  selected:string|null=null;
  busy=false;
  private views=new Set<EditorView>();
  private scheduled=false;
  constructor(private app:App,private engine:ReviewEngine,private openManager:(id?:string)=>Promise<void>,private pauseContext:()=>void){}
  model(state:EditorState):Model|null {
    const path=state.field(editorInfoField,false)?.file?.path;if(!path?.endsWith(".md"))return null;
    const proposals=[...this.engine.proposals.values()].sort((a,b)=>b.created_at.localeCompare(a.created_at));
    const hasPending=(p:Proposal)=>p.operations.some(op=>op.input.kind==="edit"&&op.input.path===path&&this.engine.pending(op));
    const chosen=proposals.find(p=>p.id===this.selected&&hasPending(p))??proposals.find(hasPending);
    if(!chosen)return null;
    const operation=chosen.operations.find(op=>op.input.kind==="edit"&&op.input.path===path)!;
    return {proposal:chosen,operation,hunks:inlineHunks(operation,state.doc.toString())};
  }
  extension():Extension {
    const owner=this;
    const field=StateField.define<DecorationSet>({
      create:state=>owner.decorations(state),
      update:(value,tr)=>tr.docChanged||tr.effects.some(e=>e.is(refreshInline))?owner.decorations(tr.state):value,
      provide:field=>EditorView.decorations.from(field)
    });
    const toolbar=ViewPlugin.fromClass(class {
      bar:HTMLElement|null=null;
      constructor(public view:EditorView){owner.views.add(view);this.render();}
      update(update:{docChanged:boolean;transactions:readonly {effects:readonly StateEffect<unknown>[]}[]}){
        if(update.docChanged||update.transactions.some(tr=>tr.effects.some(e=>e.is(refreshInline))))this.render();
      }
      render(){
        this.bar?.remove();this.bar=null;
        const model=owner.model(this.view.state);if(!model)return;
        const host=this.view.dom.closest(".markdown-source-view")?.parentElement;if(!host)return;
        const bar=host.ownerDocument.createElement("div");bar.className="ocm-inline-toolbar";this.bar=bar;
        const title=bar.ownerDocument.createElement("span");title.className="ocm-inline-title";title.textContent=model.proposal.title;bar.append(title);
        const files=bar.ownerDocument.createElement("select");files.setAttribute("aria-label","审阅文件");
        for(const op of model.proposal.operations)if(op.input.kind==="edit"&&op.input.path.endsWith(".md")){
          const option=files.ownerDocument.createElement("option");option.value=op.input.path;option.textContent=op.input.path;files.append(option);
        }
        files.value=model.operation.input.path;files.onchange=()=>void owner.open(model.proposal.id,files.value);if(files.options.length>1)bar.append(files);
        owner.button(bar,"全部接受",()=>owner.engine.decideAll(model.proposal.id,"accepted"),!!model.operation.error||!!model.proposal.recovery_error);
        owner.button(bar,"全部拒绝",()=>owner.engine.decideAll(model.proposal.id,"rejected"));
        owner.button(bar,"候选记录",()=>owner.openManager(model.proposal.id));
        const error=model.proposal.recovery_error??model.operation.error;
        if(error){const message=bar.ownerDocument.createElement("span");message.className="ocm-error";message.textContent=error;bar.append(message);}
        host.insertBefore(bar,host.firstChild);
      }
      destroy(){owner.views.delete(this.view);this.bar?.remove();}
    });
    return [field,toolbar];
  }
  private decorations(state:EditorState){
    const model=this.model(state);if(!model)return Decoration.none;
    const ranges:Range<Decoration>[]=[];
    for(const h of model.hunks){
      if(h.to>h.from){
        const last=state.doc.lineAt(Math.max(h.from,h.to-1));
        for(let line=state.doc.lineAt(h.from).number;line<=last.number;line++)ranges.push(Decoration.line({class:"ocm-inline-removed"}).range(state.doc.line(line).from));
      }
      // A block widget sits after the original complete lines. Insertions sit
      // before the following line; no candidate bytes enter the editor document.
      const at=h.to>h.from?state.doc.lineAt(h.to-1).to:h.from;
      ranges.push(Decoration.widget({widget:new IncomingWidget(this,model.proposal.id,model.operation.id,h),block:true,side:h.to>h.from||at===state.doc.length?1:-1}).range(at));
    }
    return Decoration.set(ranges,true);
  }
  button(parent:HTMLElement,label:string,action:()=>Promise<unknown>,disabled=false){
    const button=parent.ownerDocument.createElement("button");button.textContent=label;button.type="button";button.disabled=this.busy||disabled;
    button.addEventListener("mousedown",e=>e.preventDefault());
    button.onclick=()=>{void this.run(action);};parent.append(button);return button;
  }
  decideHunk(proposal:string,operation:string,hunk:string,decision:"accepted"|"rejected"){
    return this.engine.decide(proposal,operation,decision,hunk);
  }
  private async run(action:()=>Promise<unknown>){
    if(this.busy)return;this.busy=true;this.refresh();
    try{await action();}catch(error){new Notice((error as Error).message,8000);}finally{this.busy=false;this.refresh();}
  }
  refresh(){
    if(this.scheduled)return;this.scheduled=true;
    queueMicrotask(()=>{this.scheduled=false;for(const view of this.views)view.dispatch({effects:refreshInline.of(null)});});
  }
  async open(id?:string,filePath?:string):Promise<boolean>{
    const p=id?this.engine.get(id):[...this.engine.proposals.values()].sort((a,b)=>b.created_at.localeCompare(a.created_at)).find(p=>p.operations.some(op=>op.input.kind==="edit"&&op.input.path.endsWith(".md")&&this.engine.pending(op)));
    if(!p)return false;
    const op=p.operations.find(op=>op.input.kind==="edit"&&op.input.path.endsWith(".md")&&(filePath?op.input.path===filePath:this.engine.pending(op)));
    if(!op)return false;
    const file=this.app.vault.getFileByPath(op.input.path);if(!file)return false;
    this.selected=p.id;this.pauseContext();
    let leaf=this.app.workspace.getLeavesOfType("markdown").find(l=>(l.view as MarkdownView).file?.path===file.path);
    if(!leaf)leaf=this.app.workspace.getLeaf("tab");
    if(!(leaf.view instanceof MarkdownView)||leaf.view.file?.path!==file.path||leaf.view.getMode()!=="source")await leaf.openFile(file,{active:true,state:{mode:"source"}});
    await this.app.workspace.revealLeaf(leaf);this.refresh();
    const editor=(leaf.view as MarkdownView).editor;
    if(op.baseline?.text){const at=editor.offsetToPos(firstPendingOffset(op.baseline.text,op.hunks));editor.scrollIntoView({from:at,to:at},true);}
    return true;
  }
  close(){for(const view of this.views){view.dom.closest(".markdown-source-view")?.parentElement?.querySelector(".ocm-inline-toolbar")?.remove();}this.views.clear();}
}

class IncomingWidget extends WidgetType {
  private busy:boolean;
  constructor(private owner:InlineReview,private proposal:string,private operation:string,private hunk:InlineHunk){super();this.busy=owner.busy;}
  eq(other:IncomingWidget){return this.proposal===other.proposal&&this.operation===other.operation&&this.hunk.id===other.hunk.id&&this.hunk.replacement===other.hunk.replacement&&this.busy===other.busy;}
  toDOM(view:EditorView){
    const root=view.dom.ownerDocument.createElement("div");root.className="ocm-inline-block";root.setAttribute("data-hunk",this.hunk.id);root.contentEditable="false";
    if(this.hunk.replacement){const text=root.ownerDocument.createElement("div");text.className="ocm-inline-added";text.textContent=this.hunk.replacement.replace(/\n$/,"");root.append(text);}
    const actions=root.ownerDocument.createElement("div");actions.className="ocm-inline-actions";root.append(actions);
    this.owner.button(actions,"接受",()=>this.owner.decideHunk(this.proposal,this.operation,this.hunk.id,"accepted"));
    this.owner.button(actions,"拒绝",()=>this.owner.decideHunk(this.proposal,this.operation,this.hunk.id,"rejected"));
    return root;
  }
  ignoreEvent(){return true;}
}
