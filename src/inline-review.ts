import { App, MarkdownView, Notice, editorInfoField } from "obsidian";
import { StateEffect, StateField, type EditorState, type Extension, type Range } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, WidgetType, type DecorationSet } from "@codemirror/view";
import type { ReviewEngine, Proposal, PreparedOperation } from "./engine";
import { changedLinePairs, firstPendingOffset, inlineHunks, pickReviewHost, type InlineHunk } from "./inline-model";

const refreshInline=StateEffect.define<null>();
interface Model {proposal:Proposal;operation:PreparedOperation;hunks:InlineHunk[];}

export class InlineReview {
  selected:string|null=null;
  hostPath:string|null=null;
  busy=false;
  private views=new Set<EditorView>();
  private scheduled=false;
  constructor(private app:App,private engine:ReviewEngine,private pauseContext:()=>void,private preferredContext:()=>string|null){}

  private proposals(){return [...this.engine.proposals.values()].sort((a,b)=>b.created_at.localeCompare(a.created_at));}
  private proposalFor(state:EditorState):Proposal|null {
    const path=state.field(editorInfoField,false)?.file?.path;if(!path?.endsWith(".md"))return null;
    if(this.hostPath===path&&this.selected){const explicit=this.engine.proposals.get(this.selected);if(explicit)return explicit;}
    return this.proposals().find(p=>p.operations.some(op=>op.input.kind==="edit"&&op.input.path===path&&this.engine.pending(op)))??null;
  }
  model(state:EditorState):Model|null {
    const path=state.field(editorInfoField,false)?.file?.path;
    const proposal=this.proposalFor(state);if(!proposal||!path)return null;
    const operation=proposal.operations.find(op=>op.input.kind==="edit"&&op.input.path===path&&this.engine.pending(op));
    return operation?{proposal,operation,hunks:inlineHunks(operation,state.doc.toString())}:null;
  }
  private extraOperations(p:Proposal){return p.operations.filter(op=>op.input.kind!=="edit"||!op.input.path.endsWith(".md"));}

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
        const p=owner.proposalFor(this.view.state);if(!p)return;
        const host=this.view.dom.closest(".markdown-source-view")?.parentElement;if(!host)return;
        const bar=host.ownerDocument.createElement("div");bar.className="ocm-inline-toolbar";this.bar=bar;
        const picker=bar.ownerDocument.createElement("select");picker.setAttribute("aria-label","选择候选修改");
        for(const proposal of owner.proposals()){
          const option=picker.ownerDocument.createElement("option");option.value=proposal.id;option.textContent=proposal.title;picker.append(option);
        }
        picker.value=p.id;picker.onchange=()=>void owner.open(picker.value);bar.append(picker);
        const files=p.operations.filter(op=>op.input.kind==="edit"&&op.input.path.endsWith(".md"));
        if(files.length>1){
          const filePicker=bar.ownerDocument.createElement("select");filePicker.setAttribute("aria-label","审阅文件");
          for(const op of files){const option=filePicker.ownerDocument.createElement("option");option.value=op.input.path;option.textContent=op.input.path;filePicker.append(option);}
          filePicker.value=this.view.state.field(editorInfoField,false)?.file?.path??"";
          filePicker.onchange=()=>void owner.open(p.id,filePicker.value);bar.append(filePicker);
        }
        const pending=p.operations.some(op=>owner.engine.pending(op));
        if(pending){
          owner.button(bar,"全部接受",()=>owner.engine.decideAll(p.id,"accepted"),!!p.recovery_error||p.operations.some(op=>!!op.error));
          owner.button(bar,"全部拒绝",()=>owner.engine.decideAll(p.id,"rejected"));
        }
        if(p.operations.some(op=>op.recovery_ids.length&&!op.restored))owner.button(bar,"恢复",()=>owner.engine.recover(p.id));
        if(p.recovery_error){const error=bar.ownerDocument.createElement("span");error.className="ocm-error";error.textContent=p.recovery_error;bar.append(error);}
        host.insertBefore(bar,host.firstChild);
      }
      destroy(){owner.views.delete(this.view);this.bar?.remove();}
    });
    return [field,toolbar];
  }

  private decorations(state:EditorState){
    const proposal=this.proposalFor(state);if(!proposal)return Decoration.none;
    const ranges:Range<Decoration>[]=[];
    if(this.hostPath===state.field(editorInfoField,false)?.file?.path&&this.extraOperations(proposal).length)
      ranges.push(Decoration.widget({widget:new FileOperationsWidget(this,proposal),block:true,side:-1}).range(0));
    const model=this.model(state);
    if(model)for(const h of model.hunks){
      if(h.to>h.from){
        const last=state.doc.lineAt(Math.max(h.from,h.to-1));
        for(let line=state.doc.lineAt(h.from).number;line<=last.number;line++)ranges.push(Decoration.line({class:"ocm-inline-removed"}).range(state.doc.line(line).from));
      }
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
    try{await action();}catch(error){new Notice((error as Error).message,8000);}finally{
      const p=this.selected?this.engine.proposals.get(this.selected):null;
      if(p&&!p.operations.some(op=>this.engine.pending(op))){this.selected=null;this.hostPath=null;}
      this.busy=false;this.refresh();
    }
  }
  refresh(){
    if(this.scheduled)return;this.scheduled=true;
    queueMicrotask(()=>{this.scheduled=false;for(const view of this.views)view.dispatch({effects:refreshInline.of(null)});});
  }

  private text(parent:HTMLElement,content:string,cls:string){
    if(!content)return;
    const block=parent.ownerDocument.createElement("pre");block.className=cls;block.textContent=content;parent.append(block);
  }
  private changes(parent:HTMLElement,before:string,after:string){
    for(const pair of changedLinePairs(before,after)){
      this.text(parent,pair.oldText,"ocm-inline-file-old");
      this.text(parent,pair.newText,"ocm-inline-file-new");
    }
  }
  renderOperation(parent:HTMLElement,p:Proposal,op:PreparedOperation){
    const card=parent.ownerDocument.createElement("section");card.className="ocm-inline-file";parent.append(card);
    const heading=card.ownerDocument.createElement("div");heading.className="ocm-inline-file-head";card.append(heading);
    const kind=heading.ownerDocument.createElement("span");kind.className="ocm-inline-file-kind";
    kind.textContent={edit:"编辑",create:"新建",move:"移动",trash:"回收"}[op.input.kind];heading.append(kind);
    const path=heading.ownerDocument.createElement("strong");path.textContent=op.input.path;heading.append(path);
    if(op.input.kind==="move"){const dest=heading.ownerDocument.createElement("span");dest.textContent=`→ ${op.input.to}`;heading.append(dest);}
    const pending=this.engine.pending(op);
    if(op.error){const error=card.ownerDocument.createElement("div");error.className="ocm-error";error.textContent=op.error;card.append(error);}
    if(op.input.kind==="create")this.text(card,op.candidate??"","ocm-inline-file-new");
    else if(op.input.kind==="move"){
      if(op.baseline?.kind==="attachment"){
        const meta=card.ownerDocument.createElement("span");meta.className="ocm-inline-file-meta";
        meta.textContent=`${op.baseline.size.toLocaleString()} B`;card.append(meta);
      }
      for(const link of op.links){
        const label=card.ownerDocument.createElement("div");label.className="ocm-inline-link-path";label.textContent=link.snapshot.path;card.append(label);
        this.changes(card,link.snapshot.text??"",link.candidate);
      }
    }else if(op.input.kind==="trash"){
      const meta=card.ownerDocument.createElement("span");meta.className="ocm-inline-file-meta";
      meta.textContent=`${op.baseline?.size.toLocaleString()??0} B`;card.append(meta);
      if(op.references.length){const links=card.ownerDocument.createElement("div");links.className="ocm-inline-file-meta";links.textContent=op.references.join(" · ");card.append(links);}
      if(op.baseline?.text){const details=card.ownerDocument.createElement("details");const summary=details.ownerDocument.createElement("summary");summary.textContent="原文";details.append(summary);this.text(details,op.baseline.text,"ocm-inline-file-old");card.append(details);}
    }else if(op.input.kind==="edit"){
      for(const h of op.hunks){
        if(h.decision!=="pending")continue;
        const block=card.ownerDocument.createElement("div");block.className="ocm-inline-file-edit";card.append(block);
        this.text(block,op.baseline?.text?.slice(h.start,h.end)??"","ocm-inline-file-old");
        this.text(block,h.replacement,"ocm-inline-file-new");
        const actions=block.ownerDocument.createElement("div");actions.className="ocm-inline-file-actions";block.append(actions);
        this.button(actions,"接受",()=>this.decideHunk(p.id,op.id,h.id,"accepted"),!!op.error);
        this.button(actions,"拒绝",()=>this.decideHunk(p.id,op.id,h.id,"rejected"));
      }
    }
    if(op.input.kind!=="edit"&&pending){
      const actions=card.ownerDocument.createElement("div");actions.className="ocm-inline-file-actions";card.append(actions);
      this.button(actions,"接受",()=>this.engine.decide(p.id,op.id,"accepted"),!!op.error);
      this.button(actions,"拒绝",()=>this.engine.decide(p.id,op.id,"rejected"));
    }else if(!pending){
      const result=card.ownerDocument.createElement("span");result.className="ocm-inline-file-meta";
      result.textContent=op.restored?"已恢复":op.input.kind==="edit"?op.hunks.every(h=>h.decision==="rejected")?"已拒绝":"已应用":op.decision==="rejected"?"已拒绝":"已应用";
      card.append(result);
    }
  }

  async open(id?:string,filePath?:string):Promise<boolean>{
    const p=id?this.engine.get(id):this.proposals().find(p=>p.operations.some(op=>this.engine.pending(op)))??this.proposals()[0];
    if(!p){new Notice("没有候选修改");return false;}
    const available=this.app.vault.getMarkdownFiles().map(f=>f.path);
    const target=filePath&&available.includes(filePath)?filePath:pickReviewHost(p,available,this.preferredContext());
    if(!target){new Notice("请打开一篇笔记以审阅候选修改");return false;}
    const file=this.app.vault.getFileByPath(target);if(!file)return false;
    this.pauseContext();
    let leaf=this.app.workspace.getLeavesOfType("markdown").find(l=>l.view instanceof MarkdownView&&l.view.file?.path===target);
    if(!leaf)leaf=this.app.workspace.getLeaf("tab");
    await leaf.loadIfDeferred();
    if(!(leaf.view instanceof MarkdownView)||leaf.view.file?.path!==target||leaf.view.getMode()!=="source")await leaf.openFile(file,{active:true,state:{mode:"source"}});
    this.selected=p.id;this.hostPath=target;
    await this.app.workspace.revealLeaf(leaf);this.refresh();
    const edit=p.operations.find(op=>op.input.kind==="edit"&&op.input.path===target&&this.engine.pending(op));
    if(edit?.baseline?.text){
      const editor=(leaf.view as MarkdownView).editor;
      const at=editor.offsetToPos(firstPendingOffset(edit.baseline.text,edit.hunks));
      editor.scrollIntoView({from:at,to:at},true);
    }else requestAnimationFrame(()=>{
      const scroller=leaf.view.containerEl.querySelector<HTMLElement>(".cm-scroller");
      if(scroller)scroller.scrollTop=0;
    });
    return true;
  }
  close(){for(const view of this.views)view.dom.closest(".markdown-source-view")?.parentElement?.querySelector(".ocm-inline-toolbar")?.remove();this.views.clear();}
}

class FileOperationsWidget extends WidgetType {
  constructor(private owner:InlineReview,private proposal:Proposal){super();}
  eq(){return false;}
  toDOM(view:EditorView){
    const root=view.dom.ownerDocument.createElement("div");root.className="ocm-inline-block ocm-inline-files";root.contentEditable="false";
    for(const op of this.proposal.operations)if(op.input.kind!=="edit"||!op.input.path.endsWith(".md"))this.owner.renderOperation(root,this.proposal,op);
    return root;
  }
  ignoreEvent(){return true;}
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
