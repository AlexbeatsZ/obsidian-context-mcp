# MCP API v1

Server: `obsidian-context-mcp`, version 0.1.0, transport stdio.
All paths are STEM-relative. Lines start at 1; columns are UTF-16, starting at 0.
All tools accept JSON objects. Results are both structuredContent and JSON text.
Errors have `isError: true` and `{error:{code,message}}`.

- `obsidian_get_context({nearby_lines?:12})`: last note/selection snapshot,
  full-content revision, cursor, neighboring text, open/recent/linked notes.
- `obsidian_list_files({path?:"",type?:"all",offset?:0,limit?:100})`: visible
  file metadata and `total`, `truncated`, `next_offset`.
- `obsidian_search({query,path?:"",max_results?:20})`: AND keywords, ranked
  snippets; reports scan completeness. Follow with read_file.
- `obsidian_read_file({path,start_line?:1,line_count?:200})`: text or binary
  metadata. Text output capped at 32 Ki UTF-16 characters. Large individual
  lines set `partial_line`; use smaller ranged edits instead of a whole rewrite.
- `obsidian_propose_changes({request_id,title?,operations})`: persistent
  candidate, no vault write. Identical retries are deduplicated.
- `obsidian_get_change_status({proposal_id})`: decisions, conflicts, applied
  steps, recovery IDs and current expected revision.

```json
{
  "request_id": "rewrite-paragraph-001",
  "title": "修订推导",
  "operations": [{
    "kind": "edit", "path": "气体.md", "base_revision": "text:...",
    "edits": [{"from":{"line":3,"ch":0},"to":{"line":3,"ch":3},
      "expected_text":"原文字","replacement":"新文字"}]
  }]
}
```

Other operation shapes:
`{kind:"create",path,content}`;
`{kind:"move",path,to,base_revision}`;
`{kind:"trash",path,base_revision}`.
Only listed text extensions support create/edit. Attachments support metadata,
move and recoverable trash. Overlapping paths in one proposal are rejected;
submit the dependent follow-up after reviewing the first proposal.

The local authenticated HTTP endpoint is POST /rpc with `{name,arguments}` and
returns `{result}` or `{error}`. It exposes exactly the six MCP tools. Approval
and restoration are UI-only. Pairing tokens rotate every plugin load.

Text changes are line hunks. Adjacent changes form one hunk. Accepting a hunk
writes immediately; rejected hunks keep their original content. Status queries
do not wake a ChatGPT turn or push unsolicited messages.
