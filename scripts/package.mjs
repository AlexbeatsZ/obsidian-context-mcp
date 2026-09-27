import fs from 'node:fs/promises';
import path from 'node:path';
import { zipSync } from 'fflate';

const project=path.resolve(import.meta.dirname,'..');
const manifest=JSON.parse(await fs.readFile(path.join(project,'manifest.json'),'utf8'));
const files=Object.fromEntries(await Promise.all(['main.js','manifest.json','styles.css'].map(async name=>[name,new Uint8Array(await fs.readFile(path.join(project,name)))])));
const archive=path.join(project,'dist',`obsidian-context-mcp-${manifest.version}.zip`);
await fs.mkdir(path.dirname(archive),{recursive:true});
await fs.writeFile(archive,zipSync(files,{level:6}));
console.log(archive);
