import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fail } from "./protocol";

export async function atomicJson(file: string, value: unknown) {
  await fs.mkdir(path.dirname(file),{recursive:true});
  const temp=file+"."+randomUUID()+".tmp";
  await fs.writeFile(temp,JSON.stringify(value,null,2),{mode:0o600});
  await fs.rename(temp,file);
}
export class DiskStore {
  constructor(public root: string) {}
  file(id:string) { if (!/^[\w-]+$/.test(id)) fail("INVALID_ID","无效记录标识。"); return path.join(this.root,id+".json"); }
  async read<T>(id:string):Promise<T> { try { return JSON.parse(await fs.readFile(this.file(id),"utf8")); } catch(e) { if((e as NodeJS.ErrnoException).code==="ENOENT") fail("NOT_FOUND","找不到该记录。"); throw e; } }
  async write(id:string,value:unknown) { await atomicJson(this.file(id),value); }
  async all<T>():Promise<T[]> {
    await fs.mkdir(this.root,{recursive:true}); const result:T[]=[];
    for(const name of await fs.readdir(this.root)) if(name.endsWith(".json")) result.push(await this.read<T>(name.slice(0,-5)));
    return result;
  }
}
