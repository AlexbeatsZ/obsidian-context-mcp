import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export function defaultProjectDir() {
  return path.join(os.homedir(), "Project", "Workspaces", "obsidian-context-mcp");
}

export async function sameVaultRoot(first:string,second:string) {
  try {
    const [a,b]=await Promise.all([fs.realpath(first),fs.realpath(second)]);
    return process.platform==="win32"?a.toLowerCase()===b.toLowerCase():a===b;
  } catch { return false; }
}
