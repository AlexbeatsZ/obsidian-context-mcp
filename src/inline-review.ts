import { App, Component, MarkdownRenderer, MarkdownView, Notice, editorInfoField, setIcon, setTooltip } from "obsidian";
import { EditorState, StateEffect, StateField, type ChangeSet, type Extension, type Range } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, WidgetType, type DecorationSet } from "@codemirror/view";
import type { ReviewEngine, Proposal, PreparedOperation } from "./engine";
import { arrivalAction, changedLinePairs, firstPendingOffset, inlineHunks, lineCount, pickReviewHost, wordRanges, type InlineHunk, type WordRanges } from "./inline-model";

const refreshInline=StateEffect.define<null>();
interface Model {proposal:Proposal;operation:PreparedOperation;hunks:InlineHunk[];}
interface ButtonSpec {label:string;icon?:string;tooltip?:string;cls?:string;disabled?:boolean;confirm?:string;action:()=>Promise<unknown>;}
const RECENT_COMPLETED=10;

function el<K extends keyof HTMLElementTagNameMap>(parent:HTMLElement,tag:K,cls?:string,text?:string){
  const node=parent.ownerDocument.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;parent.append(node);return node;
}

export class InlineReview {
  selected:string|null=null;
  hostPath:string|null=null;
  busy=false;
  // Hunk or file card currently showing source instead of rendered Markdown.
  sourceKey:string|null=null;
  private confirming:string|null=null;
  private dismissed=new Set<string>();
  // Proposals that arrived while another one was under review, oldest first.
  private queue:string[]=[];
  private views=new Set<EditorView>();
  private cursor=new Map<EditorView,number>();
  private decisionScroll=new Map<EditorView,StateEffect<unknown>>();
  private scheduled=false;
  constructor(readonly app:App,readonly engine:ReviewEngine,private pauseContext:()=>void,private preferredContext:()=>string|null,readonly report:(where:string,error:unknown)=>void=()=>{}){}

