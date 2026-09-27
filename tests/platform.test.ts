import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { defaultProjectDir, sameVaultRoot } from "../src/platform";
import { temporary } from "./temp";

test("project default follows the host home directory",()=>{
  assert.equal(defaultProjectDir(),path.join(os.homedir(),"Project","Workspaces","obsidian-context-mcp"));
});

test("vault identity accepts aliases but rejects another vault",async t=>{
  const root=await temporary(t);
  const stem=path.join(root,"STEM"),other=path.join(root,"Other");
  await fs.mkdir(stem);await fs.mkdir(other);
  assert.equal(await sameVaultRoot(stem,path.join(root,".","STEM")),true);
  assert.equal(await sameVaultRoot(stem,other),false);
  assert.equal(await sameVaultRoot(stem,path.join(root,"missing")),false);
});

test("portable Tunnel launcher removes credentials before starting MCP",async t=>{
  const root=await temporary(t);
  await fs.mkdir(path.join(root,"scripts"));await fs.mkdir(path.join(root,"dist"));
  await fs.copyFile(path.join(import.meta.dirname,"..","scripts","start-mcp.mjs"),path.join(root,"scripts","start-mcp.mjs"));
  await fs.writeFile(path.join(root,"dist","mcp.cjs"),"process.stdout.write(JSON.stringify({project:process.env.OBSIDIAN_MCP_PROJECT,secret:process.env.CONTROL_PLANE_API_KEY,proxy:process.env.HTTPS_PROXY}))");
  const run=spawnSync(process.execPath,[path.join(root,"scripts","start-mcp.mjs")],{encoding:"utf8",env:{...process.env,CONTROL_PLANE_API_KEY:"test-secret",HTTPS_PROXY:"http://test-proxy"}});
  assert.equal(run.status,0,run.stderr);
  assert.deepEqual(JSON.parse(run.stdout),{project:await fs.realpath(root)});
});
