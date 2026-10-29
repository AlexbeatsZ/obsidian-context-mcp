import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { unzipSync } from 'fflate';
import { startPluginServer } from '../src/http';
import { ReviewEngine } from '../src/engine';
import { PluginService } from '../src/service';
import { MemoryVault } from './support';
import { temporary } from './temp';

test('desktop release installs and calls real stdio MCP without node_modules; proposals do not write vault',async t=>{
  const root=await temporary(t),project=path.join(root,'desktop with spaces'),vault=path.join(root,'My notes');
  const source=path.resolve(import.meta.dirname,'..');const version=JSON.parse(await fs.readFile(path.join(source,'manifest.json'),'utf8')).version;
  const zip=unzipSync(await fs.readFile(path.join(source,'dist',`obsidian-context-mcp-desktop-${version}.zip`)));
  for(const entry of ['scripts/start-mcp.mjs','scripts/start-mcp.ps1','scripts/manual-start-mcp.ps1']) assert.ok(zip[entry],entry);
  assert.ok(Object.keys(zip).length>15);assert.equal(Object.keys(zip).some(x=>/(^|\/)(\.local|node_modules)(\/|$)/.test(x)),false);
  for(const [name,bytes] of Object.entries(zip)){const file=path.resolve(project,name);assert.ok(file.startsWith(project+path.sep));await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,bytes);}
  await assert.rejects(fs.access(path.join(project,'node_modules')));
  await fs.mkdir(path.join(vault,'.obsidian'),{recursive:true});
  const run=(args:string[])=>new Promise<{code:number|null;stdout:string;stderr:string}>((resolve,reject)=>{
    const child=spawn(process.execPath,args,{cwd:root,windowsHide:true});let stdout='',stderr='';
    const timer=setTimeout(()=>{child.kill();reject(new Error('Release CLI timed out'));},30000);
    child.stdout.on('data',x=>stdout+=x);child.stderr.on('data',x=>stderr+=x);child.on('error',reject);child.on('close',code=>{clearTimeout(timer);resolve({code,stdout,stderr});});
  });
  let result=await run([path.join(project,'scripts','deploy.mjs'),'--vault',vault]);assert.equal(result.code,0,result.stderr);
  const v=new MemoryVault({'MCP-test.md':'Hello portable MCP'});v.root=vault;
  const local=path.join(project,'.local');const engine=new ReviewEngine(v,local,'notes');
  const service=new PluginService(v,engine,async()=>({vault:'notes',context_id:'test',captured_at:new Date().toISOString(),path:'MCP-test.md',mode:'source',source:'last_note_snapshot',revision:(await v.read('MCP-test.md')).revision,selections:[],open_notes:['MCP-test.md'],recent_notes:[],linked_notes:[]}));
  const runtime=await startPluginServer(local,'notes',vault,(n,a)=>service.call(n,a));t.after(()=>runtime.close());
  const cli=path.join(project,'dist','call.cjs');
  result=await run([cli,'list']);assert.equal(result.code,0,result.stderr);assert.equal(JSON.parse(result.stdout).tools.length,6);
  result=await run([cli,'obsidian_get_context']);assert.equal(result.code,0,result.stderr);assert.equal(JSON.parse(result.stdout).path,'MCP-test.md');
  const args=path.join(project,'.local','test-args.json');await fs.writeFile(args,JSON.stringify({request_id:'portable-release-test',operations:[{kind:'create',path:'new.md',content:'candidate only'}]}));
  result=await run([cli,'obsidian_propose_changes',args]);assert.equal(result.code,0,result.stderr);const proposal=JSON.parse(result.stdout);assert.equal(proposal.status,'awaiting_user_review');assert.equal(v.exists('new.md'),false);
  await fs.writeFile(args,JSON.stringify({proposal_id:proposal.proposal_id}));result=await run([cli,'obsidian_get_change_status',args]);assert.equal(result.code,0,result.stderr);assert.equal(JSON.parse(result.stdout).status,'awaiting_user_review');
  result=await run([path.join(project,'scripts','doctor.mjs')]);assert.equal(result.code,0,result.stdout+result.stderr);assert.match(result.stdout,/OK Obsidian plugin reachable/);
});
