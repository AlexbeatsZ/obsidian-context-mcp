import path from 'node:path';
import { spawn } from 'node:child_process';

const project=path.resolve(import.meta.dirname,'..');
const clean=Object.fromEntries(Object.entries(process.env).filter(([key])=>!/^(CONTROL_PLANE_API_KEY|OPENAI_API_KEY|OPENAI_ADMIN_KEY|TUNNEL_HTTP_PROXY|HTTPS?_PROXY|ALL_PROXY|NO_PROXY)$/i.test(key)));
clean.OBSIDIAN_MCP_PROJECT=project;
const child=spawn(process.execPath,[path.join(project,'dist','mcp.cjs')],{cwd:project,env:clean,stdio:'inherit',windowsHide:true});
child.on('error',error=>{console.error(error.message);process.exitCode=1;});
child.on('exit',(code,signal)=>{process.exitCode=code??(signal?1:0);});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{if(!child.killed)child.kill(signal);});
