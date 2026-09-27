import { materialize, type Hunk } from "./core";
import { diffLines } from "diff";
import type { PreparedOperation, Proposal } from "./engine";

export interface InlineHunk { id:string; from:number; to:number; replacement:string; }
// CodeMirror normalizes line breaks, while stored baselines retain their bytes.
export const cmText=(text:string)=>text.replace(/\r\n/g,"\n");
export function inlineHunks(op:PreparedOperation,doc:string):InlineHunk[] {
  if(op.input.kind!=="edit"||op.restored||op.error||op.baseline?.text===undefined)return [];
  const baseline=op.baseline.text;
  if(cmText(materialize(baseline,op.hunks))!==doc)return [];
  let shift=0;
  const output:InlineHunk[]=[];
  for(const h of op.hunks){
    if(h.decision==="accepted")shift+=cmText(h.replacement).length-cmText(baseline.slice(h.start,h.end)).length;
    else if(h.decision==="pending")output.push({id:h.id,from:cmText(baseline.slice(0,h.start)).length+shift,to:cmText(baseline.slice(0,h.end)).length+shift,replacement:cmText(h.replacement)});
  }
  return output;
}
export function firstPendingOffset(baseline:string,hunks:Hunk[]){
  let shift=0;
  for(const h of hunks){
    if(h.decision==="accepted")shift+=cmText(h.replacement).length-cmText(baseline.slice(h.start,h.end)).length;
    else if(h.decision==="pending")return cmText(baseline.slice(0,h.start)).length+shift;
  }
  return 0;
}

export function pickReviewHost(proposal:Proposal,available:readonly string[],preferred?:string|null):string|null {
  const existing=new Set(available);
  const pendingEdit=proposal.operations.find(op=>op.input.kind==="edit"&&op.input.path.endsWith(".md")&&op.hunks.some(h=>h.decision==="pending")&&existing.has(op.input.path));
  if(pendingEdit)return pendingEdit.input.path;
  const sourceNote=proposal.operations.find(op=>op.input.kind!=="create"&&op.input.path.endsWith(".md")&&existing.has(op.input.path));
  if(sourceNote)return sourceNote.input.path;
  return preferred&&existing.has(preferred)?preferred:available[0]??null;
}

export interface ChangedLines {oldText:string;newText:string;}
export function changedLinePairs(before:string,after:string):ChangedLines[] {
  const output:ChangedLines[]=[];let oldText="",newText="";
  const flush=()=>{if(oldText||newText)output.push({oldText,newText});oldText="";newText="";};
  for(const part of diffLines(before,after)){
    if(part.removed)oldText+=part.value;
    else if(part.added)newText+=part.value;
    else flush();
  }
  flush();return output;
}
