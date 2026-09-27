# Context, approval and runtime boundaries

The plugin owns note state and all writes. Six remote tools provide discovery,
reading, candidate submission and status only. Neither the HTTP dispatcher nor
the MCP bridge exposes accept, restore, shell or unrestricted filesystem calls.

Context survives blur, but explicit selection clearing in the note is recorded.
Review leaves are excluded from current-note tracking. Reading selections are
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
