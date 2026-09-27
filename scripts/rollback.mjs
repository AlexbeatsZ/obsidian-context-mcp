import fs from 'node:fs/promises';import path from 'node:path';
const project=path.resolve(import.meta.dirname,'..');const id='obsidian-context-mcp';
const {root}=JSON.parse(await fs.readFile(path.join(project,'.local/config.json'),'utf8'));
const base=path.join(project,'.local','deployment-backups');const name=process.argv[2]??(await fs.readdir(base)).sort()[0];
if(!name||path.basename(name)!==name)throw new Error('Use a deployment backup directory name');
const backup=path.join(base,name);const previous=JSON.parse(await fs.readFile(path.join(backup,'community-plugins.json'),'utf8'));
const enabledFile=path.join(root,'.obsidian','community-plugins.json');const current=JSON.parse(await fs.readFile(enabledFile,'utf8'));
// Change this plugin only; preserve all unrelated settings updated since deploy.
const enabled=current.filter(p=>p!==id);if(previous.includes(id))enabled.push(id);
for(const file of ['main.js','manifest.json','styles.css'])try{await fs.copyFile(path.join(backup,file),path.join(root,'.obsidian','plugins',id,file));}catch(e){if(e.code!=='ENOENT')throw e;}
await fs.writeFile(enabledFile,JSON.stringify(enabled,null,2)+'\n');
console.log('Restored plugin deployment from '+backup+'; reload Obsidian. Local proposal/recovery files retained.');
