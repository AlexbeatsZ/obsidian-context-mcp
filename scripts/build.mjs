import esbuild from 'esbuild';
import fs from 'node:fs/promises';
const project=import.meta.dirname+'/..';
await fs.mkdir(project+'/dist',{recursive:true});
const plugin=await esbuild.build({entryPoints:[project+'/src/main.ts'],bundle:true,platform:'node',format:'cjs',target:'es2022',outfile:project+'/main.js',external:['obsidian','electron','@codemirror/state','@codemirror/view','@codemirror/language','@lezer/common','@lezer/highlight','@lezer/lr'],metafile:true,logLevel:'info'});
const bridge=await esbuild.build({entryPoints:[project+'/src/mcp-entry.ts'],bundle:true,platform:'node',format:'cjs',target:'node20',outfile:project+'/dist/mcp.cjs',metafile:true,logLevel:'info'});
const cli=await esbuild.build({entryPoints:[project+'/scripts/call.mjs'],bundle:true,platform:'node',format:'cjs',target:'node22',define:{'import.meta.dirname':'__dirname'},outfile:project+'/dist/call.cjs',metafile:true,logLevel:'info'});
await fs.writeFile(project+'/dist/bundle-inputs.json',JSON.stringify([...new Set([plugin,bridge,cli].flatMap(x=>Object.keys(x.metafile.inputs)))],null,2));
