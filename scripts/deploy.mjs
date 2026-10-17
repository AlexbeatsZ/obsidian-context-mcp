import fs from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
const project=path.resolve(import.meta.dirname,'..');
const {values,positionals}=parseArgs({allowPositionals:true,options:{vault:{type:'string'},'vault-id':{type:'string'},help:{type:'boolean'}}});
if(values.help){console.log('npm run setup -- --vault <vault-path> [--vault-id notes]\nOne project directory pairs with one vault. Existing pairing and recovery state are preserved.');process.exit(0);}
const vault=values.vault??positionals[0];
if(!vault||positionals.length>(values.vault?0:1))throw new Error('Usage: npm run setup -- --vault <vault-path> [--vault-id notes]');
const root=await fs.realpath(vault);
const obsidian=path.join(root,'.obsidian');
if(!(await fs.stat(obsidian)).isDirectory())throw new Error('Open this vault in Obsidian first (standard .obsidian config folder required).');
const id='obsidian-context-mcp';const local=path.join(project,'.local');const configFile=path.join(local,'config.json');
let previous;
try{previous=JSON.parse(await fs.readFile(configFile,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
const vaultId=values['vault-id']??previous?.vault??'notes';
if(!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(vaultId))throw new Error('vault-id must be 1-64 lowercase letters, digits, _ or -.');
if(previous){
  const oldRoot=await fs.realpath(previous.root);
  const same=process.platform==='win32'?oldRoot.toLowerCase()===root.toLowerCase():oldRoot===root;
  if(!same||previous.vault!==vaultId)throw new Error('This project is already paired with another vault/identity. Use a separate project directory; keep .local for recovery.');
}
const assets=['main.js','manifest.json','styles.css'];
for(const name of assets)await fs.access(path.join(project,name));
await fs.access(path.join(project,'dist','mcp.cjs'));
const enabledFile=path.join(obsidian,'community-plugins.json');let enabled=[];
try{enabled=JSON.parse(await fs.readFile(enabledFile,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
if(!Array.isArray(enabled)||enabled.some(x=>typeof x!=='string'))throw new Error('Invalid community-plugins.json; no changes made.');
const target=path.join(obsidian,'plugins',id);const backup=path.join(local,'deployment-backups',new Date().toISOString().replace(/[:.]/g,'-'));
await fs.mkdir(backup,{recursive:true});
await fs.writeFile(path.join(backup,'deployment.json'),JSON.stringify({root,vault:vaultId,previous_config:previous??null},null,2));
await fs.writeFile(path.join(backup,'community-plugins.json'),JSON.stringify(enabled,null,2)+'\n');
for(const name of assets){try{await fs.copyFile(path.join(target,name),path.join(backup,name));}catch(e){if(e.code!=='ENOENT')throw e;}}
await fs.mkdir(target,{recursive:true});
for(const name of assets)await fs.copyFile(path.join(project,name),path.join(target,name));
await fs.writeFile(configFile,JSON.stringify({vault:vaultId,root},null,2)+'\n');
if(!enabled.includes(id)){enabled.push(id);await fs.writeFile(enabledFile,JSON.stringify(enabled,null,2)+'\n');}
console.log(`Deployed ${id} to ${root}.\nIn Obsidian: enable community plugins, set this plugin's local project directory to ${project}, then reload it.\nBackup: ${backup}\nNext: npm run doctor`);
