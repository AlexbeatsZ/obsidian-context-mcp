import path from "node:path";
import { parser } from "@lezer/markdown";
import type { Snapshot, VaultPort } from "./core";

interface Token { start: number; end: number; target: string; wiki: boolean; }
export function linkTokens(text: string): Token[] {
  // Mask code without changing offsets (including CRLF), then match source links.
  const tree=parser.parse(text),code:{from:number;to:number}[]=[];
  tree.iterate({enter(node){if(["FencedCode","CodeBlock","InlineCode"].includes(node.name)){code.push({from:node.from,to:node.to});return false;}}});
  let masked=text;for(const range of code.reverse())masked=masked.slice(0,range.from)+masked.slice(range.from,range.to).replace(/[^\r\n]/g," ")+masked.slice(range.to);
  const tokens: Token[]=[];
  const wiki=/!?\[\[([^\]\n]+)\]\]/g;
  for (const m of masked.matchAll(wiki)) {
    if((masked.slice(0,m.index).match(/\\+$/)?.[0].length??0)%2)continue;
    const target=m[1].split("|")[0]; const start=m.index!+m[0].indexOf("[[")+2;
    tokens.push({start,end:start+target.length,target,wiki:true});
  }
  const md=/!?\[[^\]\n]*\]\((<[^>\n]+>|(?:\\.|[^\s()])+(?:\([^\n()]*\)(?:\\.|[^\s()])*)*)(?:\s+["'][^\n]*?["'])?\)/g;
  for (const m of masked.matchAll(md)) {
    const raw=m[1]; const target=raw.startsWith("<")?raw.slice(1,-1):raw;
    const start=m.index!+m[0].indexOf("](")+2+(raw.startsWith("<")?1:0);
    tokens.push({start,end:start+target.length,target,wiki:false});
  }
  tree.iterate({enter(node){if(node.name==="URL"&&node.node.parent?.name==="LinkReference"){
    const raw=text.slice(node.from,node.to);const angled=raw.startsWith("<");const target=angled?raw.slice(1,-1):raw;const start=node.from+(angled?1:0);tokens.push({start,end:start+target.length,target,wiki:false});
  }}});
  return tokens.sort((a,b)=>a.start-b.start);
}
export interface LinkChange { snapshot: Snapshot; candidate: string; }
export async function planMoveLinks(vault: VaultPort, from: string, to: string): Promise<LinkChange[]> {
  const changes: LinkChange[]=[];
  for (const f of vault.files().filter(f=>f.path.toLowerCase().endsWith(".md"))) {
    const snapshot=await vault.read(f.path); const base=snapshot.text!; let candidate=base;
    const sourceAfter=f.path===from?to:f.path;
    const replacements: {token:Token; value:string}[]=[];
    for (const token of linkTokens(base)) {
      const hash=token.target.indexOf("#");
      const raw=hash>=0?token.target.slice(0,hash):token.target;
      const fragment=hash>=0?token.target.slice(hash):"";
      if (!raw || /^[a-z][a-z\d+.-]*:/i.test(raw) || raw.startsWith("//")) continue;
      let decoded=raw;
      if (!token.wiki) { try { decoded=decodeURIComponent(raw.replace(/\\([ ()])/g,"$1")); } catch { continue; } }
      const resolved=vault.resolve(decoded,f.path);
      if (!resolved || (resolved!==from && f.path!==from)) continue;
      const destination=resolved===from?to:resolved;
      let value:string;
      if (token.wiki) {
        value=destination.replace(/\.md$/i,"")+fragment;
      } else {
        const relative=path.posix.relative(path.posix.dirname(sourceAfter), destination);
        value=relative.split("/").map(encodeURIComponent).join("/")+fragment;
      }
      if (value!==token.target) replacements.push({token,value});
    }
    for (const {token,value} of replacements.reverse()) candidate=candidate.slice(0,token.start)+value+candidate.slice(token.end);
    if (candidate!==base) changes.push({snapshot,candidate});
  }
  return changes;
}
export async function referencesTo(vault: VaultPort, target: string) {
  const results:string[]=[];
  for (const f of vault.files().filter(f=>f.path.endsWith(".md"))) {
    const s=await vault.read(f.path);
    if (linkTokens(s.text!).some(t=>{let raw=t.target.split("#")[0];if(!t.wiki)try{raw=decodeURIComponent(raw.replace(/\\([ ()])/g,"$1"));}catch{}return vault.resolve(raw,f.path)===target;})) results.push(f.path);
  }
  return results;
}
