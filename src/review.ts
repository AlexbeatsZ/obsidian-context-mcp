import { ItemView, Notice, WorkspaceLeaf } from "obsidian";
import { EditorState } from "@codemirror/state";
import { EditorView, lineNumbers } from "@codemirror/view";
import { MergeView, unifiedMergeView } from "@codemirror/merge";
import { materialize } from "./core";
import type { ReviewEngine, PreparedOperation, Proposal } from "./engine";

export const REVIEW_VIEW="obsidian-context-mcp-review";
export class ReviewView extends ItemView {
  private editors: {destroy():void}[]=[];private selected:string|null=null;private split=false;private busy=false;
  constructor(leaf:WorkspaceLeaf,public engine:ReviewEngine,public project:string){super(leaf);}
  getViewType(){return REVIEW_VIEW;}
  getDisplayText(){return "待审阅修改";}
  getIcon(){return "git-compare-arrows";}
  async onOpen(){this.render();}
  async onClose(){this.destroyEditors();}
  select(id:string){this.selected=id;this.render();}
  private destroyEditors(){for(const e of this.editors)e.destroy();this.editors=[];}
  private button(parent:HTMLElement,label:string,run:()=>Promise<unknown>|void,disabled=false){const b=parent.createEl("button",{text:label});b.disabled=disabled||this.busy;b.addEventListener("click",async()=>{this.busy=true;b.disabled=true;try{await run();}catch(e){new Notice((e as Error).message,8000);}finally{this.busy=false;this.render();}});return b;}
  render(){
    this.destroyEditors();const root=this.contentEl;root.empty();root.addClass("ocm-review");
    const heading=root.createDiv({cls:"ocm-heading"});heading.createEl("h2",{text:"待审阅修改"});heading.createSpan({text:"STEM · 本机已连接",cls:"ocm-connection"});
    const proposals=[...this.engine.proposals.values()].sort((a,b)=>b.created_at.localeCompare(a.created_at));
    if(!proposals.length){root.createEl("p",{text:"在 AI 客户端提出修改后，在这里查看并接受。",cls:"ocm-empty"});return;}
    const picker=root.createEl("select",{attr:{"aria-label":"选择候选修改"}});
    for(const p of proposals)picker.createEl("option",{text:`${p.title} · ${new Date(p.created_at).toLocaleString()}`,value:p.id});
    if(!this.selected||!this.engine.proposals.has(this.selected))this.selected=proposals[0].id;
    picker.value=this.selected;picker.onchange=()=>{this.selected=picker.value;this.render();};
    const p=this.engine.get(this.selected);const bar=root.createDiv({cls:"ocm-toolbar"});
    this.button(bar,"全部接受",()=>this.engine.decideAll(p.id,"accepted"));this.button(bar,"全部拒绝",()=>this.engine.decideAll(p.id,"rejected"));
    this.button(bar,this.split?"统一视图":"双栏视图",()=>{this.split=!this.split;});
    this.button(bar,"恢复已应用修改",()=>this.engine.recover(p.id),!p.operations.some(o=>o.recovery_ids.length));
    root.createDiv({text:"接受后立即生效；关联链接与移动操作一起处理。",cls:"ocm-guidance"});
    for(const op of p.operations)this.renderOperation(root,p,op);
  }
  private renderOperation(root:HTMLElement,p:Proposal,op:PreparedOperation) {
    const card=root.createDiv({cls:"ocm-operation"});const header=card.createDiv({cls:"ocm-file-header"});
    const label={edit:"编辑",create:"新建",move:"移动 / 重命名",trash:"放入回收站"}[op.input.kind];
    header.createSpan({text:label,cls:"ocm-kind"});header.createEl("strong",{text:op.input.path});
    if(op.input.kind==="move")header.createSpan({text:`→ ${op.input.to}`});
    const pending=this.engine.pending(op);
    if(op.error)card.createDiv({text:op.error,cls:"ocm-error"});
    const actions=card.createDiv({cls:"ocm-actions"});
    this.button(actions,"接受",()=>this.engine.decide(p.id,op.id,"accepted"),!pending||!!op.error);
    this.button(actions,"拒绝",()=>this.engine.decide(p.id,op.id,"rejected"),!pending);
    if(op.input.kind==="edit") {
      const base=materialize(op.baseline!.text!,op.hunks);const candidate=materialize(op.baseline!.text!,op.hunks,true);this.diff(card,base,candidate);
      for(const h of op.hunks){const row=card.createDiv({cls:"ocm-hunk"});const line=op.baseline!.text!.slice(0,h.start).split("\n").length;row.createSpan({text:`第 ${line} 行 · ${h.decision==="accepted"?"已接受":h.decision==="rejected"?"已拒绝":"待审阅"}`});
        row.createEl("pre",{text:op.baseline!.text!.slice(h.start,h.end).slice(0,240),cls:"ocm-old"});row.createEl("pre",{text:h.replacement.slice(0,240),cls:"ocm-new"});
        this.button(row,"接受此处",()=>this.engine.decide(p.id,op.id,"accepted",h.id),h.decision!=="pending"||!!op.error);this.button(row,"拒绝此处",()=>this.engine.decide(p.id,op.id,"rejected",h.id),h.decision!=="pending");
      }
    }else if(op.input.kind==="create")this.diff(card,"",op.candidate!);
    else if(op.input.kind==="move"){
      if(!op.links.length)card.createEl("p",{text:"没有需要更新的笔记链接。"});
      for(const link of op.links){card.createEl("h4",{text:link.snapshot.path});this.diff(card,link.snapshot.text!,link.candidate);}
    }else {card.createEl("p",{text:`${op.baseline!.kind==="attachment"?"附件":"文本文件"} · ${op.baseline!.size.toLocaleString()} 字节。文件将移入本地回收站。`});
      if(op.baseline?.text)card.createEl("pre",{text:op.baseline.text.slice(0,2000)});
      card.createEl("p",{text:op.references.length?`引用此文件的笔记：${op.references.join("、")}`:"没有找到引用此文件的笔记。"});
    }
    if(!pending)card.createDiv({text:op.input.kind==="edit"?"该文件已完成审阅。":op.decision==="accepted"?"已应用":"已拒绝",cls:"ocm-result"});
  }
  private diff(parent:HTMLElement,base:string,candidate:string){
    const mount=parent.createDiv({cls:"ocm-diff"});const extensions=[EditorState.readOnly.of(true),EditorView.editable.of(false),lineNumbers(),EditorView.lineWrapping];
    if(this.split)this.editors.push(new MergeView({parent:mount,a:{doc:base,extensions},b:{doc:candidate,extensions},highlightChanges:true,collapseUnchanged:{margin:3,minSize:8}}));
    else this.editors.push(new EditorView({parent:mount,doc:candidate,extensions:[...extensions,unifiedMergeView({original:base,mergeControls:false,highlightChanges:true,collapseUnchanged:{margin:3,minSize:8}})]}));
  }
}
