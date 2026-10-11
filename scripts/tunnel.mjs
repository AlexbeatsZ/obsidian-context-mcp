import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execFileAsync = promisify(execFile);
const project=path.resolve(import.meta.dirname,'..');
const local=path.join(project,'.local');const action=process.argv[2];
const config=JSON.parse(await fs.readFile(path.join(local,'tunnel.json'),'utf8'));
if(!['start','status','stop','ensure'].includes(action))throw new Error('Use start, status, stop or ensure');
const pauseFile=path.join(local,'tunnel-auto-paused');
const logFile=path.join(local,'tunnel-supervisor.log');
const isPaused=async()=>{try{await fs.access(pauseFile);return true;}catch(error){if(error.code==='ENOENT')return false;throw error;}};
const log=async(event,details={})=>{
  const entry=JSON.stringify({time:new Date().toISOString(),event,...details})+'\n';
  try{
    const stat=await fs.stat(logFile).catch(error=>{if(error.code==='ENOENT')return null;throw error;});
    if(stat?.size>512*1024){await fs.rm(logFile+'.1',{force:true});await fs.rename(logFile,logFile+'.1');}
    await fs.appendFile(logFile,entry);
  }catch{console.error('Could not write the project-local Tunnel supervisor log.');}
};
const readEnv=text=>Object.fromEntries(text.split(/\r?\n/).filter(l=>/^\s*[\w]+\s*=/.test(l)).map(l=>{const i=l.indexOf('=');let v=l.slice(i+1).trim();if((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'")))v=v.slice(1,-1);return [l.slice(0,i).trim(),v];}));
const source=readEnv(await fs.readFile(config.credential_source,'utf8'));
const env={...process.env,CONTROL_PLANE_API_KEY:source.OPENAI_API_KEY};delete env.OPENAI_API_KEY;
if(source.TUNNEL_HTTP_PROXY)env.HTTPS_PROXY=source.TUNNEL_HTTP_PROXY;
const common=['--profile-dir',path.join(local,'tunnel').replaceAll('\\','/')];
let args;
if(action==='start'||action==='ensure'){
  if(!config.tunnel_id)throw new Error('Configure the dedicated tunnel_id after reviewing the new connection.');
  const executable=process.execPath.replaceAll('\\','/');
  const launcher=path.join(project,'scripts','start-mcp.mjs').replaceAll('\\','/');
  if(executable.includes('"')||launcher.includes('"'))throw new Error('Invalid MCP launcher path');
  const command=`"${executable}" "${launcher}"`;
  args=['runtimes','connect','--alias',config.alias,'--profile',config.alias,'--tunnel-id',config.tunnel_id,'--mcp-command',command,...common];
}else args=['runtimes',action==='status'?'status':'disconnect',config.alias];
if(action==='ensure'){
  try{
    if(await isPaused()){
      console.log(JSON.stringify({state:'paused'}));
    }else{
      const {stdout}=await execFileAsync(config.client,['runtimes','status',config.alias,'--json'],{cwd:project,env,windowsHide:true,timeout:15000,maxBuffer:256*1024});
      const status=JSON.parse(stdout);
      // A running poller owns reconnects. Never restart it merely for a transient
      // readiness failure, and never start another runtime from an ambiguous status.
      if(status.alias!==config.alias||typeof status.process_running!=='boolean')throw new Error('Invalid runtime status');
      if(status.process_running){
        console.log(JSON.stringify({state:status.runtime_state,process_running:true,ready:status.ready===true}));
      }else if(await isPaused()){
        console.log(JSON.stringify({state:'paused'}));
      }else{
        await log('reconnect_started',{previous_state:status.runtime_state});
        await execFileAsync(config.client,args,{cwd:project,env,windowsHide:true,timeout:40000,maxBuffer:256*1024});
        await log('reconnect_completed');
        console.log(JSON.stringify({state:'reconnected'}));
      }
    }
  }catch(error){
    // Do not persist raw CLI output: it may contain credential source details.
    await log('check_failed',{code:typeof error.code==='string'?error.code:'runtime_check_failed',timed_out:error.killed===true});
    console.error('Tunnel automatic check failed; the next scheduled check will retry.');
    process.exitCode=1;
  }
}else{
  if(action==='stop')await fs.writeFile(pauseFile,new Date().toISOString()+'\n');
  if(action==='start')await fs.rm(pauseFile,{force:true});
  const child=spawn(config.client,args,{cwd:project,env,windowsHide:true,stdio:'inherit'});
  child.on('error',e=>{console.error(e.message);process.exitCode=1;});child.on('exit',code=>{process.exitCode=code??1;});
}
