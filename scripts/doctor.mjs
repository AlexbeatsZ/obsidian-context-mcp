import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const project=path.resolve(import.meta.dirname,'..');let failed=false;
const report=(ok,label)=>{console.log(`${ok?'OK':'FAIL'} ${label}`);if(!ok)failed=true;};
report(Number(process.versions.node.split('.')[0])>=22,'Node.js 22+');
for(const name of ['main.js','manifest.json','styles.css','dist/mcp.cjs','dist/call.cjs']){
  try{await fs.access(path.join(project,name));report(true,name);}catch{report(false,`${name} missing; use a desktop release or npm run build`);}
}
try{
  const config=JSON.parse(await fs.readFile(path.join(project,'.local','config.json'),'utf8'));
  await fs.access(path.join(config.root,'.obsidian','plugins','obsidian-context-mcp','manifest.json'));
  report(true,'Vault configured and plugin installed');
}catch{report(false,'Run npm run setup -- --vault <vault-path> first');}
if(!failed){
  for(const [tool,label] of [['list','MCP handshake: six tools'],['obsidian_get_context','Obsidian plugin reachable']]){
    const run=spawnSync(process.execPath,[path.join(project,'dist','call.cjs'),tool],{cwd:project,encoding:'utf8',timeout:30000,windowsHide:true});
    try{
      const result=JSON.parse(run.stdout??'');
      report(run.status===0&&(tool!=='list'||result.tools?.length===6),label+(result.error?` (${result.error.code})`:''));
    }catch{report(false,`${label}; check plugin settings/local project directory, then reload Obsidian`);}
  }
}
console.log('This check does not test ChatGPT, Tunnel permissions or local review buttons. It does not write notes.');process.exitCode=failed?1:0;
