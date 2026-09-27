# macOS runtime and deployment

The macOS target is the local STEM vault at
`/Users/meta/Documents/Obsidian/STEM`. Its plugin files may arrive through Vault
sync, but its MCP pairing, proposals, journals, backups and Tunnel profile live
in the Mac's own `/Users/meta/Project/Workspaces/obsidian-context-mcp/.local`.
Never copy the Windows `.local` directory or reuse its Tunnel ID. Manage and
mobile vaults are outside this deployment.

The plugin's project default follows the host home directory. The deployed
project writes the canonical Vault root into local config; the plugin and stdio
bridge compare canonical roots, folding case only on Windows. This accepts path
aliases without weakening macOS's case-sensitive identity. The local listener
remains on `127.0.0.1` with a fresh token per plugin lifetime.

The `npm run package` command builds the same three-file ZIP on both hosts.
The portable Tunnel entrypoint is `scripts/start-mcp.mjs`, launched with an
absolute host-native Node path. It removes control-plane credentials and proxy
variables before starting `dist/mcp.cjs`. The old PowerShell launcher remains
only for an already-registered Windows runtime until that runtime is refreshed.

The Mac Tunnel has its own alias (`obsidian-context-stem-mac`), profile
directory, remote ID (`tunnel_6ab9425b741081919d5a7ba1f10a3641`) and
ChatGPT app. It is associated with the intended Personal/Xia scope. Runtime
credentials remain on the Mac outside the Vault and Git. Local MCP discovery,
real read calls and ChatGPT web read/propose/status calls passed on 2026-09-28.
Candidate decisions and recovery on the Mac UI require separate real acceptance.
