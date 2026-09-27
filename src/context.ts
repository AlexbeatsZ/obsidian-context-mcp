import { App, MarkdownView, type MarkdownFileInfo } from "obsidian";
import { randomUUID } from "node:crypto";
import { revision } from "./core";
import type { ContextData } from "./service";
import type { ObsidianPort } from "./obsidian-port";

export class ContextTracker {
  last: {id:string;path:string;mode:string;time:string;selections:ContextData["selections"];cursor:ContextData["cursor"]}|null=null;
  recent:string[]=[];
  private reviewPaused=false;
  constructor(public app:App,public port:ObsidianPort,public vaultId:string){}
  pauseForReview(){this.reviewPaused=true;}
  resumeForUserEdit(){this.reviewPaused=false;}
  capture(info:MarkdownFileInfo) {
    if(this.reviewPaused)return;
    if(!info.file||!info.editor)return;
    const active=this.app.workspace.getActiveViewOfType(MarkdownView);
    if(active?.file?.path!==info.file.path)return;
    if(info instanceof MarkdownView&&info.getMode()!=="source")return;
    const editor=info.editor;
    const point=(p:{line:number;ch:number})=>({line:p.line+1,ch:p.ch});
    const selections=editor.listSelections().filter(s=>s.anchor.line!==s.head.line||s.anchor.ch!==s.head.ch).map(s=>{
      const a=editor.posToOffset(s.anchor),b=editor.posToOffset(s.head);const from=a<=b?s.anchor:s.head,to=a<=b?s.head:s.anchor;
      return {kind:"source" as const,from:point(from),to:point(to),text:editor.getRange(from,to)};
    });
    this.set(info.file.path,"source",selections,point(editor.getCursor()));
  }
  captureLeaf() {
    if(this.reviewPaused)return;
    const view=this.app.workspace.getActiveViewOfType(MarkdownView);if(!view?.file)return;
    if(view.getMode()==="source")this.capture(view);
    else if(this.last?.path!==view.file.path||this.last.mode!=="preview")this.set(view.file.path,"preview",[],null);
  }
  captureReadingSelection(doc:Document) {
    if(this.reviewPaused)return;
    if(!doc.hasFocus())return;
    const view=this.app.workspace.getActiveViewOfType(MarkdownView);if(!view?.file||view.getMode()!=="preview")return;
    const selection=doc.getSelection();
    if(selection?.anchorNode&&!view.containerEl.contains(selection.anchorNode))return;
    this.set(view.file.path,"preview",selection&&!selection.isCollapsed?[{kind:"rendered",text:selection.toString()}]:[],null);
  }
  private set(p:string,mode:string,selections:ContextData["selections"],cursor:ContextData["cursor"]) {
    this.last={id:randomUUID(),path:p,mode,time:new Date().toISOString(),selections,cursor};
    this.recent=[p,...this.recent.filter(f=>f!==p)].slice(0,15);
  }
  async get(nearby:number):Promise<ContextData> {
    const open:string[]=[];this.app.workspace.iterateAllLeaves(l=>{if(l.view instanceof MarkdownView&&l.view.file)open.push(l.view.file.path);});
    const recent=[...new Set([...this.recent,...this.app.workspace.getLastOpenFiles()])].filter(p=>p.endsWith(".md")&&this.port.exists(p)).slice(0,15);
    const base:ContextData={vault:this.vaultId,context_id:this.last?.id??randomUUID(),captured_at:this.last?.time??new Date().toISOString(),path:null,mode:null,source:this.last?"last_note_snapshot":"no_active_note",revision:null,selections:[],open_notes:[...new Set(open)],recent_notes:recent,linked_notes:[]};
    if(!this.last)return base;
    if(!this.port.exists(this.last.path)){this.last=null;return base;}
    const s=await this.port.read(this.last.path);const lines=s.text!.split("\n");const line=this.last.cursor?.line??this.last.selections[0]?.from?.line??1;
    const start=Math.max(1,line-nearby);const content=lines.slice(start-1,line+nearby).join("\n");
    const cached=this.app.metadataCache.getFileCache(this.port.file(s.path));
    const linked=[...cached?.links??[],...cached?.embeds??[]].map(l=>this.port.resolve(l.link.split("#")[0],s.path)).filter((p):p is string=>!!p);
    return {...base,path:s.path,mode:this.last.mode,revision:s.revision,cursor:this.last.cursor,selections:this.last.selections.map(selection=>({...selection,text:selection.text.slice(0,16384)})),current_line:lines[line-1]?.slice(0,4096),nearby_text:content.slice(0,32768),nearby_start_line:start,linked_notes:[...new Set(linked)].slice(0,30),truncated:content.length>32768||this.last.selections.some(s=>s.text.length>16384)};
  }
}
