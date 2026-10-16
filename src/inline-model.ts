import { rebaseHunks, type Hunk } from "./core";
import { diffLines, diffWordsWithSpace } from "diff";
import type { PreparedOperation, Proposal } from "./engine";

export interface InlineHunk { id:string; from:number; to:number; replacement:string; }
// CodeMirror normalizes line breaks, while stored baselines retain their bytes.
export const cmText=(text:string)=>text.replace(/\r\n/g,"\n");
export function inlineHunks(op:PreparedOperation,doc:string):InlineHunk[] {
  if(op.input.kind!=="edit"||op.restored||op.error||op.baseline?.text===undefined)return [];
  const baseline=op.baseline.text;
  const normalized=op.hunks.map(h=>({...h,start:cmText(baseline.slice(0,h.start)).length,end:cmText(baseline.slice(0,h.end)).length,replacement:cmText(h.replacement)}));
  // Edits outside pending lines move the blocks; edits on them hide the blocks.
  const placed=rebaseHunks(cmText(baseline),normalized,doc);
  return placed?placed.filter(h=>h.decision==="pending").map(h=>({id:h.id,from:h.start,to:h.end,replacement:h.replacement})):[];
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

export interface WordRanges {removed:[number,number][];added:[number,number][];}
const segmenter=typeof Intl!=="undefined"&&"Segmenter" in Intl?new Intl.Segmenter("zh",{granularity:"word"}):undefined;
// Intra-line highlights; omitted when the blocks share too little to help.
export function wordRanges(before:string,after:string):WordRanges|null {
  if(!before||!after||before.length+after.length>20000)return null;
  const parts=diffWordsWithSpace(before,after,segmenter?{intlSegmenter:segmenter}:{});
  const output:WordRanges={removed:[],added:[]};let a=0,b=0,same=0;
  for(const part of parts){
    const n=part.value.length;
    if(part.removed){output.removed.push([a,a+n]);a+=n;}
    else if(part.added){output.added.push([b,b+n]);b+=n;}
    else{a+=n;b+=n;if(part.value.trim())same+=n;}
  }
  return same>=Math.max(before.length,after.length)*0.3?output:null;
}
export function lineCount(text:string){return text?text.replace(/\n$/,"").split("\n").length:0;}
