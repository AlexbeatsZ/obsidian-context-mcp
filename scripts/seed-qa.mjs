import fs from 'node:fs/promises';import path from 'node:path';
const project=path.resolve(import.meta.dirname,'..');
const {root}=JSON.parse(await fs.readFile(path.join(project,'.local/config.json'),'utf8'));
const folder=path.join(root,'MCP验收测试');await fs.mkdir(folder,{recursive:true});
const notes={
 '上下文与四块修改.md':'---\ntags: [mcp-验收]\n---\n# MCP 验收测试\n\n这是专用测试笔记，不用于课程资料。\n\n推导选区：甲😀与乙粒子的平均相对速率。\n\n第一处原文\n保留间隔一\n第二处原文\n保留间隔二\n第三处原文\n保留间隔三\n第四处原文\n\n公式：$\\bar v_{AB}=\\sqrt{8RT/(\\pi\\mu)}$\n',
 '冲突测试.md':'# 专用冲突测试\n待修改原文\n',
 '移动源.md':'# 专用移动源\n[邻居](引用者.md)\n> **自定义标题**\n$$x=1\\tag{1-1}$$\n',
 '引用者.md':'# 专用引用者\n[[移动源#-自定义标题|手写别名]]\n[公式](移动源.md#=1-1)\n![[测试图片.png]]\n`[[移动源]]`\n```md\n[[移动源]]\n```\n',
 '回收测试.txt':'MCP 专用回收与恢复测试，不含用户资料。\n'
};
for(const [name,text] of Object.entries(notes)) {try{await fs.writeFile(path.join(folder,name),text,{flag:'wx'});}catch(e){if(e.code!=='EEXIST')throw e;}}
try{await fs.writeFile(path.join(folder,'测试图片.png'),Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aV8kAAAAASUVORK5CYII=','base64'),{flag:'wx'});}catch(e){if(e.code!=='EEXIST')throw e;}
console.log('Created dedicated QA fixtures under '+folder);
