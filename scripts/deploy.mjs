import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
const project=path.resolve(import.meta.dirname,'..');
const vault=process.argv[2];if(!vault)throw new Error('Usage: npm run deploy -- <vault-path>');
const root=await fs.realpath(vault);const id='obsidian-context-mcp';
const target=path.join(root,'.obsidian','plugins',id);const backup=path.join(project,'.local','deployment-backups',new Date().toISOString().replace(/[:.]/g,'-'));
await fs.mkdir(backup,{recursive:true});
for(const name of ['main.js','manifest.json','styles.css']){try{await fs.copyFile(path.join(target,name),path.join(backup,name));}catch(e){if(e.code!=='ENOENT')throw e;}}
const enabledFile=path.join(root,'.obsidian','community-plugins.json');await fs.copyFile(enabledFile,path.join(backup,'community-plugins.json'));
await fs.mkdir(target,{recursive:true});
for(const name of ['main.js','manifest.json','styles.css'])await fs.copyFile(path.join(project,name),path.join(target,name));
await fs.mkdir(path.join(project,'.local'),{recursive:true});
await fs.writeFile(path.join(project,'.local','config.json'),JSON.stringify({vault:'stem',root},null,2));
const enabled=JSON.parse(await fs.readFile(enabledFile,'utf8'));
if(!enabled.includes(id)){enabled.push(id);await fs.writeFile(enabledFile,JSON.stringify(enabled,null,2)+'\n');}
console.log(`Deployed ${id} to ${root}; reload/enable it in Obsidian. Backup: ${backup}`);
