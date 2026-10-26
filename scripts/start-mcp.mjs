import path from 'node:path';
import fs from 'node:fs/promises';
import { spawn } from 'node:child_process';

const project=path.resolve(import.meta.dirname,'..');
let target;
try { target=JSON.parse(await fs.readFile(path.join(project,'.local','mcp-launcher.json'),'utf8')); }
catch(error) { if(error.code!=='ENOENT')throw new Error('Cannot read local MCP launcher configuration.'); }
if(target!==undefined&&(!target||typeof target!=='object'||Array.isArray(target)
  ||Object.keys(target).some(key=>!['command','args','cwd','env'].includes(key))
  ||typeof target.command!=='string'||!path.isAbsolute(target.command)
  ||typeof target.cwd!=='string'||!path.isAbsolute(target.cwd)
  ||!Array.isArray(target.args)||!target.args.every(value=>typeof value==='string')
  ||!target.env||typeof target.env!=='object'||Array.isArray(target.env)
  ||!Object.values(target.env).every(value=>typeof value==='string')))throw new Error('Invalid local MCP launcher configuration.');
const clean=Object.fromEntries(Object.entries({...process.env,...target?.env}).filter(([key])=>!/^(CONTROL_PLANE_API_KEY|OPENAI_API_KEY|OPENAI_ADMIN_KEY|TUNNEL_HTTP_PROXY|HTTPS?_PROXY|ALL_PROXY|NO_PROXY|OBSIDIAN_MCP_PROJECT)$/i.test(key)));
if(!target)clean.OBSIDIAN_MCP_PROJECT=project;
const child=spawn(target?.command??process.execPath,target?.args??[path.join(project,'dist','mcp.cjs')],{cwd:target?.cwd??project,env:clean,stdio:'inherit',windowsHide:true});
child.on('error',error=>{console.error(error.message);process.exitCode=1;});
child.on('exit',(code,signal)=>{process.exitCode=code??(signal?1:0);});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{if(!child.killed)child.kill(signal);});
