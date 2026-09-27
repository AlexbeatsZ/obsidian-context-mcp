import path from "node:path";
import { fail } from "../src/protocol";
import { isText, revision, safePath, type Snapshot, type VaultPort } from "../src/core";
export class MemoryVault implements VaultPort {
  root="/vault";data=new Map<string,{bytes:Uint8Array;mtime:number}>();trashFiles=new Map<string,Uint8Array>();writes:string[]=[];failure:string|null=null;
  constructor(files:Record<string,string|Uint8Array>={}){for(const [p,text]of Object.entries(files))this.set(p,text);}
  set(p:string,text:string|Uint8Array){this.data.set(p,{bytes:typeof text==="string"?Buffer.from(text):text,mtime:Date.now()+this.writes.length});}
  files(){return [...this.data].map(([p,v])=>({path:p,size:v.bytes.length,mtime:v.mtime}));}
  exists(p:string){return [...this.data.keys()].some(f=>f.toLowerCase()===p.toLowerCase());}
  async read(p:string):Promise<Snapshot>{const v=this.data.get(p);if(!v)fail("NOT_FOUND",p);const text=Buffer.from(v.bytes).toString("utf8");return {path:p,size:v.bytes.length,mtime:v.mtime,kind:isText(p)?"text":"attachment",revision:isText(p)?revision(text):`binary:${v.mtime}:${v.bytes.length}`,text:isText(p)?text:undefined};}
  resolve(t:string,s:string){if(!t)return s;const candidates=[t,path.posix.normalize(path.posix.join(path.posix.dirname(s),t))];for(const c of candidates)for(const ext of ["",".md"])if(this.data.has(c+ext))return c+ext;return [...this.data.keys()].find(p=>path.posix.basename(p).replace(/\.md$/,"")===t)??null;}
  async validate(p:string){safePath(p);}
  async write(p:string,expected:string,text:string){if(this.failure===p)throw new Error("disk full");if((await this.read(p)).revision!==expected)fail("CONFLICT",p);this.writes.push(p);this.set(p,text);return this.read(p);}
  async create(p:string,text:string){if(this.exists(p))fail("CONFLICT",p);this.writes.push(p);this.set(p,text);return this.read(p);}
  async move(p:string,to:string,expected:string){if(this.exists(to))fail("CONFLICT",to);if((await this.read(p)).revision!==expected)fail("CONFLICT",p);const data=this.data.get(p)!;this.data.delete(p);this.data.set(to,data);this.writes.push(`move:${p}`);return this.read(to);}
  async trash(p:string,expected:string){if((await this.read(p)).revision!==expected)fail("CONFLICT",p);this.trashFiles.set(p,this.data.get(p)!.bytes);this.data.delete(p);this.writes.push(`trash:${p}`);}
  async backup(p:string){return this.data.get(p)!.bytes;}
  async restore(p:string,bytes:Uint8Array,expected:string|null){if(expected===null?this.exists(p):!this.exists(p)||(await this.read(p)).revision!==expected)fail("CONFLICT",p);this.set(p,bytes);}
}
