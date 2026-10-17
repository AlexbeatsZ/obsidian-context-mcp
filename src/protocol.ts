import { z } from "zod";

export const pointSchema = z.object({ line: z.number().int().min(1), ch: z.number().int().min(0) });
export const editSchema = z.object({ from: pointSchema, to: pointSchema, expected_text: z.string(), replacement: z.string() });
const pathSchema = z.string().min(1).max(1024);
export const operationSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("edit"), path: pathSchema, base_revision: z.string(), edits: z.array(editSchema).min(1).max(200) }),
  z.object({ kind: z.literal("create"), path: pathSchema, content: z.string() }),
  z.object({ kind: z.literal("move"), path: pathSchema, to: pathSchema, base_revision: z.string() }),
  z.object({ kind: z.literal("trash"), path: pathSchema, base_revision: z.string() })
]);
export const schemas = {
  obsidian_get_context: z.object({ nearby_lines: z.number().int().min(0).max(100).default(12) }),
  obsidian_list_files: z.object({ path: z.string().default(""), type: z.enum(["all", "text", "attachment", "markdown"]).default("all"), offset: z.number().int().min(0).default(0), limit: z.number().int().min(1).max(500).default(100) }),
  obsidian_search: z.object({ query: z.string().trim().min(1).max(500), path: z.string().default(""), max_results: z.number().int().min(1).max(100).default(20) }),
  obsidian_read_file: z.object({ path: pathSchema, start_line: z.number().int().min(1).default(1), line_count: z.number().int().min(1).max(2000).default(200) }),
  obsidian_propose_changes: z.object({ request_id: z.string().min(1).max(128), title: z.string().max(200).default("候选修改"), operations: z.array(operationSchema).min(1).max(30) }),
  obsidian_get_change_status: z.object({ proposal_id: z.string().min(1) })
};
export type ToolName = keyof typeof schemas;
export type Point = z.infer<typeof pointSchema>;
export type Edit = z.infer<typeof editSchema>;
export type Operation = z.infer<typeof operationSchema>;
export type ProposalInput = z.infer<typeof schemas.obsidian_propose_changes>;
export const descriptions: Record<ToolName, string> = {
  obsidian_get_context: "Get the last active Obsidian note, editor selection and cursor, nearby text, open/recent/linked notes and revision. Use first for 'this', 'here' or selected-text requests. Snapshot survives switching to the browser. Reading-mode selections have no source offsets.",
  obsidian_list_files: "List paginated visible configured vault files and attachment metadata, without reading their bodies. Paths are vault-relative.",
  obsidian_search: "Find vault files from a description using whitespace-separated AND keywords in paths, headings, tags and text. Returns ranked bounded snippets and 1-based line numbers. Follow with read_file.",
  obsidian_read_file: "Read a range of a vault text file with a full-content revision and total lines. Open editor buffers take precedence. Binary attachments return metadata only. Lines are 1-based; columns are 0-based UTF-16.",
  obsidian_propose_changes: "Submit a candidate edit/create/move/trash group for LOCAL HUMAN REVIEW in Obsidian. Does not change vault files. For edits supply read revision and exact expected_text with from/to positions; preserve formulas unless asked to alter them. Moves include linked-note changes. Submit request_id once, reuse it only for identical retries. Returns immediately; never wait/poll continuously for approval. No remote apply tool exists.",
  obsidian_get_change_status: "Read per-operation and per-hunk review results, applied steps, revisions and conflicts. Query after the user reviews or asks about the result; do not continuously poll."
};
export class AppError extends Error {
  constructor(public code: string, message: string) { super(message); }
}
export function fail(code: string, message: string): never { throw new AppError(code, message); }
