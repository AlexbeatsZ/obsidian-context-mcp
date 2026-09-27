import { isText, safePath, type Snapshot, type VaultPort } from "./core";
import { ReviewEngine } from "./engine";
import { fail, schemas, type ToolName } from "./protocol";

export interface ContextData {
  vault:string; context_id:string; captured_at:string; path:string|null;
  mode:string|null; source:string; revision:string|null; cursor?:{line:number;ch:number}|null;
  selections: {text:string;kind:"source"|"rendered";from?:{line:number;ch:number};to?:{line:number;ch:number}}[];
  current_line?:string; nearby_text?:string; nearby_start_line?:number;
  open_notes:string[]; recent_notes:string[]; linked_notes:string[]; truncated?:boolean;
}
export type ContextProvider=(nearby:number)=>Promise<ContextData>;
const MAX_TEXT=32*1024;
export class PluginService {
  constructor(public vault:VaultPort, public engine:ReviewEngine, public context:ContextProvider) {}
  async call(name:string,raw:unknown):Promise<object> {
    if(!Object.hasOwn(schemas,name))fail("UNKNOWN_TOOL","不支持该操作。");
    switch(name as ToolName) {
      case "obsidian_get_context": { const a=schemas.obsidian_get_context.parse(raw); return this.context(a.nearby_lines); }
      case "obsidian_list_files": {
        const a=schemas.obsidian_list_files.parse(raw); const prefix=safePath(a.path,true);
        const files=this.vault.files().filter(f=>(!prefix||f.path===prefix||f.path.startsWith(prefix+"/"))&&(a.type==="all"||(a.type==="text"?isText(f.path):a.type==="attachment"?!isText(f.path):f.path.endsWith(".md")))).sort((a,b)=>a.path.localeCompare(b.path));
        return {vault:this.engine.vaultId,files:files.slice(a.offset,a.offset+a.limit).map(f=>({...f,kind:isText(f.path)?"text":"attachment"})),total:files.length,offset:a.offset,truncated:a.offset+a.limit<files.length,next_offset:a.offset+a.limit<files.length?a.offset+a.limit:null};
      }
      case "obsidian_read_file": {
        const a=schemas.obsidian_read_file.parse(raw); const s=await this.vault.read(safePath(a.path));
        if(s.kind==="attachment")return {vault:this.engine.vaultId,...s,supported_content:false};
        const lines=s.text!.split("\n"); if(a.start_line>lines.length)fail("INVALID_RANGE","起始行超出文件范围。");
        const wanted=lines.slice(a.start_line-1,a.start_line-1+a.line_count); let content=""; let count=0;
        for(const line of wanted) { const addition=(count?"\n":"")+line; if((content.length+addition.length)>MAX_TEXT) { if(!count){content=addition.slice(0,MAX_TEXT);count=1;} break; } content+=addition;count++; }
        const partial=content.length<wanted.slice(0,count).join("\n").length;
        return {vault:this.engine.vaultId,path:s.path,kind:s.kind,revision:s.revision,size:s.size,mtime:s.mtime,content,start_line:a.start_line,end_line:a.start_line+count-1,total_lines:lines.length,truncated:partial||a.start_line-1+count<lines.length,partial_line:partial,next_line:partial?a.start_line:a.start_line+count};
      }
      case "obsidian_search": {
        const a=schemas.obsidian_search.parse(raw); const prefix=safePath(a.path,true); const terms=a.query.toLocaleLowerCase().split(/\s+/u);
        const hits:{path:string;score:number;line:number;snippet:string;revision?:string}[]=[];
        const deadline=Date.now()+15000;let scanned=0;let complete=true;
        for(const f of this.vault.files()) {
          if(prefix&&f.path!==prefix&&!f.path.startsWith(prefix+"/"))continue;
          if(Date.now()>deadline){complete=false;break;}
          const meta=[f.path,...f.headings??[],...f.tags??[]].join(" ").toLocaleLowerCase();
          const s=isText(f.path)?await this.vault.read(f.path):undefined;
          const haystack=meta+"\n"+(s?.text??"").toLocaleLowerCase();scanned++;
          if(!terms.every(t=>haystack.includes(t)))continue;
          const lines=s?.text?.split("\n")??[];const idx=lines.findIndex(l=>terms.some(t=>l.toLocaleLowerCase().includes(t)));
          hits.push({path:f.path,score:terms.reduce((n,t)=>n+(f.path.toLocaleLowerCase().includes(t)?5:meta.includes(t)?3:1),0),line:idx>=0?idx+1:1,snippet:idx>=0?lines.slice(Math.max(0,idx-1),idx+2).join("\n").slice(0,700):f.path,revision:s?.revision});
          if(scanned%25===0)await new Promise(r=>setTimeout(r,0));
        }
        hits.sort((a,b)=>b.score-a.score||a.path.localeCompare(b.path));
        return {vault:this.engine.vaultId,results:hits.slice(0,a.max_results),total_matches:hits.length,scanned_files:scanned,complete,truncated:!complete||hits.length>a.max_results};
      }
      case "obsidian_propose_changes": return this.engine.propose(schemas.obsidian_propose_changes.parse(raw));
      case "obsidian_get_change_status": return this.engine.status(schemas.obsidian_get_change_status.parse(raw).proposal_id);
    }
  }
}
