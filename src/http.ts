import http from "node:http";
import { randomBytes, timingSafeEqual } from "node:crypto";
import path from "node:path";
import fs from "node:fs/promises";
import { atomicJson } from "./store";
import { AppError } from "./protocol";

export interface Endpoint { protocol:1; host:"127.0.0.1"; port:number; token:string; vault:string; root:string; pid:number; }
export async function startPluginServer(localRoot:string,vault:string,root:string,call:(name:string,args:unknown)=>Promise<object>) {
  const token=randomBytes(32).toString("hex");
  const server=http.createServer(async(req,res)=>{
    res.setHeader("Content-Type","application/json; charset=utf-8"); res.setHeader("Cache-Control","no-store");
    const provided=req.headers.authorization??""; const expected="Bearer "+token;
    if(req.headers.origin || provided.length!==expected.length || !timingSafeEqual(Buffer.from(provided),Buffer.from(expected))) {res.writeHead(401).end(JSON.stringify({error:{code:"UNAUTHORIZED",message:"需要有效配对。"}}));return;}
    if(req.method!=="POST"||req.url!=="/rpc"){res.writeHead(404).end();return;}
    let size=0;const chunks:Buffer[]=[];
    try {
      for await(const chunk of req) {size+=chunk.length;if(size>2*1024*1024)throw new AppError("TOO_LARGE","候选请求超过 2 MiB，请分批提交。");chunks.push(Buffer.from(chunk));}
      const body=JSON.parse(Buffer.concat(chunks).toString("utf8"));
      const result=await call(body.name,body.arguments??{});
      res.end(JSON.stringify({result}));
    }catch(e){const error=e as Error;res.writeHead(400).end(JSON.stringify({error:{code:e instanceof AppError?e.code:e instanceof SyntaxError?"INVALID_JSON":"INVALID_REQUEST",message:error.message}}));}
  });
  server.requestTimeout=20000;server.headersTimeout=10000;
  await new Promise<void>((resolve,reject)=>{server.once("error",reject);server.listen(0,"127.0.0.1",()=>resolve());});
  const address=server.address(); if(!address||typeof address==="string")throw new Error("No HTTP address");
  const endpoint:Endpoint={protocol:1,host:"127.0.0.1",port:address.port,token,vault,root,pid:process.pid};
  const file=path.join(localRoot,"endpoints",vault+".json"); await atomicJson(file,endpoint);
  return {endpoint,close:async()=>{await new Promise<void>(resolve=>server.close(()=>resolve()));try{const existing=JSON.parse(await fs.readFile(file,"utf8"));if(existing.token===token)await fs.unlink(file);}catch{} }};
}
