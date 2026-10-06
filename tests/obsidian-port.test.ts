import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { build } from "esbuild";
import { EditorState, EditorSelection } from "@codemirror/state";
import { revision } from "../src/core";
import { temporary } from "./temp";

const result=await build({stdin:{contents:'export { ObsidianPort } from "./src/obsidian-port"; export { MarkdownView, TFile } from "obsidian";',resolveDir:process.cwd()},bundle:true,write:false,platform:"node",format:"cjs",plugins:[{name:"obsidian-port-api-double",setup(b){
  b.onResolve({filter:/^obsidian$/},()=>({path:"obsidian",namespace:"api-double"}));
  b.onLoad({filter:/.*/,namespace:"api-double"},()=>({contents:'export class App{}; export class TFile { constructor(path){this.path=path;} } export class MarkdownView { constructor(file,editor){this.file=file;this.editor=editor;} getMode(){return "source";} }',loader:"js"}));
}}]});
const compiled:{exports:any}={exports:{}};
new Function("module","exports","require",result.outputFiles[0].text)(compiled,compiled.exports,createRequire(import.meta.url));
const {ObsidianPort,MarkdownView,TFile}=compiled.exports;

async function fixture(t:any,body:string) {
  const root=await temporary(t),file=new TFile("qa.md"),diskPath=path.join(root,file.path);
  await fs.writeFile(diskPath,body);
  const states=[0,1].map(()=>EditorState.create({doc:body,selection:EditorSelection.range(body.indexOf("keep")+4,body.indexOf("keep"))}));
  const transactions:any[][]=[[],[]];
  const views=states.map((_,i)=>new MarkdownView(file,{
    getValue:()=>states[i].doc.toString(),
    offsetToPos:(offset:number)=>{const line=states[i].doc.lineAt(offset);return {line:line.number-1,ch:offset-line.from};},
    transaction:(tx:any)=>{
      transactions[i].push(tx.changes);
      states[i]=states[i].update({changes:tx.changes.map((c:any)=>({from:states[i].doc.line(c.from.line+1).from+c.from.ch,to:states[i].doc.line(c.to.line+1).from+c.to.ch,insert:c.text}))}).state;
    }
  }));
  let beforeProcess=async()=>{};
  const app={workspace:{iterateAllLeaves:(fn:any)=>views.forEach(view=>fn({view}))},vault:{
    getAbstractFileByPath:()=>file,
    read:()=>fs.readFile(diskPath,"utf8"),
    process:async(_:any,callback:any)=>{await beforeProcess();await fs.writeFile(diskPath,callback(await fs.readFile(diskPath,"utf8")));}
  }};
  return {port:new ObsidianPort(app,root),states,transactions,diskPath,setBeforeProcess:(fn:()=>Promise<void>)=>{beforeProcess=fn;}};
}

test("Obsidian write patches every open editor locally while preserving reversed selections",async t=>{
  const body="old\n"+"keep this line\n".repeat(50)+"end\n",f=await fixture(t,body),after=body.replace("old","new expanded\nextra");
  const snapshot=await f.port.write("qa.md",revision(body),after);
  assert.equal(snapshot.revision,revision(after));assert.equal(await fs.readFile(f.diskPath,"utf8"),after);
  for(let i=0;i<2;i++){
    const state=f.states[i],selection=state.selection.main;
    assert.equal(state.doc.toString(),after);
    assert.equal(state.sliceDoc(selection.from,selection.to),"keep");assert.ok(selection.anchor>selection.head);
    assert.ok(f.transactions[i][0].every((c:any)=>c.to.line<2),"unchanged document must not be replaced");
  }
});

test("flushing unchanged source text avoids an editor transaction",async t=>{
  const body="keep\n",f=await fixture(t,body);
  await f.port.write("qa.md",revision(body),body);
  assert.deepEqual(f.transactions,[[],[]]);assert.equal(await fs.readFile(f.diskPath,"utf8"),body);
});

test("Obsidian write still rechecks disk conflicts before touching editor buffers",async t=>{
  const body="keep\n",f=await fixture(t,body);
  f.setBeforeProcess(()=>fs.writeFile(f.diskPath,"manual\n"));
  await assert.rejects(f.port.write("qa.md",revision(body),"candidate\n"),/改变/);
  assert.deepEqual(f.transactions,[[],[]]);assert.equal(await fs.readFile(f.diskPath,"utf8"),"manual\n");
});
