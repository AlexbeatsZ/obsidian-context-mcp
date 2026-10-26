import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { temporary } from './temp';

test('local launcher override preserves stdio, cwd, exit code and strips credentials',async context=>{
  const root=await temporary(context);
  await fs.mkdir(path.join(root,'scripts'));
  await fs.mkdir(path.join(root,'.local'));
  const launcher=path.join(root,'scripts','start-mcp.mjs');
  await fs.copyFile(new URL('../scripts/start-mcp.mjs',import.meta.url),launcher);
  const entry=path.join(root,'entry.cjs');
  await fs.writeFile(entry,"process.stdout.write(JSON.stringify({cwd:process.cwd(),endpoint:process.env.WEBOBSIDIAN_ENDPOINT_FILE,secret:process.env.OPENAI_ADMIN_KEY,proxy:process.env.HTTPS_PROXY,legacy:process.env.OBSIDIAN_MCP_PROJECT}));process.exitCode=7;");
  await fs.writeFile(path.join(root,'.local','mcp-launcher.json'),JSON.stringify({command:process.execPath,args:[entry],cwd:root,env:{WEBOBSIDIAN_ENDPOINT_FILE:'test-endpoint',OPENAI_ADMIN_KEY:'test-only',HTTPS_PROXY:'test-only'}}));
  const run=spawnSync(process.execPath,[launcher],{encoding:'utf8',env:{...process.env,OBSIDIAN_MCP_PROJECT:'old-project',CONTROL_PLANE_API_KEY:'test-only'}});
  assert.equal(run.status,7,run.stderr);
  const actual=JSON.parse(run.stdout);
  assert.equal(await fs.realpath(actual.cwd),await fs.realpath(root));
  assert.deepEqual(Object.keys(actual),['cwd','endpoint']);
  assert.equal(actual.endpoint,'test-endpoint');
});

test('invalid local override fails closed without leaking configuration',async context=>{
  const root=await temporary(context);
  await fs.mkdir(path.join(root,'scripts'));
  await fs.mkdir(path.join(root,'.local'));
  const launcher=path.join(root,'scripts','start-mcp.mjs');
  await fs.copyFile(new URL('../scripts/start-mcp.mjs',import.meta.url),launcher);
  for(const content of ['{"secret":"do-not-print"',JSON.stringify({command:'relative',args:[],cwd:root,env:{}}),'null']){
    await fs.writeFile(path.join(root,'.local','mcp-launcher.json'),content);
    const run=spawnSync(process.execPath,[launcher],{encoding:'utf8'});
    assert.notEqual(run.status,0);
    assert.equal(run.stdout,'');
    assert.ok(!run.stderr.includes('do-not-print'));
  }
});
