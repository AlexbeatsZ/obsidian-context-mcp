import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
const project=path.resolve(import.meta.dirname,'..');
const config=JSON.parse(await fs.readFile(path.join(project,'.local','config.json'),'utf8'));
const evidenceName=process.argv[2]==='--preview'?'inline-preview':process.argv[2]==='--context-check'?'inline-context':'inline';
const note='MCP验收测试/'+(evidenceName==='inline-preview'?'行内预览':evidenceName==='inline-context'?'行内上下文':'行内审阅')+'.md';
const body='# 行内审阅\n\n第一处原文\n\n第二处原文\n\n第三处原文\n\n第四处原文\n\n保留的正文与公式：$v=\\sqrt{8kT/(\\pi m)}$。\n';
try{await fs.writeFile(path.join(config.root,note),body,{flag:'wx'});}catch(e){if(e.code!=='EEXIST')throw e;}
const client=new Client({name:'inline-STEM-acceptance',version:'1'});
const transport=new StdioClientTransport({command:process.execPath,args:[path.join(project,'dist','mcp.cjs')],cwd:project});
try{
  await client.connect(transport);
  const call=async(name,args={})=>{const result=await client.callTool({name,arguments:args});if(result.isError)throw new Error(JSON.stringify(result.structuredContent??result.content));return result.structuredContent;};
  const read=await call('obsidian_read_file',{path:note});assert.equal(read.content,body,'QA note already changed; retain it and inspect rather than overwrite.');
  const context=await call('obsidian_get_context');
  const replacements=['第一处候选：更长的中文😀。\n第一处新增的一行。','第二处候选：检查接受后的定位。','第三处候选：这一处拒绝。','第四处候选：保留最后一处修改。'];
  const edits=['第一处','第二处','第三处','第四处'].map((label,i)=>({from:{line:i*2+3,ch:0},to:{line:i*2+3,ch:label.length+2},expected_text:label+'原文',replacement:replacements[i]}));
  const request={request_id:'inline-live-'+Date.now(),title:'行内审阅测试',operations:[{kind:'edit',path:note,base_revision:read.revision,edits}]};
  const proposal=await call('obsidian_propose_changes',request);
  assert.equal(await fs.readFile(path.join(config.root,note),'utf8'),body,'Submitting a proposal must not write candidate text.');
  const after=await call('obsidian_get_context');
  const evidence={proposal,request,context_before:context,context_after:after,unchanged_at_proposal:true};
  await fs.writeFile(path.join(project,'.local','qa',evidenceName+'.json'),JSON.stringify(evidence,null,2));
  if(evidenceName==='inline-context'){assert.ok(context.selections.length,'Select a real note before this check.');assert.equal(after.context_id,context.context_id);assert.deepEqual(after.selections,context.selections);}
  console.log(JSON.stringify({proposal_id:proposal.proposal_id,status:proposal.status,context_path_preserved:context.path===after.path,context_selections_preserved:JSON.stringify(context.selections)===JSON.stringify(after.selections)},null,2));
}finally{await client.close();}
