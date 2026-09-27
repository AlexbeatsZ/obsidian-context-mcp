import fs from 'node:fs/promises';import path from 'node:path';import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
const project=path.resolve(import.meta.dirname,'..'),local=path.join(project,'.local','qa');await fs.mkdir(local,{recursive:true});
const env=Object.fromEntries(Object.entries(process.env).filter(([k,v])=>v!==undefined&&!/^(CONTROL_PLANE_API_KEY|OPENAI_API_KEY|TUNNEL_HTTP_PROXY|HTTPS?_PROXY|ALL_PROXY|NO_PROXY)$/i.test(k)));
const client=new Client({name:'live-STEM-acceptance',version:'1'});const transport=new StdioClientTransport({command:process.execPath,args:[path.join(project,'dist/mcp.cjs')],cwd:project,env});
const call=async(name,args={})=>{const r=await client.callTool({name,arguments:args});if(r.isError)throw new Error(JSON.stringify(r.structuredContent??r.content));return r.structuredContent;};
const save=async(name,data)=>fs.writeFile(path.join(local,name+'.json'),JSON.stringify(data,null,2));
const folder='MCP验收测试/',action=process.argv[2]??'read';
try {
 await client.connect(transport);
 if(action==='read') {
  const tools=await client.listTools();assert.equal(tools.tools.length,6);
  const context=await call('obsidian_get_context');const files=await call('obsidian_list_files',{path:folder.slice(0,-1)});
  const search=await call('obsidian_search',{query:'平均相对速率'});
  const read=await call('obsidian_read_file',{path:folder+'上下文与四块修改.md'});
  const binary=await call('obsidian_read_file',{path:folder+'测试图片.png'});assert.equal(binary.supported_content,false);
  await save('read',{tools:tools.tools.map(t=>t.name),context,files,search,read,binary});console.log(JSON.stringify({tools:tools.tools.length,context:context.path,files:files.total,search_results:search.results.length,search_complete:search.complete,selection:context.selections},null,2));
 } else if(action==='status') {
  const p=JSON.parse(await fs.readFile(path.join(local,process.argv[3]+'.json'),'utf8'));const result=await call('obsidian_get_change_status',{proposal_id:p.proposal_id});await save(process.argv[3]+'-status',result);console.log(JSON.stringify(result,null,2));
 } else {
  let operations;
  if(action==='four'||action==='conflict'){
   const p=folder+(action==='four'?'上下文与四块修改.md':'冲突测试.md');const r=await call('obsidian_read_file',{path:p});
   const edits=action==='four'?['第一处','第二处','第三处','第四处'].map(label=>{const lines=r.content.split('\n');const line=lines.findIndex(l=>l===label+'原文');assert.ok(line>=0);return {from:{line:line+1,ch:0},to:{line:line+1,ch:label.length+2},expected_text:label+'原文',replacement:label+'已修改'};}):[{from:{line:2,ch:0},to:{line:2,ch:6},expected_text:'待修改原文',replacement:'AI 候选改文'}];
   if(action==='conflict')edits[0].to.ch='待修改原文'.length;
   operations=[{kind:'edit',path:p,base_revision:r.revision,edits}];
  } else if(action==='create')operations=[{kind:'create',path:folder+'新建子目录/新建笔记.md',content:'# MCP 专用新建测试\n经本地审阅后创建。\n'}];
  else if(action==='move'||action==='attachment'||action==='trash'){
   const p=folder+({move:'移动源.md',attachment:'测试图片.png',trash:'回收测试.txt'}[action]);const r=await call('obsidian_read_file',{path:p});operations=[{kind:action==='trash'?'trash':'move',path:p,base_revision:r.revision,...(action==='trash'?{}:{to:folder+(action==='move'?'新建子目录/移动后.md':'重命名图片.png')})}];
  } else throw new Error('Unknown action');
  const request={request_id:'live-'+action+'-'+Date.now(),title:'MCP 验收 · '+action,operations};await save(action+'-request',request);
  const result=await call('obsidian_propose_changes',request);await save(action,result);console.log(JSON.stringify(result,null,2));
 }
} finally {await client.close();}
