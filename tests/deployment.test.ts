import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { temporary } from './temp';

async function fixture(t:any){
  const root=await temporary(t),project=path.join(root,'project with spaces'),vault=path.join(root,'My notes');
  await fs.mkdir(path.join(project,'scripts'),{recursive:true});await fs.mkdir(path.join(project,'dist'));
  await fs.mkdir(path.join(vault,'.obsidian'),{recursive:true});
  for(const name of ['deploy.mjs','rollback.mjs','configure-tunnel.mjs','tunnel.mjs'])await fs.copyFile(path.join(import.meta.dirname,'..','scripts',name),path.join(project,'scripts',name));
  for(const name of ['main.js','manifest.json','styles.css','dist/mcp.cjs'])await fs.writeFile(path.join(project,name),'fixture-v1');
  const run=(script:string,...args:string[])=>spawnSync(process.execPath,[path.join(project,'scripts',script),...args],{encoding:'utf8',cwd:project,windowsHide:true});
  return {root,project,vault,run};
}
test('fresh vault deployment works without community-plugins.json and preserves existing identity on update',async t=>{
  const f=await fixture(t);let run=f.run('deploy.mjs','--vault',f.vault);assert.equal(run.status,0,run.stderr);
  const config=path.join(f.project,'.local','config.json');const initial=JSON.parse(await fs.readFile(config,'utf8'));assert.equal(initial.vault,'notes');
  const plugins=path.join(f.vault,'.obsidian','community-plugins.json');await fs.writeFile(plugins,JSON.stringify(['unrelated','obsidian-context-mcp']));
  initial.vault='stem';await fs.writeFile(config,JSON.stringify(initial));
  run=f.run('deploy.mjs',f.vault);assert.equal(run.status,0,run.stderr);assert.equal(JSON.parse(await fs.readFile(config,'utf8')).vault,'stem');assert.deepEqual(JSON.parse(await fs.readFile(plugins,'utf8')),['unrelated','obsidian-context-mcp']);
  const other=path.join(f.root,'Other');await fs.mkdir(path.join(other,'.obsidian'),{recursive:true});
  run=f.run('deploy.mjs',other);assert.notEqual(run.status,0);assert.match(run.stderr,/already paired/);assert.equal(JSON.parse(await fs.readFile(config,'utf8')).root,initial.root);
  await assert.rejects(fs.access(path.join(other,'.obsidian','plugins')));
});
test('invalid enabled-plugin list prevents deployment changes',async t=>{
  const f=await fixture(t);await fs.writeFile(path.join(f.vault,'.obsidian','community-plugins.json'),'{}');
  const run=f.run('deploy.mjs',f.vault);assert.notEqual(run.status,0);await assert.rejects(fs.access(path.join(f.project,'.local')));await assert.rejects(fs.access(path.join(f.vault,'.obsidian','plugins')));
});
test('rollback defaults to the most recent backup and keeps unrelated plugin changes',async t=>{
  const f=await fixture(t);assert.equal(f.run('deploy.mjs',f.vault).status,0);
  await fs.writeFile(path.join(f.project,'main.js'),'fixture-v2');assert.equal(f.run('deploy.mjs',f.vault).status,0);
  const plugins=path.join(f.vault,'.obsidian','community-plugins.json');await fs.writeFile(plugins,JSON.stringify(['obsidian-context-mcp','later-plugin']));
  const run=f.run('rollback.mjs');assert.equal(run.status,0,run.stderr);
  assert.equal(await fs.readFile(path.join(f.vault,'.obsidian','plugins','obsidian-context-mcp','main.js'),'utf8'),'fixture-v1');assert.deepEqual(JSON.parse(await fs.readFile(plugins,'utf8')),['later-plugin','obsidian-context-mcp']);
});
test('Tunnel configure is host local, refuses overwrite and start rejects placeholder keys without launching a client',async t=>{
  const f=await fixture(t);const args=['--client',process.execPath,'--tunnel-id','tunnel_ab12_0123456789abcdef0123456789abcdef'];
  let run=f.run('configure-tunnel.mjs',...args);assert.equal(run.status,0,run.stderr);
  const config=path.join(f.project,'.local','tunnel.json'),saved=await fs.readFile(config,'utf8');
  run=f.run('configure-tunnel.mjs',...args);assert.notEqual(run.status,0);assert.equal(await fs.readFile(config,'utf8'),saved);
  assert.equal(f.run('deploy.mjs',f.vault).status,0);run=f.run('tunnel.mjs','start');assert.notEqual(run.status,0);assert.match(run.stderr,/runtime CONTROL_PLANE_API_KEY/);
});
