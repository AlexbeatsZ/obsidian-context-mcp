import fs from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
const project=path.resolve(import.meta.dirname,'..');
const {values}=parseArgs({options:{client:{type:'string'},'tunnel-id':{type:'string'},alias:{type:'string'},'credential-source':{type:'string'},help:{type:'boolean'}}});
if(values.help){console.log('npm run tunnel:configure -- --client <absolute-binary-path> --tunnel-id <your-tunnel-id> [--alias obsidian-notes] [--credential-source <env-file>]\nCreates host-local configuration only. Existing configuration is never overwritten.');process.exit(0);}
if(!values.client||!path.isAbsolute(values.client))throw new Error('--client must be the absolute path to tunnel-client.');
const client=await fs.realpath(values.client);
if(!(await fs.stat(client)).isFile())throw new Error('--client must be a file.');
const tunnelId=values['tunnel-id'];
if(!/^tunnel_(?:[a-z0-9]{4}_)?[a-z0-9]{32}$/.test(tunnelId??''))throw new Error('--tunnel-id must be the complete ID from your Platform Tunnels page.');
const alias=values.alias??'obsidian-notes';
if(!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(alias))throw new Error('Use a unique alias with lowercase letters, digits, _ or -.');
const local=path.join(project,'.local');await fs.mkdir(local,{recursive:true});
const credentialSource=values['credential-source']?path.resolve(values['credential-source']):path.join(local,'tunnel.env');
try{await fs.access(path.join(local,'tunnel.json'));throw new Error('Tunnel config already exists. Edit .local/tunnel.json locally if needed; existing config was preserved.');}catch(e){if(e.code!=='ENOENT')throw e;}
if(values['credential-source'])await fs.access(credentialSource);
else try{await fs.writeFile(credentialSource,'CONTROL_PLANE_API_KEY=REPLACE_WITH_YOUR_RUNTIME_KEY\n# Optional: TUNNEL_HTTP_PROXY=http://127.0.0.1:7890\n',{flag:'wx',mode:0o600});}catch(e){if(e.code!=='EEXIST')throw e;}
await fs.writeFile(path.join(local,'tunnel.json'),JSON.stringify({client,credential_source:credentialSource,alias,tunnel_id:tunnelId},null,2)+'\n',{flag:'wx',mode:0o600});
console.log(`Tunnel configuration saved locally.\nEdit the runtime key in ${credentialSource} using a local editor.\nDo not paste keys into chat or commit them.\nThen run npm run tunnel:start and npm run tunnel:status.`);
