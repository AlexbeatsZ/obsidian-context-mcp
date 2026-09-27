# Context, approval and runtime boundaries

The plugin owns note state and all writes. Six remote tools provide discovery,
reading, candidate submission and status only. Neither the HTTP dispatcher nor
the MCP bridge exposes accept, restore, shell or unrestricted filesystem calls.

Context survives blur, but explicit selection clearing in the note is recorded.
Programmatic review navigation is excluded from current-note tracking. Reading selections are
rendered text without fabricated source offsets. Revisions use full editor text
when available, otherwise a fresh Vault read. Text positions are 1-based lines,
0-based UTF-16 columns; CRLF and trailing newlines are preserved.

Each proposal contains immutable baselines and stable line-diff hunks. Accepted
hunks write immediately; remaining offsets derive from the immutable baseline
and accepted hunks only. External changes conflict; no fuzzy rebase occurs.
Create/trash/move are indivisible. Move and all inbound/outbound link changes
form one review group. Wiki/Markdown links preserve aliases and fragments;
fenced/inline code and external URLs are excluded. Vault.rename is intentional:
the plugin submits exactly the previously reviewed link changes.

Batch accept preflights all pending operations, then writes serially. It is not
a filesystem transaction. Write-ahead recovery records and preimages are kept
locally. A failed batch stops, retaining truthful partial results. Recovery is a
local action and checks after-images before reversing completed journal steps.
Interrupted writes are reconciled conservatively; ambiguous states block.

Symlinks and hidden/config/system paths are excluded. Files only; no recursive
folder deletes, cross-vault moves, overwrite moves or cyclic path plans.

Project .local holds pairing, endpoints, proposals and backups, not the synced
vault. A fresh token and port identify each plugin lifetime. The bridge checks
the configured root and vault identity. Tunnel credentials/proxy are scoped to
tunnel-client and stripped from the stdio child. A dedicated tunnel avoids
changing the existing general-purpose Codex MCP service.

## Review presentation (2026-09-27)

Markdown edits default to the actual note editor. Original changed lines remain
in the document with a red tint; read-only green candidate blocks sit immediately
below them. The blocks are CodeMirror decorations, never document content. Local
Accept/Reject buttons address immutable hunk IDs. Earlier accepted changes are
the only offset adjustment; any other document change hides stale decorations
and the existing engine blocks acceptance. Inline navigation preserves the last
user context until a real pointer/key interaction in a note resumes tracking.

The note toolbar has a proposal selector, a file selector for multi-note edits,
Accept all, Reject all and Recovery when applicable. Explanatory guidance is
omitted. New files, non-Markdown edits, attachments, linked moves and trash use
compact block widgets at the top of an existing Markdown note. The source note
hosts moves/trash of Markdown files; otherwise the last user note hosts the
block. Candidate file bytes never enter that host note's document. A linked
move shows changed lines from every affected note in the same block and exposes
only whole-operation approval. Empty-vault fallback reports that a note is
needed for review; Windows STEM always has Markdown notes.

There is no separate review view or CodeMirror Merge pane. On load, the plugin
detaches leaves of the retired view type. Proposal persistence and the MCP
response do not depend on successful local navigation or rendering. Reopening
the command/ribbon shows the newest pending proposal; the toolbar selector can
also revisit completed proposals for recovery. When a local decision finishes
all remaining operations, the inline review block closes.

Visual reference: Smart Composer Apply Edit, specifically full-note flow,
removed text above added text and controls beside each change. Its model/chat
and write implementations are not adopted.
