import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';
export async function temporary(t:any){
  const root=path.resolve(os.tmpdir(),'.agents','obsidian-context-mcp');await fs.mkdir(root,{recursive:true});
  const dir=await fs.mkdtemp(path.join(root,'test-'));
  t.after(async()=>{const resolved=path.resolve(dir);if(path.dirname(resolved)!==root)throw new Error('Unsafe cleanup target');await fs.rm(resolved,{recursive:true,force:true});});
  return dir;
}
