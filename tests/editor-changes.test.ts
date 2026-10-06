import test from "node:test";
import assert from "node:assert/strict";
import { EditorState, EditorSelection } from "@codemirror/state";
import { editorChanges } from "../src/editor-changes";

test("accepting a distant hunk keeps multiple reversed selections on their text",()=>{
  const before="first\n"+"unchanged reading line\n".repeat(80)+"last\n";
  const selected=before.indexOf("reading",before.length/2);
  const state=EditorState.create({doc:before,selection:EditorSelection.create([
    EditorSelection.range(selected+7,selected),EditorSelection.cursor(selected+20)
  ],1),extensions:EditorState.allowMultipleSelections.of(true)});
  const after=before.replace("first","first expanded\nnew line");
  const next=state.update({changes:editorChanges(before,after)}).state;
  assert.equal(next.sliceDoc(next.selection.ranges[0].from,next.selection.ranges[0].to),"reading");
  assert.ok(next.selection.ranges[0].anchor>next.selection.ranges[0].head);
  assert.equal(next.selection.mainIndex,1);
  assert.equal(next.selection.main.head,selected+20+after.length-before.length);
  // The former whole-document replacement sends this cursor to the start.
  assert.equal(state.update({changes:{from:0,to:before.length,insert:after}}).state.selection.main.head,0);
});

test("batch changes preserve an unchanged selection between edits on the same line",()=>{
  const before="old left · keep 😀 here · old right\n",after="new longer left · keep 😀 here · new right\n";
  const from=before.indexOf("keep"),to=before.indexOf(" · old right");
  const state=EditorState.create({doc:before,selection:EditorSelection.range(to,from)});
  const next=state.update({changes:editorChanges(before,after)}).state;
  assert.equal(next.doc.toString(),after);
  assert.equal(next.sliceDoc(next.selection.main.from,next.selection.main.to),"keep 😀 here");
  assert.ok(next.selection.main.anchor>next.selection.main.head);
});

test("local patches preserve exact CRLF, UTF16, insertions, deletions and final newline",()=>{
  for(const [before,after] of [
    ["","😀\r\n"],["删去😀\r\n",""],["甲😀乙\r\n保留\r\n丙\r\n","甲😃乙新增\r\n保留\r\n丙"],
    ["a\nb\nc\n","A\nb\nC\n"],["a\n","a\n"],
  ]) {
    // EditorState normalizes CRLF; apply offsets directly for byte preservation.
    const changes=editorChanges(before,after);
    let result=before;
    for(const change of [...changes].reverse())result=result.slice(0,change.from)+change.insert+result.slice(change.to);
    assert.equal(result,after);
    if(before===after)assert.deepEqual(changes,[]);
  }
});
