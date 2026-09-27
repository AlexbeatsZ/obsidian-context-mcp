import esbuild from 'esbuild';
import fs from 'node:fs/promises';
const project=import.meta.dirname+'/..';
await fs.mkdir(project+'/dist',{recursive:true});
await esbuild.build({entryPoints:[project+'/src/main.ts'],bundle:true,platform:'node',format:'cjs',target:'es2022',outfile:project+'/main.js',external:['obsidian','electron','@codemirror/state','@codemirror/view','@codemirror/language','@lezer/common','@lezer/highlight','@lezer/lr'],logLevel:'info'});
await esbuild.build({entryPoints:[project+'/src/mcp-entry.ts'],bundle:true,platform:'node',format:'cjs',target:'node20',outfile:project+'/dist/mcp.cjs',logLevel:'info'});