  private proposals(){return [...this.engine.proposals.values()].sort((a,b)=>b.created_at.localeCompare(a.created_at));}
  private pendingProposal(p:Proposal){return p.operations.some(op=>this.engine.pending(op));}
  private proposalFor(state:EditorState):Proposal|null {
    const path=state.field(editorInfoField,false)?.file?.path;if(!path?.endsWith(".md"))return null;
    if(this.hostPath===path&&this.selected){const explicit=this.engine.proposals.get(this.selected);if(explicit)return explicit;}
    return this.proposals().find(p=>!this.dismissed.has(p.id)&&p.operations.some(op=>op.input.kind==="edit"&&op.input.path===path&&this.engine.pending(op)))??null;
  }
  model(state:EditorState):Model|null {
    const path=state.field(editorInfoField,false)?.file?.path;
    const proposal=this.proposalFor(state);if(!proposal||!path)return null;
    const operation=proposal.operations.find(op=>op.input.kind==="edit"&&op.input.path===path&&this.engine.pending(op));
    return operation?{proposal,operation,hunks:inlineHunks(operation,state.doc.toString())}:null;
  }
  private extraOperations(p:Proposal){return p.operations.filter(op=>op.input.kind!=="edit"||!op.input.path.endsWith(".md"));}
  private counts(p:Proposal){
    let pending=0,accepted=0,rejected=0;
    for(const op of p.operations){
      const decisions=op.input.kind==="edit"?op.hunks.map(h=>h.decision):[op.decision];
      for(const d of decisions){if(op.restored)continue;if(d==="pending")pending++;else if(d==="accepted")accepted++;else rejected++;}
    }
    return {pending,accepted,rejected};
  }
  private queued(except?:string){
    this.queue=this.queue.filter(id=>{const q=this.engine.proposals.get(id);return !!q&&this.pendingProposal(q);});
    return this.queue.filter(id=>id!==except);
  }
  // Pending proposals in visible editors, with the note each one is shown in.
  private shownPending(){
    const shown=new Map<string,string>();
    for(const view of this.views){
      if(!view.dom.isConnected||!view.dom.offsetParent)continue;
      const p=this.proposalFor(view.state),path=view.state.field(editorInfoField,false)?.file?.path;
      if(p&&path&&this.pendingProposal(p)&&!shown.has(p.id))shown.set(p.id,path);
    }
    return shown;
  }
  async announce(id:string){
    const p=this.engine.proposals.get(id);if(!p)return;
    const shown=this.shownPending();
    const action=arrivalAction(id,[...shown.keys()]);
    if(action==="open"){await this.open(id);return;}
    if(action==="queue"){
      // Pin what is on screen so a newer proposal for the same note cannot replace it.
      if(!this.selected){const [first]=shown;this.selected=first[0];this.hostPath=first[1];}
      if(!this.queue.includes(id))this.queue.push(id);
      new Notice(`新的候选提案「${p.title}」已排队，审完当前提案后会自动打开。`,6000);
    }
    this.refresh();
  }
  private undoable(p:Proposal){return p.operations.some(op=>op.recovery_ids.length&&!op.restored);}

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
      update(update:{docChanged:boolean;changes:ChangeSet;transactions:readonly {effects:readonly StateEffect<unknown>[]}[]}){
        try{
          const snapshot=owner.decisionScroll.get(this.view);
          if(snapshot&&update.docChanged){const mapped=snapshot.map(update.changes);if(mapped)owner.decisionScroll.set(this.view,mapped);else owner.decisionScroll.delete(this.view);}
        }catch(error){owner.decisionScroll.delete(this.view);owner.report("scroll snapshot",error);}
        // Also rebuild a bar that is missing (not yet mounted, or removed by Obsidian).
        if(update.docChanged||update.transactions.some(tr=>tr.effects.some(e=>e.is(refreshInline)))||!this.bar?.isConnected)this.render();
      }
      // A throw here would make CodeMirror disable this plugin for the editor's lifetime.
      render(){
        try{this.draw();}catch(error){this.bar?.remove();this.bar=null;owner.report("review bar",error);}
      }
      draw(){
        this.bar?.remove();this.bar=null;
        const host=this.view.dom.closest(".markdown-source-view")?.parentElement;
        const p=owner.proposalFor(this.view.state);if(!p||!host)return;
        const bar=host.ownerDocument.createElement("div");bar.className="ocm-review-bar";this.bar=bar;
        owner.renderToolbar(bar,this.view,p);
        host.insertBefore(bar,host.firstChild);
      }
      destroy(){owner.views.delete(this.view);owner.cursor.delete(this.view);owner.decisionScroll.delete(this.view);this.bar?.remove();}
    });
    const keepDecisionScroll=EditorState.transactionExtender.of(tr=>{
      if(!tr.docChanged)return null;
      const view=[...owner.views].find(view=>view.state===tr.startState);
      const mapped=view&&owner.decisionScroll.get(view)?.map(tr.changes);
      return mapped?{effects:mapped}:null;
    });
    // Like Live Preview: clicking back into the note hides candidate source again.
    const backToRendered=EditorView.domEventHandlers({mousedown:()=>{if(owner.sourceKey){owner.sourceKey=null;owner.refresh();}return false;}});
    return [field,toolbar,keepDecisionScroll,backToRendered];
  }

  private renderToolbar(bar:HTMLElement,view:EditorView,p:Proposal){
    const path=view.state.field(editorInfoField,false)?.file?.path??"";
    const row=el(bar,"div","ocm-review-row");
    const icon=el(row,"span","ocm-review-icon");setIcon(icon,"git-compare-arrows");
    const picker=el(row,"select","dropdown ocm-review-select");setTooltip(picker,"切换候选提案");
    const pending=this.proposals().filter(x=>this.pendingProposal(x));
    const listed=[...pending,...this.proposals().filter(x=>!this.pendingProposal(x)).slice(0,RECENT_COMPLETED)];
    if(!listed.includes(p))listed.push(p);
    for(const proposal of listed){
      const option=el(picker,"option",undefined,this.pendingProposal(proposal)?proposal.title:`${proposal.title}（已处理）`);option.value=proposal.id;
    }
    picker.value=p.id;picker.onchange=()=>void this.open(picker.value);
    const files=p.operations.filter(op=>op.input.kind==="edit"&&op.input.path.endsWith(".md"));
    if(files.length>1){
      const filePicker=el(row,"select","dropdown ocm-review-select");setTooltip(filePicker,"切换本提案涉及的笔记");
      for(const op of files){const option=el(filePicker,"option",undefined,`${op.input.path.split("/").pop()}${this.engine.pending(op)?"":" ✓"}`);option.value=op.input.path;}
      filePicker.value=path;filePicker.onchange=()=>void this.open(p.id,filePicker.value);
    }
    const model=this.model(view.state);
    if(model?.hunks.length){
      const added=model.hunks.reduce((n,h)=>n+lineCount(h.replacement),0);
      const removed=model.hunks.reduce((n,h)=>n+lineCount(view.state.doc.sliceString(h.from,h.to)),0);
      const stat=el(row,"span","ocm-review-stat");setTooltip(stat,"本笔记待审阅的新增 / 删除行数");
      el(stat,"span","ocm-stat-add",`+${added}`);el(stat,"span","ocm-stat-del",`−${removed}`);
      const nav=el(row,"span","ocm-review-nav");
      const current=Math.min(this.cursor.get(view)??-1,model.hunks.length-1);
      this.iconButton(nav,"chevron-up","上一处修改",()=>this.navigate(view,-1));
      el(nav,"span","ocm-review-index",`${current<0?"–":current+1} / ${model.hunks.length}`);
      this.iconButton(nav,"chevron-down","下一处修改",()=>this.navigate(view,1));
    }
    const queued=this.queued(p.id);
    if(queued.length){
      const titles=queued.map(id=>`「${this.engine.proposals.get(id)!.title}」`).join("、");
      this.button(row,{label:`新提案 ${queued.length}`,icon:"inbox",cls:"ocm-btn-queue",
        tooltip:`排队中：${titles}。点击打开最早的一个，当前提案保留，可从下拉框切回。`,action:()=>this.open(queued[0])});
    }
    const {pending:left,accepted,rejected}=this.counts(p);
    el(row,"span","ocm-review-progress",left?`${left} 处待审${accepted?` · 已接受 ${accepted}`:""}${rejected?` · 已拒绝 ${rejected}`:""}`:"已全部处理");
    el(row,"span","ocm-review-spacer");
    const actions=el(row,"span","ocm-review-actions");
    const blocked=!!p.recovery_error||p.operations.some(op=>this.engine.pending(op)&&!!op.error);
    if(this.undoable(p))this.button(actions,{label:"撤销已接受",icon:"undo-2",cls:"ocm-btn-ghost",confirm:`undo:${p.id}`,
      tooltip:"把本提案已写入笔记的修改还原回提案前，并结束本提案（剩余候选一并作废）。你之后在别处的编辑会保留。",action:()=>this.engine.recover(p.id)});
    if(left){
      const some=accepted+rejected>0;
      this.button(actions,{label:some?"拒绝其余":"全部拒绝",icon:"x",tooltip:"丢弃所有尚未处理的候选，不改动笔记；已接受的修改保持不变。",action:()=>this.engine.decideAll(p.id,"rejected")});
      this.button(actions,{label:some?"接受其余":"全部接受",icon:"check-check",cls:"mod-cta",disabled:blocked,
        tooltip:blocked?"有候选处于冲突状态，处理冲突后才能批量接受。":"把所有尚未处理的候选写入笔记。",action:()=>this.engine.decideAll(p.id,"accepted")});
    }
    this.iconButton(actions,"x-circle","关闭审阅（候选保留，可从状态栏「笔记 MCP」重新打开）",async()=>this.dismiss(p.id));
    this.renderBanner(bar,p,path);
  }
  private renderBanner(bar:HTMLElement,p:Proposal,path:string){
    const conflicts=p.operations.filter(op=>this.engine.pending(op)&&op.error);
    if(!conflicts.length&&!p.recovery_error)return;
    const banner=el(bar,"div","ocm-review-banner");
    const icon=el(banner,"span","ocm-review-banner-icon");setIcon(icon,"alert-triangle");
    const text=el(banner,"span","ocm-review-banner-text");
    if(p.recovery_error)text.textContent=`撤销只完成了一部分：${p.recovery_error}`;
    else if(conflicts.some(op=>op.stale&&op.input.path===path))text.textContent="你改动了候选所在的行，剩余候选已隐藏。撤销这些改动（Ctrl+Z）后候选会自动回来，也可以直接放弃剩余候选。";
    else text.textContent=conflicts.map(op=>op.error).join("；");
    if(conflicts.length)this.button(banner,{label:"放弃剩余候选",icon:"trash-2",tooltip:"拒绝所有尚未处理的候选，不改动笔记。",action:()=>this.engine.decideAll(p.id,"rejected")});
  }

  private decorations(state:EditorState){
    const proposal=this.proposalFor(state);if(!proposal)return Decoration.none;
    const path=state.field(editorInfoField,false)?.file?.path??"";
    const ranges:Range<Decoration>[]=[];
    if(this.hostPath===path&&this.extraOperations(proposal).length)
      ranges.push(Decoration.widget({widget:new FileOperationsWidget(this,proposal,path,this.cardSignature(proposal)),block:true,side:-1}).range(0));
    const model=this.model(state);
    if(model)model.hunks.forEach((h,index)=>{
      const oldText=state.doc.sliceString(h.from,h.to);
      const words=wordRanges(oldText.replace(/\n$/,""),h.replacement.replace(/\n$/,""));
      if(h.to>h.from){
        const last=state.doc.lineAt(Math.max(h.from,h.to-1));
        for(let line=state.doc.lineAt(h.from).number;line<=last.number;line++)ranges.push(Decoration.line({class:"ocm-line-removed"}).range(state.doc.line(line).from));
        for(const [a,b] of words?.removed??[])if(b>a)ranges.push(Decoration.mark({class:"ocm-word-removed"}).range(h.from+a,h.from+b));
      }
      const at=h.to>h.from?state.doc.lineAt(h.to-1).to:h.from;
      const key=`${model.proposal.id}:${model.operation.id}:${h.id}`;
      ranges.push(Decoration.widget({widget:new IncomingWidget(this,model.proposal.id,model.operation.id,h,path,words,index,model.hunks.length,this.sourceKey===key),block:true,side:h.to>h.from||at===state.doc.length?1:-1}).range(at));
    });
    return Decoration.set(ranges,true);
  }
  private cardSignature(p:Proposal){
    return JSON.stringify([this.sourceKey,p.recovery_error,p.operations.map(op=>[op.decision,op.error,op.restored,op.hunks.map(h=>h.decision)])]);
  }

  private navigate(view:EditorView,step:number){
    const model=this.model(view.state);if(!model?.hunks.length)return Promise.resolve();
    const n=model.hunks.length,current=this.cursor.get(view)??(step>0?-1:0);
    const next=((current+step)%n+n)%n;this.cursor.set(view,next);
    view.dispatch({effects:[EditorView.scrollIntoView(model.hunks[next].from,{y:"center"}),refreshInline.of(null)]});
    return Promise.resolve();
  }
  // Commands that work without the review bar, for the note in the active editor.
  private activeNote(){
    const view=this.app.workspace.getActiveViewOfType(MarkdownView),path=view?.file?.path;
    const cm=(view?.editor as unknown as {cm?:EditorView}|undefined)?.cm;
    const shown=cm?this.proposalFor(cm.state):null;
    const p=shown&&this.pendingProposal(shown)?shown:path?this.proposals().find(x=>x.operations.some(op=>op.input.kind==="edit"&&op.input.path===path&&this.engine.pending(op))):undefined;
    return p&&path?{proposal:p,path}:null;
  }
  decideActive(decision:"accepted"|"rejected",checking:boolean){
    const active=this.activeNote();if(!active)return false;
    if(!checking)void this.run(()=>this.engine.decideAll(active.proposal.id,decision));
    return true;
  }
  showActive(checking:boolean){
    const active=this.activeNote();if(!active)return false;
    if(!checking)void this.open(active.proposal.id,active.path);
    return true;
  }
  showSource(key:string){if(this.sourceKey!==key){this.sourceKey=key;this.refresh();}}
  private dismiss(id:string){
    this.dismissed.add(id);if(this.selected===id){this.selected=null;this.hostPath=null;}
    this.refresh();
  }

  button(parent:HTMLElement,spec:ButtonSpec){
    const button=el(parent,"button",`ocm-btn${spec.cls?" "+spec.cls:""}`);button.type="button";
    const confirming=!!spec.confirm&&this.confirming===spec.confirm;
    if(spec.icon){const icon=el(button,"span","ocm-btn-icon");setIcon(icon,spec.icon);}
    el(button,"span","ocm-btn-label",confirming?"再点一次确认":spec.label);
    if(confirming)button.classList.add("mod-warning");
    if(spec.tooltip)setTooltip(button,spec.tooltip);
    button.disabled=this.busy||!!spec.disabled;
    button.addEventListener("mousedown",e=>e.preventDefault());
    button.onclick=e=>{
      e.stopPropagation();
      if(spec.confirm&&!confirming){
        this.confirming=spec.confirm;this.refresh();
        window.setTimeout(()=>{if(this.confirming===spec.confirm){this.confirming=null;this.refresh();}},4000);
        return;
      }
      this.confirming=null;void this.run(spec.action);
    };
    return button;
  }
  private iconButton(parent:HTMLElement,icon:string,tooltip:string,action:()=>Promise<unknown>){
    const button=el(parent,"button","clickable-icon ocm-icon-btn");button.type="button";setIcon(button,icon);setTooltip(button,tooltip);button.setAttribute("aria-label",tooltip);
    button.addEventListener("mousedown",e=>e.preventDefault());
    button.onclick=e=>{e.stopPropagation();void action();};
    return button;
  }
  decideHunk(proposal:string,operation:string,hunk:string,decision:"accepted"|"rejected"){
    return this.engine.decide(proposal,operation,decision,hunk);
  }
  private setBusy(busy:boolean){this.busy=busy;for(const view of this.views)view.dom.classList.toggle("ocm-review-busy",busy);}
  private async run(action:()=>Promise<unknown>){
    if(this.busy)return;
    for(const view of this.views)this.decisionScroll.set(view,view.scrollSnapshot());
    this.setBusy(true);this.refresh();
    try{await action();}catch(error){new Notice((error as Error).message,8000);}finally{
      const p=this.selected?this.engine.proposals.get(this.selected):null;
      const finished=!!p&&!this.pendingProposal(p);
      if(finished){this.selected=null;this.hostPath=null;}
      this.setBusy(false);this.refresh();
      const next=finished?this.queued()[0]:undefined;
      if(next)void this.open(next).catch(e=>new Notice(`无法打开审阅：${(e as Error).message}`,8000));
    }
  }
  refresh(){
    if(this.scheduled)return;this.scheduled=true;
    queueMicrotask(()=>{
      this.scheduled=false;
      for(const view of this.views){
        const snapshot=this.decisionScroll.get(view);
        view.dispatch({effects:snapshot?[refreshInline.of(null),snapshot]:refreshInline.of(null)});
      }
      if(!this.busy)this.decisionScroll.clear();
    });
  }

  // Rendered like Live Preview; a click shows the source, clicking the note hides it.
  renderMarkdown(parent:HTMLElement,text:string,sourcePath:string,key:string,component:Component,cls:string,words?:[number,number][]){
    const body=el(parent,"div",`ocm-diff-body ${cls}`);
    if(this.sourceKey===key||!sourcePath.endsWith(".md")){
      body.classList.add("is-source");
      const source=el(body,"div","ocm-diff-source");
      let at=0;
      for(const [a,b] of words??[]){if(a>at)source.append(text.slice(at,a));el(source,"span",cls==="ocm-diff-add"?"ocm-word-added":"ocm-word-removed",text.slice(a,b));at=b;}
      source.append(text.slice(at));
      return body;
    }
    const rendered=el(body,"div","ocm-diff-rendered markdown-rendered");
    MarkdownRenderer.render(this.app,text,rendered,sourcePath,component).catch(error=>this.report("markdown render",error));
    setTooltip(body,"点击查看源码",{delay:600});
    body.addEventListener("click",e=>{if(!(e.target instanceof Element&&e.target.closest("a")))this.showSource(key);});
    return body;
  }
  private lines(parent:HTMLElement,before:string,after:string){
    for(const pair of changedLinePairs(before,after)){
      const words=wordRanges(pair.oldText,pair.newText);
      if(pair.oldText)this.plain(parent,pair.oldText,"ocm-diff-del",words?.removed);
      if(pair.newText)this.plain(parent,pair.newText,"ocm-diff-add",words?.added);
    }
  }
  private plain(parent:HTMLElement,text:string,cls:string,words?:[number,number][]){
    const body=el(parent,"div",`ocm-diff-body is-source ${cls}`);const source=el(body,"div","ocm-diff-source");
    let at=0;const value=text.replace(/\n$/,"");
    for(const [a,b] of words??[]){if(a>=value.length)break;if(a>at)source.append(value.slice(at,a));el(source,"span",cls==="ocm-diff-add"?"ocm-word-added":"ocm-word-removed",value.slice(a,Math.min(b,value.length)));at=b;}
    if(at<value.length)source.append(value.slice(at));
  }
  renderOperation(parent:HTMLElement,p:Proposal,op:PreparedOperation,component:Component){
    const card=el(parent,"section",`ocm-op-card ocm-op-${op.input.kind}`);
    const heading=el(card,"div","ocm-op-head");
    const badge=el(heading,"span","ocm-op-badge",{edit:"编辑",create:"新建",move:"移动",trash:"删除"}[op.input.kind]);
    badge.dataset.kind=op.input.kind;
    el(heading,"span","ocm-op-path",op.input.path);
    if(op.input.kind==="move"){const arrow=el(heading,"span","ocm-op-arrow");setIcon(arrow,"arrow-right");el(heading,"span","ocm-op-path",op.input.to);}
    const pending=this.engine.pending(op);
    if(op.error){const error=el(card,"div","ocm-op-error");const icon=el(error,"span");setIcon(icon,"alert-triangle");error.append(op.error);}
    const key=`${p.id}:${op.id}`;
    if(op.input.kind==="create")this.renderMarkdown(card,op.candidate??"",op.input.path,key,component,"ocm-diff-add");
    else if(op.input.kind==="move"){
      if(op.baseline?.kind==="attachment")el(card,"div","ocm-op-meta",`${op.baseline.size.toLocaleString()} B`);
      if(op.links.length)el(card,"div","ocm-op-meta",`同时更新 ${op.links.length} 篇笔记中的链接`);
      for(const link of op.links){el(card,"div","ocm-op-sub",link.snapshot.path);this.lines(card,link.snapshot.text??"",link.candidate);}
    }else if(op.input.kind==="trash"){
      el(card,"div","ocm-op-meta",`${op.baseline?.size.toLocaleString()??0} B · 移到系统回收站`);
      if(op.references.length)el(card,"div","ocm-op-meta",`仍被引用：${op.references.join(" · ")}`);
      if(op.baseline?.text){const details=el(card,"details","ocm-op-details");el(details,"summary",undefined,"查看原文");this.plain(details,op.baseline.text,"ocm-diff-del");}
    }else if(op.input.kind==="edit"){
      for(const h of op.hunks){
        if(h.decision!=="pending")continue;
        const before=op.baseline?.text?.slice(h.start,h.end)??"";
        const words=wordRanges(before,h.replacement);
        if(before)this.plain(card,before,"ocm-diff-del",words?.removed);
        if(h.replacement)this.plain(card,h.replacement,"ocm-diff-add",words?.added);
        const actions=el(card,"div","ocm-hunk-actions");
        this.hunkButtons(actions,()=>this.decideHunk(p.id,op.id,h.id,"accepted"),()=>this.decideHunk(p.id,op.id,h.id,"rejected"),!!op.error);
      }
    }
    if(op.input.kind!=="edit"&&pending){
      const actions=el(card,"div","ocm-hunk-actions");
      this.hunkButtons(actions,()=>this.engine.decide(p.id,op.id,"accepted"),()=>this.engine.decide(p.id,op.id,"rejected"),!!op.error);
    }else if(!pending){
      const done=op.restored?"已撤销":op.input.kind==="edit"?op.hunks.every(h=>h.decision==="rejected")?"已拒绝":"已接受":op.decision==="rejected"?"已拒绝":"已接受";
      el(heading,"span","ocm-op-state",done);
    }
  }
  hunkButtons(parent:HTMLElement,accept:()=>Promise<unknown>,reject:()=>Promise<unknown>,blocked=false){
    const group=el(parent,"span","ocm-hunk-group");
    this.button(group,{label:"接受",icon:"check",cls:"ocm-accept",disabled:blocked,tooltip:"把这处修改写入笔记",action:accept});
    this.button(group,{label:"拒绝",icon:"x",cls:"ocm-reject",tooltip:"丢弃这处修改，笔记不变",action:reject});
  }

  async open(id?:string,filePath?:string):Promise<boolean>{
    const p=id?this.engine.get(id):this.proposals().find(p=>this.pendingProposal(p))??this.proposals()[0];
    if(!p){new Notice("没有候选修改");return false;}
    this.dismissed.delete(p.id);this.queue=this.queue.filter(id=>id!==p.id);
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
  close(){for(const view of this.views)view.dom.closest(".markdown-source-view")?.parentElement?.querySelector(".ocm-review-bar")?.remove();this.views.clear();this.decisionScroll.clear();}
}

