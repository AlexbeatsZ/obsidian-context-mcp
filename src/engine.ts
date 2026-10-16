import path from "node:path";
import fs from "node:fs/promises";
import { randomUUID, createHash } from "node:crypto";
import { applyEdits, isText, makeHunks, materialize, merge3, rebaseHunks, revision, safePath, type Decision, type Hunk, type Snapshot, type VaultPort } from "./core";
import { fail, type Operation, type ProposalInput } from "./protocol";
import { planMoveLinks, referencesTo, type LinkChange } from "./links";
import { DiskStore } from "./store";

export interface PreparedOperation {
  id: string; input: Operation; baseline?: Snapshot; candidate?: string; hunks: Hunk[];
  links: LinkChange[]; references: string[]; decision: Decision; error?: string;
  expected_revision?: string; applied_steps: string[]; recovery_ids: string[];
  restored?: boolean;
  recovered_steps?: string[];
  // Set when the error came from a vault check that may pass again later.
  stale?: boolean;
}
export interface Proposal {
  id: string; request_id: string; fingerprint: string; title: string; vault: string;
  created_at: string; operations: PreparedOperation[];
  recovery_error?: string;
}
interface Journal {
  id: string; proposal_id: string; operation_id: string; kind: "write"|"create"|"move"|"trash";
  path: string; to?: string; before?: Snapshot; after?: Snapshot; backup?: string;
  state: "prepared"|"applied"|"uncertain"|"restored"; intended_text?: string;
}
export class ReviewEngine {
  proposals=new Map<string,Proposal>();
  private serial:Promise<unknown>=Promise.resolve();
  readonly store:DiskStore; readonly journals:DiskStore;
  onChange=()=>{};
  constructor(public vault:VaultPort, public localRoot:string, public vaultId="stem") {
    this.store=new DiskStore(path.join(localRoot,"proposals",vaultId));
    this.journals=new DiskStore(path.join(localRoot,"journals",vaultId));
  }
  private enqueue<T>(fn:()=>Promise<T>):Promise<T> { const job=this.serial.then(fn); this.serial=job.catch(()=>{}); return job; }
  async load(validate=true) {
    for(const p of await this.store.all<Proposal>()) this.proposals.set(p.id,p);
    const journalRecords=await this.journals.all<Journal>();
    const restoredIds=new Set(journalRecords.filter(j=>j.state==="restored").map(j=>j.id));
    for(const p of this.proposals.values())for(const op of p.operations){
      op.recovered_steps=op.recovery_ids.filter(id=>restoredIds.has(id));
      if(op.recovery_ids.length&&op.recovered_steps.length===op.recovery_ids.length){op.restored=true;if(op.error==="已恢复该提案的文件，请重新生成候选。")delete op.error;}
    }
    const interrupted=journalRecords.filter(j=>j.state==="prepared");
    for(const j of interrupted) {
      // Never replay an interrupted write blindly; preserve its baseline and block.
      j.state="uncertain"; await this.journals.write(j.id,j);
      const p=this.proposals.get(j.proposal_id); const op=p?.operations.find(o=>o.id===j.operation_id);
      if(p&&op) { op.error="上次提交被中断，请检查恢复记录后重新生成候选。"; delete op.stale; await this.save(p); }
    }
    // Older builds stored vault-check conflicts as permanent; let them be rechecked.
    for(const p of this.proposals.values())for(const op of p.operations)if(op.error&&op.stale===undefined&&/已改变，请重新读取并生成候选|新建目标已存在|移动目标已存在|关联链接已改变/.test(op.error))op.stale=true;
    // A recovery that failed before reversing any step left nothing half-done.
    for(const p of this.proposals.values())if(p.recovery_error&&!p.operations.some(op=>op.recovered_steps?.length)){delete p.recovery_error;await this.save(p);}
    if(validate)await this.validatePending();
  }
  validatePending(){return this.enqueue(async()=>{for(const p of this.proposals.values())for(const op of p.operations)if(this.pending(op))await this.recheck(p,op);});}
  private async recheck(p:Proposal,op:PreparedOperation){
    if(op.error&&!op.stale)return;
    const before=op.error;
    try{await this.preflight(op);}catch{}
    if(op.error!==before)await this.save(p);
  }
  async save(p:Proposal) { await this.store.write(p.id,p); this.onChange(); }
  pending(op:PreparedOperation) { return !op.restored&&(op.input.kind==="edit"?op.hunks.some(h=>h.decision==="pending"):op.decision==="pending"); }
  get(id:string) { return this.proposals.get(id)??fail("NOT_FOUND","找不到该候选修改。"); }
  status(id:string) {
    const p=this.get(id); const items=p.operations.map(op=>({operation_id:op.id,kind:op.input.kind,path:op.input.path,to:op.input.kind==="move"?op.input.to:undefined,
      status:op.restored?"restored":op.error?"conflict":this.pending(op)?"awaiting_user_review":op.hunks.length?op.hunks.every(h=>h.decision==="accepted")?"accepted":op.hunks.every(h=>h.decision==="rejected")?"rejected":"partially_accepted":op.decision,
      hunks:op.hunks.map(h=>({hunk_id:h.id,status:op.restored?(h.decision==="accepted"?"restored":h.decision==="pending"?"cancelled":h.decision):h.decision})),error:op.error,applied_steps:op.applied_steps,recovery_ids:op.recovery_ids,recovered_steps:op.recovered_steps??[],revision:op.expected_revision}));
    return {vault:this.vaultId,proposal_id:p.id,title:p.title,status:p.recovery_error?"recovery_conflict":items.every(o=>o.status==="restored")?"restored":items.some(o=>o.error)?"conflict":items.some(o=>o.status==="awaiting_user_review")?(items.some(o=>o.applied_steps.length)?"partially_applied":"awaiting_user_review"):"completed",recovery_error:p.recovery_error,operations:items};
  }
  propose(input:ProposalInput) { return this.enqueue(async()=>{
    const fingerprint=createHash("sha256").update(JSON.stringify(input)).digest("hex");
    const prior=[...this.proposals.values()].find(p=>p.request_id===input.request_id);
    if(prior) { if(prior.fingerprint!==fingerprint) fail("DUPLICATE_REQUEST","request_id 已用于不同内容。"); return this.status(prior.id); }
    const operations:PreparedOperation[]=[]; const touched=new Set<string>();
    for(const original of input.operations) {
      const operation={...original,path:safePath(original.path)} as Operation;
      await this.vault.validate(operation.path);
      const op:PreparedOperation={id:`op${operations.length+1}`,input:operation,hunks:[],links:[],references:[],decision:"pending",applied_steps:[],recovery_ids:[]};
      if(operation.kind==="create") {
        if(!isText(operation.path)) fail("UNSUPPORTED_TYPE","只支持新建所列文本类型。");
        if(this.vault.exists(operation.path)) fail("CONFLICT","新建目标已经存在。"); op.candidate=operation.content;
      } else {
        op.baseline=await this.vault.read(operation.path); op.expected_revision=op.baseline.revision;
        if(operation.base_revision!==op.baseline.revision) fail("CONFLICT","文件已改变，请重新读取。");
        if(operation.kind==="edit") {
          if(op.baseline.kind!=="text") fail("UNSUPPORTED_TYPE","二进制附件不支持正文编辑。");
          op.candidate=applyEdits(op.baseline.text!,operation.edits); op.hunks=makeHunks(op.baseline.text!,op.candidate);
          if(!op.hunks.length) op.decision="accepted";
        } else if(operation.kind==="move") {
          operation.to=safePath(operation.to); await this.vault.validate(operation.to);
          if(operation.to===operation.path) fail("INVALID_PATH","新旧路径相同。");
          if(this.vault.exists(operation.to)&&operation.to.toLowerCase()!==operation.path.toLowerCase()) fail("CONFLICT","移动目标已存在。");
          op.links=await planMoveLinks(this.vault,operation.path,operation.to);
        } else op.references=await referencesTo(this.vault,operation.path);
      }
      const paths=[operation.path,...op.links.map(l=>l.snapshot.path),...(operation.kind==="move"?[operation.to]:[])];
      for(const p of new Set(paths.map(p=>p.toLowerCase()))) { if(touched.has(p)) fail("OVERLAPPING_OPERATIONS","同一提案中的操作及链接更新不能重复触及同一文件，请拆成后续提案。"); touched.add(p); }
      operations.push(op);
    }
    const p:Proposal={id:randomUUID(),request_id:input.request_id,fingerprint,title:input.title,vault:this.vaultId,created_at:new Date().toISOString(),operations};
    this.proposals.set(p.id,p); await this.save(p); return this.status(p.id);
  }); }
  private async preflight(op:PreparedOperation) {
    if(op.error&&!op.stale) fail("CONFLICT",op.error);
    try { await this.verify(op); } catch(e) { op.error=(e as Error).message; op.stale=true; throw e; }
    if(op.stale) { delete op.error; delete op.stale; }
  }
  private async verify(op:PreparedOperation) {
    await this.vault.validate(op.input.path);
    if(op.input.kind==="create") { if(this.vault.exists(op.input.path)) fail("CONFLICT","新建目标已存在。"); return; }
    const current=await this.vault.read(op.input.path);
    if(current.revision!==op.expected_revision&&op.input.kind==="edit"&&current.text!==undefined&&op.baseline?.text!==undefined&&revision(materialize(op.baseline.text,op.hunks))===op.expected_revision) {
      // User edits elsewhere in the note carry the remaining hunks along.
      const hunks=rebaseHunks(op.baseline.text,op.hunks,current.text);
      if(!hunks) fail("CONFLICT",`${op.input.path} 中待审阅的行已被改动，剩余候选无法安全定位。`);
      op.baseline=current; op.hunks=hunks; op.expected_revision=current.revision; return;
    }
    if(current.revision!==op.expected_revision) fail("CONFLICT",`${op.input.path} 已改变，请重新读取并生成候选。`);
    if(op.input.kind==="move") {
      await this.vault.validate(op.input.to);
      if(this.vault.exists(op.input.to)&&op.input.to.toLowerCase()!==op.input.path.toLowerCase()) fail("CONFLICT","移动目标已存在。");
      const fresh=await planMoveLinks(this.vault,op.input.path,op.input.to);
      if(JSON.stringify(fresh.map(l=>({path:l.snapshot.path,revision:l.snapshot.revision,candidate:l.candidate})))!==JSON.stringify(op.links.map(l=>({path:l.snapshot.path,revision:l.snapshot.revision,candidate:l.candidate})))) fail("CONFLICT","关联链接已改变，请重新生成移动候选。");
    }
  }
  async invalidate(p:string) {
    return this.enqueue(async()=>{ for(const proposal of this.proposals.values()) for(const op of proposal.operations) if(this.pending(op)&&(op.input.path===p||op.links.some(l=>l.snapshot.path===p))) await this.recheck(proposal,op); });
  }
  decide(id:string,opId:string,decision:Exclude<Decision,"pending">,hunkId?:string) { return this.enqueue(async()=>{
    const p=this.get(id); const op=p.operations.find(o=>o.id===opId)??fail("NOT_FOUND","找不到操作。");
    if(decision==="accepted"&&p.recovery_error)fail("RECOVERY_REQUIRED",p.recovery_error);
    try { await this.decideInternal(p,op,decision,hunkId); } catch(e) { if(!op.stale)op.error=(e as Error).message; await this.save(p); throw e; }
    return this.status(id);
  }); }
  decideAll(id:string,decision:Exclude<Decision,"pending">) { return this.enqueue(async()=>{
    const p=this.get(id);
    if(decision==="accepted"&&p.recovery_error)fail("RECOVERY_REQUIRED",p.recovery_error);
    if(decision==="accepted") for(const op of p.operations.filter(o=>this.pending(o))) {
      try { await this.preflight(op); } catch(e) { await this.save(p); throw e; }
    }
    for(const op of p.operations.filter(o=>this.pending(o))) {
      try { await this.decideInternal(p,op,decision); } catch(e) { if(!op.stale)op.error=(e as Error).message; await this.save(p); throw e; }
    }
    return this.status(id);
  }); }
  private async journal(p:Proposal,op:PreparedOperation,kind:Journal["kind"],target:string, action:()=>Promise<Snapshot|void>,to?:string,intended?:string) {
    const id=randomUUID(); const before=this.vault.exists(target)?await this.vault.read(target):undefined;
    const j:Journal={id,proposal_id:p.id,operation_id:op.id,kind,path:target,to,before,state:"prepared",intended_text:intended};
    if(before) { const dir=path.join(this.localRoot,"backups"); await fs.mkdir(dir,{recursive:true}); j.backup=path.join(dir,id+".bin"); await fs.writeFile(j.backup,await this.vault.backup(target)); }
    await this.journals.write(id,j); op.recovery_ids.push(id); await this.save(p);
    try { const after=await action(); if(after)j.after=after; j.state="applied"; await this.journals.write(id,j); op.applied_steps.push(`${kind}:${target}`); await this.save(p); return after; }
    catch(e) { j.state="uncertain"; await this.journals.write(id,j); throw e; }
  }
  private async decideInternal(p:Proposal,op:PreparedOperation,decision:Exclude<Decision,"pending">,hunkId?:string) {
    if(!this.pending(op))return;
    const selected=op.input.kind==="edit"?op.hunks.filter(h=>h.decision==="pending"&&(!hunkId||h.id===hunkId)):[];
    if(hunkId&&!selected.length) return;
    if(decision==="rejected") { if(op.input.kind==="edit")selected.forEach(h=>h.decision=decision); else op.decision=decision; await this.save(p); return; }
    await this.preflight(op);
    const input=op.input;
    if(input.kind==="edit") {
      const next=op.hunks.map(h=>({...h,decision:selected.some(s=>s.id===h.id)?decision:h.decision}));
      const text=materialize(op.baseline!.text!,next);
      const after=await this.journal(p,op,"write",input.path,()=>this.vault.write(input.path,op.expected_revision!,text),undefined,text);
      selected.forEach(h=>h.decision=decision); op.expected_revision=after!.revision;
    } else if(input.kind==="create") {
      const after=await this.journal(p,op,"create",input.path,()=>this.vault.create(input.path,op.candidate!),undefined,op.candidate);
      op.expected_revision=after!.revision; op.decision=decision;
    } else if(input.kind==="move") {
      // Link writes use snapshots; move last keeps every journal step reversible.
      for(const link of op.links) {
        const after=await this.journal(p,op,"write",link.snapshot.path,()=>this.vault.write(link.snapshot.path,link.snapshot.revision,link.candidate),undefined,link.candidate);
        if(link.snapshot.path===input.path) op.expected_revision=after!.revision;
      }
      let source=input.path;
      if(input.path.toLowerCase()===input.to.toLowerCase()) {
        const temporary=input.path+".mcp-"+randomUUID();
        const interim=await this.journal(p,op,"move",source,()=>this.vault.move(source,temporary,op.expected_revision!),temporary);
        source=temporary;op.expected_revision=interim!.revision;
      }
      const after=await this.journal(p,op,"move",source,()=>this.vault.move(source,input.to,op.expected_revision!),input.to);
      op.expected_revision=after!.revision; op.decision=decision;
    } else { await this.journal(p,op,"trash",input.path,()=>this.vault.trash(input.path,op.expected_revision!)); op.decision=decision; }
    await this.save(p);
  }
  recover(id:string) { return this.enqueue(async()=>{
    const p=this.get(id); const records=(await this.journals.all<Journal>()).filter(j=>j.proposal_id===id&&j.state!=="restored");
    // Revert in the recorded execution order, never silently overwrite later work.
    const order=p.operations.flatMap(o=>o.recovery_ids); records.sort((a,b)=>order.indexOf(b.id)-order.indexOf(a.id));
    let reversed=0;
    try{for(const j of records) {
      const target=j.kind==="move"?j.to!:j.path;
      if(j.state==="uncertain") {
        // Reconcile only exact before/intended states; later edits remain blocked.
        const source=this.vault.exists(j.path)?await this.vault.read(j.path):undefined;
        const destination=j.kind==="move"&&this.vault.exists(target)?await this.vault.read(target):undefined;
        const unchanged=j.before?source?.revision===j.before.revision:!source;
        if(unchanged&&!destination){j.state="restored";await this.journals.write(j.id,j);await this.recordRecovery(p,j);continue;}
        if(j.kind==="write"||j.kind==="create") {
          if(!source||j.intended_text===undefined||source.revision!==revision(j.intended_text))fail("RECOVERY_REQUIRED","中断步骤的文件无法匹配原文或候选，请检查本地备份。");
          j.after=source;
        } else if(j.kind==="move") {
          if(source||!destination||destination.revision!==j.before?.revision)fail("RECOVERY_REQUIRED","中断移动的路径或内容发生变化，请检查本地备份。");
          j.after=destination;
        } else if(source)fail("RECOVERY_REQUIRED","中断删除的文件发生变化，请检查本地备份。");
        j.state="applied";await this.journals.write(j.id,j);
      }
      if(j.after) {
        const current=await this.vault.read(target);
        if(current.revision!==j.after.revision) {
          // Undo only this step's lines when later edits touched other lines.
          const merged=j.kind==="write"&&j.backup&&current.text!==undefined&&j.after.text!==undefined?merge3(j.after.text,current.text,Buffer.from(await fs.readFile(j.backup)).toString("utf8")):null;
          if(merged===null)fail("CONFLICT",j.kind==="write"?`${target} 中这次接受的行在之后又被改动，无法自动撤销。`:`${target} 已在提交后改变，无法自动恢复。`);
          await this.vault.restore(j.path,Buffer.from(merged,"utf8"),current.revision);
          j.state="restored"; await this.journals.write(j.id,j); reversed++;
          await this.recordRecovery(p,j); continue;
        }
      }
      else if(this.vault.exists(target)) fail("CONFLICT",`${target} 已重新出现，无法覆盖。`);
      if(j.kind==="create") await this.vault.trash(target,j.after!.revision);
      else if(j.kind==="move") { if(this.vault.exists(j.path))fail("CONFLICT","原路径已存在。"); await this.vault.move(target,j.path,j.after!.revision); }
      else if(j.backup) await this.vault.restore(j.path,await fs.readFile(j.backup),j.after?.revision??null);
      j.state="restored"; await this.journals.write(j.id,j); reversed++;
      await this.recordRecovery(p,j);
    }}catch(e){if(reversed||p.recovery_error)p.recovery_error=(e as Error).message;await this.save(p);throw e;}
    for(const op of p.operations){op.restored=true;delete op.error;}
    delete p.recovery_error;
    await this.save(p);
  }); }
  private async recordRecovery(p:Proposal,j:Journal){const op=p.operations.find(o=>o.id===j.operation_id)!;op.recovered_steps=[...new Set([...(op.recovered_steps??[]),j.id])];if(op.recovered_steps.length===op.recovery_ids.length)op.restored=true;await this.save(p);}
}
