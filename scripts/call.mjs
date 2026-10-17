import fs from 'node:fs/promises';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
async function main(){
const project=path.resolve(import.meta.dirname,'..');
const client=new Client({name:'obsidian-context-cli',version:'0.1.0'});
const env=Object.fromEntries(Object.entries(process.env).filter(([key,value])=>value!==undefined&&!/^(CONTROL_PLANE_API_KEY|OPENAI_API_KEY|TUNNEL_HTTP_PROXY|HTTPS?_PROXY|ALL_PROXY|NO_PROXY)$/i.test(key)));
const transport=new StdioClientTransport({command:process.execPath,args:[path.join(project,'dist','mcp.cjs')],cwd:project,env});
try {
  await client.connect(transport);
  if(process.argv[2]==='list')console.log(JSON.stringify(await client.listTools(),null,2));
  else {
    const input=process.argv[3]?JSON.parse(await fs.readFile(process.argv[3],'utf8')):{};
    const result=await client.callTool({name:process.argv[2]??'obsidian_get_context',arguments:input});
    console.log(JSON.stringify(result.structuredContent??result,null,2));
    if(result.isError)process.exitCode=1;
  }
} finally {await client.close();}
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
