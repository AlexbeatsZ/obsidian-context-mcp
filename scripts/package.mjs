import fs from 'node:fs/promises';
import path from 'node:path';
import { zipSync } from 'fflate';
import { writeNotices } from './notices.mjs';

const project=path.resolve(import.meta.dirname,'..');
await writeNotices(project);
const manifest=JSON.parse(await fs.readFile(path.join(project,'manifest.json'),'utf8'));
const files=Object.fromEntries(await Promise.all(['main.js','manifest.json','styles.css','LICENSE','THIRD_PARTY_NOTICES.md'].map(async name=>[name,new Uint8Array(await fs.readFile(path.join(project,name)))])));
const archive=path.join(project,'dist',`obsidian-context-mcp-${manifest.version}.zip`);
await fs.mkdir(path.dirname(archive),{recursive:true});
await fs.writeFile(archive,zipSync(files,{level:6}));
console.log(archive);
// Explicit allowlist: never distribute .local, credentials, notes or deployment backups.
const portableNames=['main.js','manifest.json','styles.css','dist/mcp.cjs','dist/call.cjs','README.md','LICENSE','THIRD_PARTY_NOTICES.md','docs/DEPLOYMENT.zh-CN.md','docs/DISTRIBUTION.md','docs/API.md','docs/PRIVACY.md','scripts/deploy.mjs','scripts/rollback.mjs','scripts/doctor.mjs','scripts/configure-tunnel.mjs','scripts/tunnel.mjs','scripts/start-mcp.mjs','scripts/tunnel-startup.ps1','examples/tunnel.json','examples/tunnel.env.example'];
const portable=Object.fromEntries(await Promise.all(portableNames.map(async name=>[name,new Uint8Array(await fs.readFile(path.join(project,name)))])));
portable['README.md']=new TextEncoder().encode(new TextDecoder().decode(portable['README.md']).replaceAll('(docs/ACCEPTANCE.md)','(https://github.com/AlexbeatsZ/obsidian-context-mcp/blob/main/docs/ACCEPTANCE.md)').replaceAll('(docs/OPERATIONS.md)','(https://github.com/AlexbeatsZ/obsidian-context-mcp/blob/main/docs/OPERATIONS.md)'));
const pkg=JSON.parse(await fs.readFile(path.join(project,'package.json'),'utf8'));
const scripts=Object.fromEntries(Object.entries(pkg.scripts).filter(([name])=>['setup','deploy','doctor','mcp','tools','context','rollback'].includes(name)||name.startsWith('tunnel:')));
portable['package.json']=new TextEncoder().encode(JSON.stringify({name:pkg.name,version:pkg.version,private:true,type:'module',license:pkg.license,engines:pkg.engines,scripts},null,2)+'\n');
const desktopArchive=path.join(project,'dist',`obsidian-context-mcp-desktop-${manifest.version}.zip`);
await fs.writeFile(desktopArchive,zipSync(portable,{level:6}));
console.log(desktopArchive);
