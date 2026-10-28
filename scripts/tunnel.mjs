import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
const project=path.resolve(import.meta.dirname,'..');
const local=path.join(project,'.local');const action=process.argv[2];
if(!['start','status','stop','restart'].includes(action))throw new Error('Use start, restart, status or stop');
let config;
try{config=JSON.parse(await fs.readFile(path.join(local,'tunnel.json'),'utf8'));}catch(e){if(e.code==='ENOENT')throw new Error('Run npm run tunnel:configure first. See docs/DEPLOYMENT.zh-CN.md.');throw e;}
if(!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(config.alias??''))throw new Error('Invalid Tunnel alias.');
const readEnv=text=>Object.fromEntries(text.split(/\r?\n/).filter(l=>/^\s*[\w]+\s*=/.test(l)).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'")))v=v.slice(1,-1);return [l.slice(0,i).trim(),v];}));
const env={...process.env};
for(const key of Object.keys(env))if(/^(CONTROL_PLANE_API_KEY|OPENAI_API_KEY|OPENAI_ADMIN_KEY)$/i.test(key))delete env[key];
const common=['--profile-dir',path.join(local,'tunnel').replaceAll('\\','/')];
const runClient=args=>new Promise(resolve=>{
  const child=spawn(config.client,args,{cwd:project,env,windowsHide:true,stdio:'inherit'});
  child.on('error',e=>{console.error(e.message);resolve(1);});
  child.on('exit',code=>resolve(code??1));
});
if(action==='start'||action==='restart'){
  if(!config.tunnel_id)throw new Error('Configure the dedicated tunnel_id after reviewing the new connection.');
  await fs.access(path.join(project,'scripts','start-mcp.mjs'));
  const source=readEnv((await fs.readFile(config.credential_source,'utf8')).replace(/^\uFEFF/,''));
  const key=source.CONTROL_PLANE_API_KEY??source.OPENAI_API_KEY;
  if(!key||/REPLACE|YOUR_|\.\.\./i.test(key))throw new Error('Set a runtime CONTROL_PLANE_API_KEY in the configured local env file before starting.');
  env.CONTROL_PLANE_API_KEY=key;
  if(source.TUNNEL_HTTP_PROXY)env.HTTPS_PROXY=source.TUNNEL_HTTP_PROXY;
  const executable=process.execPath.replaceAll('\\','/');
  const launcher=path.join(project,'scripts','start-mcp.mjs').replaceAll('\\','/');
  if(executable.includes('"')||launcher.includes('"'))throw new Error('Invalid MCP launcher path');
  const command=`"${executable}" "${launcher}"`;
  if(action==='restart'){
    const stopped=await runClient(['runtimes','disconnect',config.alias]);
    if(stopped!==0)throw new Error('Tunnel stop failed; refusing to start another runtime.');
  }
  process.exitCode=await runClient(['runtimes','connect','--alias',config.alias,'--profile',config.alias,'--tunnel-id',config.tunnel_id,'--mcp-command',command,...common]);
}else{
  process.exitCode=await runClient(['runtimes',action==='status'?'status':'disconnect',config.alias]);
}
