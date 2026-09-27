import { materialize, type Hunk } from "./core";
import type { PreparedOperation } from "./engine";

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
