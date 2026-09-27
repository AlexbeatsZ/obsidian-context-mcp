import { App, MarkdownView, TFile } from "obsidian";
import fs from "node:fs/promises";
import path from "node:path";
import { assertRealPath, isText, revision, safePath, type Snapshot, type VaultPort } from "./core";
import { fail } from "./protocol";

export class ObsidianPort implements VaultPort {
  constructor(public app:App,public root:string){}
  files() { return this.app.vault.getFiles().filter(f=>{try{safePath(f.path);return true;}catch{return false;}}).map(f=>{
    const c=this.app.metadataCache.getFileCache(f);return {path:f.path,size:f.stat.size,mtime:f.stat.mtime,tags:c?.tags?.map(t=>t.tag),headings:c?.headings?.map(h=>h.heading)};
  }); }
  file(p:string) { const f=this.app.vault.getAbstractFileByPath(safePath(p)); if(!(f instanceof TFile))fail("NOT_FOUND",`${p} 不是可用文件。`);return f; }
  exists(p:string) { const target=safePath(p);return !!this.app.vault.getAbstractFileByPath(target)||this.app.vault.getFiles().some(f=>f.path.toLowerCase()===target.toLowerCase()); }
  resolve(target:string,source:string) { if(!target)return source;return this.app.metadataCache.getFirstLinkpathDest(target,source)?.path??null; }
  editors(p:string) { const result:MarkdownView[]=[];this.app.workspace.iterateAllLeaves(l=>{if(l.view instanceof MarkdownView&&l.view.file?.path===p&&l.view.getMode()==="source")result.push(l.view);});return result; }
  async validate(p:string){await assertRealPath(this.root,p);}
  async read(p:string):Promise<Snapshot> {
    await this.validate(p);const f=this.file(p);const stat=await fs.stat(path.join(this.root,p));
    if(!isText(p))return {path:p,size:stat.size,mtime:stat.mtimeMs,kind:"attachment",revision:`binary:${stat.size}:${stat.mtimeMs}:${stat.ino}`};
    const editors=this.editors(p);const text=editors[0]?.editor.getValue()??await this.app.vault.read(f);
    if(editors.some(v=>v.editor.getValue()!==text))fail("CONFLICT","同一文件的多个编辑缓冲区内容不同，请先保存或关闭重复编辑器。");
    if(text.includes("\0"))fail("UNSUPPORTED_TYPE","该文件包含二进制内容。");
    return {path:p,kind:"text",size:Buffer.byteLength(text),mtime:stat.mtimeMs,text,revision:revision(text)};
  }
  private async parents(p:string) {
    const parts=p.split("/").slice(0,-1);let current="";
    for(const part of parts){current=current?current+"/"+part:part;await this.validate(current);if(!this.app.vault.getAbstractFileByPath(current))await this.app.vault.createFolder(current);}
  }
  async write(p:string,expected:string,text:string):Promise<Snapshot> {
    await this.validate(p);const f=this.file(p);const snapshot=await this.read(p);
    if(snapshot.revision!==expected)fail("CONFLICT",`${p} 已改变。`);
    const disk=await this.app.vault.read(f);const editors=this.editors(p);
    await this.app.vault.process(f,current=>{
      if(current!==disk||editors.some(v=>revision(v.editor.getValue())!==expected))fail("CONFLICT",`${p} 在写入前改变。`);
      if(!editors.length&&revision(current)!==expected)fail("CONFLICT",`${p} 在写入前改变。`);
      for(const view of editors) {
        const old=view.editor.getValue();const end=view.editor.offsetToPos(old.length);
        view.editor.transaction({changes:[{from:{line:0,ch:0},to:end,text}]});
      }
      return text;
    });
    const after=await this.read(p);if(after.revision!==revision(text))fail("CONFLICT",`${p} 在写入后又发生变化，请检查恢复记录。`);return after;
  }
  async create(p:string,text:string) {await this.validate(p);if(this.exists(p))fail("CONFLICT","目标已存在。");await this.parents(p);await this.app.vault.create(p,text);return this.read(p);}
  async move(p:string,to:string,expected:string) {
    await this.validate(p);await this.validate(to);if(this.exists(to))fail("CONFLICT","移动目标已存在。");
    if((await this.read(p)).revision!==expected)fail("CONFLICT","移动源已改变。");await this.parents(to);
    // Flush source buffers so a subsequent autosave cannot recreate the old path.
    const before=await this.read(p);if(before.kind==="text")await this.write(p,expected,before.text!);
    await this.app.vault.rename(this.file(p),to);return this.read(to);
  }
  async trash(p:string,expected:string) {await this.validate(p);if((await this.read(p)).revision!==expected)fail("CONFLICT","删除目标已改变。");await this.app.vault.trash(this.file(p),false);}
  async backup(p:string) {const s=await this.read(p);return s.kind==="text"?Buffer.from(s.text!,"utf8"):new Uint8Array(await this.app.vault.readBinary(this.file(p)));}
  async restore(p:string,bytes:Uint8Array) {
    await this.validate(p);
    if(this.exists(p)){const s=await this.read(p);if(s.kind==="text")await this.write(p,s.revision,Buffer.from(bytes).toString("utf8"));else await this.app.vault.modifyBinary(this.file(p),Uint8Array.from(bytes).buffer);}
    else {await this.parents(p);await this.app.vault.createBinary(p,Uint8Array.from(bytes).buffer);}
  }
}