const components=new WeakMap<HTMLElement,Component>();
function mount(dom:HTMLElement){const component=new Component();component.load();components.set(dom,component);return component;}
function unmount(dom:HTMLElement){components.get(dom)?.unload();components.delete(dom);}

class FileOperationsWidget extends WidgetType {
  constructor(private owner:InlineReview,private proposal:Proposal,private path:string,private signature:string){super();}
  eq(other:FileOperationsWidget){return other.proposal.id===this.proposal.id&&other.path===this.path&&other.signature===this.signature;}
  toDOM(view:EditorView){
    const root=view.dom.ownerDocument.createElement("div");root.className="ocm-inline-files";root.contentEditable="false";
    const component=mount(root);
    try{for(const op of this.proposal.operations)if(op.input.kind!=="edit"||!op.input.path.endsWith(".md"))this.owner.renderOperation(root,this.proposal,op,component);}
    catch(error){this.owner.report("file operations",error);}
    return root;
  }
  destroy(dom:HTMLElement){unmount(dom);}
  ignoreEvent(){return true;}
}

class IncomingWidget extends WidgetType {
  constructor(private owner:InlineReview,private proposal:string,private operation:string,private hunk:InlineHunk,private path:string,private words:WordRanges|null,private index:number,private total:number,private source:boolean){super();}
  private get key(){return `${this.proposal}:${this.operation}:${this.hunk.id}`;}
  eq(other:IncomingWidget){
    return this.key===other.key&&this.hunk.replacement===other.hunk.replacement&&this.path===other.path&&this.index===other.index&&this.total===other.total&&this.source===other.source&&JSON.stringify(this.words)===JSON.stringify(other.words);
  }
  toDOM(view:EditorView){
    const root=view.dom.ownerDocument.createElement("div");root.className="ocm-hunk";root.setAttribute("data-hunk",this.hunk.id);root.contentEditable="false";
    const component=mount(root);
    try{
      const text=this.hunk.replacement.replace(/\n$/,"");
      if(text)this.owner.renderMarkdown(root,text,this.path,this.key,component,"ocm-diff-add",this.words?.added);
      const actions=el(root,"div","ocm-hunk-actions");
      el(actions,"span","ocm-hunk-index",text?`${this.index+1} / ${this.total}`:`${this.index+1} / ${this.total} · 删除 ${lineCount(view.state.doc.sliceString(this.hunk.from,this.hunk.to))} 行`);
      this.owner.hunkButtons(actions,()=>this.owner.decideHunk(this.proposal,this.operation,this.hunk.id,"accepted"),()=>this.owner.decideHunk(this.proposal,this.operation,this.hunk.id,"rejected"));
    }catch(error){this.owner.report("candidate block",error);}
    return root;
  }
  destroy(dom:HTMLElement){unmount(dom);}
  ignoreEvent(){return true;}
}
