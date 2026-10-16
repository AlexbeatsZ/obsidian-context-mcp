import { createHash } from "node:crypto";
import path from "node:path";
import fs from "node:fs/promises";
import { diffLines } from "diff";
import { fail, type Edit, type Point } from "./protocol";

export const TEXT_EXTENSIONS = new Set(["md", "txt", "tex", "svg", "json", "canvas", "yaml", "yml", "csv", "tsv", "css", "js", "ts"]);
export function isText(p: string) { return TEXT_EXTENSIONS.has(p.split(".").pop()!.toLowerCase()); }
export function revision(text: string) { return "text:" + createHash("sha256").update(text).digest("hex"); }
export function safePath(input: string, allowRoot = false): string {
  if (allowRoot && (input === "" || input === ".")) return "";
  const p = input.replace(/\\/g, "/");
  if (p.startsWith("/") || /[\x00-\x1f:*?"<>|]/.test(p)) fail("INVALID_PATH", "需要仓库内的相对文件路径。");
  const parts = p.split("/");
  if (parts.some(s => !s || s.startsWith(".") || /[. ]$/.test(s) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(s))) fail("INVALID_PATH", "隐藏目录、越界路径或无效文件名不受支持。");
  return p;
}
export async function assertRealPath(root: string, input: string) {
  const p = safePath(input);
  const canonicalRoot = await fs.realpath(root);
  let current = canonicalRoot;
  for (const segment of p.split("/")) {
    current = path.join(current, segment);
    try {
      const stat = await fs.lstat(current);
      if (stat.isSymbolicLink()) fail("INVALID_PATH", "符号链接不受支持。");
      const actual = await fs.realpath(current);
      const rel = path.relative(canonicalRoot, actual);
      if (rel.startsWith("..") || path.isAbsolute(rel)) fail("INVALID_PATH", "文件必须位于仓库内。");
    } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") break; throw error; }
  }
}
export function offsetAt(text: string, point: Point): number {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === "\n") starts.push(i + 1);
  const start = starts[point.line - 1];
  if (start === undefined) fail("INVALID_RANGE", "行号超出文件范围。");
  const end = (starts[point.line] ?? (text.length + 1)) - 1;
  const contentEnd = text[end - 1] === "\r" ? end - 1 : end;
  if (point.ch > contentEnd - start) fail("INVALID_RANGE", "列号超出行内容范围。");
  return start + point.ch;
}
export function applyEdits(base: string, edits: Edit[]) {
  const ranges = edits.map(e => ({ ...e, start: offsetAt(base, e.from), end: offsetAt(base, e.to) })).sort((a,b) => a.start-b.start);
  let previous: typeof ranges[number] | undefined;
  for (const e of ranges) {
    if (e.end < e.start || (previous && (e.start < previous.end || e.start === previous.start))) fail("INVALID_RANGE", "修改范围重叠或顺序无效。");
    if (base.slice(e.start, e.end) !== e.expected_text) fail("CONFLICT", "预期原文与实际内容不同，请重新读取。");
    previous = e;
  }
  let value = base;
  for (const e of [...ranges].reverse()) value = value.slice(0,e.start)+e.replacement+value.slice(e.end);
  return value;
}
export type Decision = "pending" | "accepted" | "rejected";
export interface Hunk { id: string; start: number; end: number; replacement: string; decision: Decision; }
export function makeHunks(base: string, candidate: string): Hunk[] {
  const hunks: Hunk[] = []; let pos=0; let current: Hunk | undefined;
  for (const part of diffLines(base, candidate)) {
    if (!part.added && !part.removed) { current=undefined; pos+=part.value.length; continue; }
    if (!current) { current={id:`h${hunks.length+1}`, start:pos, end:pos, replacement:"", decision:"pending"}; hunks.push(current); }
    if (part.removed) { pos+=part.value.length; current.end=pos; }
    else current.replacement+=part.value;
  }
  return hunks;
}
export function materialize(base: string, hunks: Hunk[], includePending=false) {
  let text=base;
  for (const h of [...hunks].reverse()) if (h.decision==="accepted" || (includePending && h.decision==="pending")) text=text.slice(0,h.start)+h.replacement+text.slice(h.end);
  return text;
}
// Line-aligned ranges conflict when they share a line, or insert at the same point.
function overlaps(a: {start:number;end:number}, b: {start:number;end:number}) {
  if (a.start===a.end && b.start===b.end) return a.start===b.start;
  return a.start<b.end && b.start<a.end;
}
function shiftBefore(changes: Hunk[], pos: number) {
  let delta=0;
  for (const c of changes) if (c.end<=pos) delta+=c.replacement.length-(c.end-c.start);
  return delta;
}
// Exact rebase of pending hunks over edits that touch none of their lines.
// Settled hunks become no-ops: their effect is already in the current text.
export function rebaseHunks(base: string, hunks: Hunk[], current: string): Hunk[] | null {
  const expected=materialize(base,hunks);
  const user=expected===current?[]:makeHunks(expected,current);
  let shift=0;
  const output: Hunk[]=[];
  for (const h of hunks) {
    const start=h.start+shift, end=h.decision==="accepted"?start+h.replacement.length:h.end+shift;
    if (h.decision==="accepted") shift+=h.replacement.length-(h.end-h.start);
    if (h.decision==="pending") {
      if (user.some(u=>overlaps(u,{start,end}))) return null;
      output.push({...h,start:start+shiftBefore(user,start),end:end+shiftBefore(user,start)});
    } else {
      const at=Math.min(current.length,start+shiftBefore(user,start));
      output.push({...h,start:at,end:at,replacement:""});
    }
  }
  return output;
}
// Three-way line merge; null when both sides change the same lines.
export function merge3(base: string, ours: string, theirs: string): string | null {
  const a=makeHunks(base,ours), b=makeHunks(base,theirs);
  if (a.some(x=>b.some(y=>overlaps(x,y)))) return null;
  return materialize(base,[...a,...b].map(h=>({...h,decision:"accepted" as const})).sort((x,y)=>x.start-y.start||x.end-y.end));
}
export interface FileInfo { path: string; size: number; mtime: number; tags?: string[]; headings?: string[]; }
export interface Snapshot extends FileInfo { revision: string; kind: "text" | "attachment"; text?: string; }
export interface VaultPort {
  root: string;
  files(): FileInfo[];
  read(p: string): Promise<Snapshot>;
  exists(p: string): boolean;
  resolve(target: string, source: string): string | null;
  write(p: string, expected: string, text: string): Promise<Snapshot>;
  create(p: string, text: string): Promise<Snapshot>;
  move(p: string, to: string, expected: string): Promise<Snapshot>;
  trash(p: string, expected: string): Promise<void>;
  backup(p: string): Promise<Uint8Array>;
  restore(p: string, bytes: Uint8Array, expected: string|null): Promise<void>;
  validate(p: string): Promise<void>;
}
