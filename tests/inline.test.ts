import test from "node:test";
import assert from "node:assert/strict";
import { ReviewEngine } from "../src/engine";
import { inlineHunks, firstPendingOffset } from "../src/inline-model";
import { materialize } from "../src/core";
import { MemoryVault } from "./support";
import { temporary } from "./temp";

test("inline ranges follow accepted length changes while rejected blocks retain original positions",async t=>{
  const vault=new MemoryVault({"a.md":"甲😀\n间隔\n乙\n间隔\n丙\n"}),engine=new ReviewEngine(vault,await temporary(t));
  const baseline=(await vault.read("a.md"));
  const p=await engine.propose({request_id:"inline",title:"inline",operations:[{kind:"edit",path:"a.md",base_revision:baseline.revision,edits:[
    {from:{line:1,ch:0},to:{line:1,ch:3},expected_text:"甲😀",replacement:"甲😀扩展\n新行"},
    {from:{line:3,ch:0},to:{line:3,ch:1},expected_text:"乙",replacement:"乙扩展"},
    {from:{line:5,ch:0},to:{line:5,ch:1},expected_text:"丙",replacement:"丙扩展"}]}]});
  const op=engine.get(p.proposal_id).operations[0];
  assert.equal(inlineHunks(op,baseline.text!).length,3);assert.equal(vault.writes.length,0);
  await engine.decide(p.proposal_id,op.id,"accepted","h1");
  let doc=(await vault.read("a.md")).text!;let blocks=inlineHunks(op,doc);
  assert.deepEqual(blocks.map(h=>doc.slice(h.from,h.to)),["乙\n","丙\n"]);
  assert.equal(firstPendingOffset(baseline.text!,op.hunks),blocks[0].from);
  await engine.decide(p.proposal_id,op.id,"rejected","h2");doc=(await vault.read("a.md")).text!;blocks=inlineHunks(op,doc);
  assert.deepEqual(blocks.map(h=>doc.slice(h.from,h.to)),["丙\n"]);
  await engine.decide(p.proposal_id,op.id,"accepted","h3");
  assert.equal((await vault.read("a.md")).text,"甲😀扩展\n新行\n间隔\n乙\n间隔\n丙扩展\n");
  assert.deepEqual(inlineHunks(op,(await vault.read("a.md")).text!),[]);
});

test("inline preview suppresses stale documents and uses normalized CRLF/UTF16 positions",()=>{
  const baseline="甲😀\r\n间隔\r\n乙\r\n";
  const op:any={input:{kind:"edit"},baseline:{text:baseline},hunks:[{id:"h1",start:0,end:5,replacement:"更长😀\r\n额外\r\n",decision:"accepted"},{id:"h2",start:9,end:12,replacement:"乙改\r\n",decision:"pending"}]};
  const doc=materialize(baseline,op.hunks).replace(/\r\n/g,"\n"),blocks=inlineHunks(op,doc);
  assert.equal(doc.slice(blocks[0].from,blocks[0].to),"乙\n");assert.equal(blocks[0].replacement,"乙改\n");
  assert.deepEqual(inlineHunks(op,doc+"手改"),[]);op.error="conflict";assert.deepEqual(inlineHunks(op,doc),[]);
});

test("inline empty-note insertion and deletion remain actionable without candidate bytes in document",()=>{
  const empty:any={input:{kind:"edit"},baseline:{text:""},hunks:[{id:"h1",start:0,end:0,replacement:"新增😀\n",decision:"pending"}]};
  assert.deepEqual(inlineHunks(empty,""),[{id:"h1",from:0,to:0,replacement:"新增😀\n"}]);
  const deletion:any={input:{kind:"edit"},baseline:{text:"删去\n"},hunks:[{id:"h1",start:0,end:3,replacement:"",decision:"pending"}]};
  assert.deepEqual(inlineHunks(deletion,"删去\n"),[{id:"h1",from:0,to:3,replacement:""}]);deletion.restored=true;assert.deepEqual(inlineHunks(deletion,"删去\n"),[]);
});
