# Context, approval and runtime boundaries

The plugin owns note state and all writes. Six remote tools provide discovery,
reading, candidate submission and status only. Neither the HTTP dispatcher nor
the MCP bridge exposes accept, restore, shell or unrestricted filesystem calls.

Context survives blur, but explicit selection clearing in the note is recorded.
Programmatic review navigation is excluded from current-note tracking. Reading selections are
rendered text without fabricated source offsets. Revisions use full editor text
when available, otherwise a fresh Vault read. Text positions are 1-based lines,
0-based UTF-16 columns; CRLF and trailing newlines are preserved.

Each proposal contains a baseline and stable line-diff hunks. Accepted hunks
write immediately. When the note changes outside the review (user typing, other
plugins), pending hunks are rebased exactly: a line diff from the expected text
to the current text must not touch any pending hunk's lines (insertions at the
same point also conflict). Then the baseline becomes the current text, settled
hunks become zero-width no-ops and pending offsets shift. Touching a pending
line is a conflict; no fuzzy matching occurs. Vault-check conflicts are marked
`stale` and rechecked on every change, so undoing the touching edit revives the
candidates. Errors from failed writes or interrupted journals stay permanent.
Create/trash/move are indivisible. Move and all inbound/outbound link changes
form one review group. Wiki/Markdown links preserve aliases and fragments;
fenced/inline code and external URLs are excluded. Vault.rename is intentional:
the plugin submits exactly the previously reviewed link changes.

Batch accept preflights all pending operations, then writes serially. It is not
a filesystem transaction. Write-ahead recovery records and preimages are kept
locally. A failed batch stops, retaining truthful partial results. Recovery is a
local action and checks after-images before reversing completed journal steps.
Interrupted writes are reconciled conservatively; ambiguous states block.
Undoing a text write whose after-image was later edited uses a three-way line
merge (after-image, current, backup); it fails only when the later edit touched
the accepted lines. `recovery_error` is set only after at least one step was
reversed (a real half-undone state); a recovery that reverses nothing leaves the
proposal usable and only reports the error.

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

Styling follows VS Code's inline diff: faint red/green line tint with a 2px
bar and stronger intra-line word highlights (`diffWordsWithSpace` with a
Chinese `Intl.Segmenter`, skipped when the blocks share <30%). Green candidate
blocks render Markdown like Live Preview (math, callouts); clicking shows the
source, clicking back into the note restores rendering. Removed lines are real
note lines and keep Live Preview rendering; lines Obsidian replaces with block
widgets (callouts, display math) cannot carry the red line tint.

The review bar holds a proposal selector (pending plus the 10 most recent
completed), a note selector for multi-note edits, +/− line counts, previous/next
hunk navigation, progress, and actions: 撤销已接受 (= recovery; two-click
confirm; restores everything the proposal wrote and ends it), 全部拒绝/拒绝其余
(discard pending, no write) and 全部接受/接受其余. There is deliberately no close
button: a "hide but keep" action was removed (2026-10-16) because users read it
as discarding the candidates. A proposal leaves the note only by being decided.
Conflicts and partial recovery appear in a
banner with 放弃剩余候选. Tooltips explain every action. New files, non-Markdown edits, attachments, linked moves and trash use
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

The review bar is a CodeMirror ViewPlugin. CodeMirror permanently disables a
plugin whose constructor or update throws, while the decoration StateField keeps
working — the symptom is candidate blocks without a bar that no command can
bring back. So bar rendering and widget `toDOM` are wrapped; failures go to the
console and once per message to project `.local/ui-errors.log`. Any update also
rebuilds a bar that is missing or detached. Commands 显示当前笔记的审阅栏,
接受当前提案的全部候选 and 拒绝当前提案的全部候选 act on the active note
without the bar and can be bound to hotkeys.

A new proposal opens automatically only when no pending proposal is shown in a
visible editor. Otherwise it is queued (oldest first) with a Notice and a
「新提案 N」 button in the review bar; the proposal on screen is pinned as the
selection so a newer proposal for the same note cannot replace it. Finishing
the current proposal opens the next queued one. A retry of the proposal on screen only refreshes.

Visual reference: Smart Composer Apply Edit, specifically full-note flow,
removed text above added text and controls beside each change. Its model/chat
and write implementations are not adopted.
