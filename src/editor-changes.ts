import { diffChars } from "diff";
import { makeHunks } from "./core";

export interface EditorOffsetChange {from:number;to:number;insert:string;}

// Keep unchanged text in place so CodeMirror can map cursors, selections,
// folds and viewport anchors through a decision rather than a document reset.
export function editorChanges(before:string,after:string):EditorOffsetChange[] {
  const changes:EditorOffsetChange[]=[];
  for(const hunk of makeHunks(before,after)) {
    const parts=diffChars(before.slice(hunk.start,hunk.end),hunk.replacement,{timeout:100});
    if(!parts){changes.push({from:hunk.start,to:hunk.end,insert:hunk.replacement});continue;}
    let offset=hunk.start;
    let change:EditorOffsetChange|undefined;
    for(const part of parts) {
      if(!part.added&&!part.removed){change=undefined;offset+=part.value.length;continue;}
      if(!change){change={from:offset,to:offset,insert:""};changes.push(change);}
      if(part.removed){offset+=part.value.length;change.to=offset;}
      else change.insert+=part.value;
    }
  }
  return changes;
}
