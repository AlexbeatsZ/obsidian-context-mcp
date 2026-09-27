# Obsidian Context MCP

A desktop Obsidian plugin and an independent MCP server. Get the current STEM
note/selection, search files, and submit candidate changes. Every write is
reviewed in Obsidian, including linked-note updates for file moves.

## Build and deploy

```powershell
npm ci
npm run check
npm run deploy -- C:/Users/Meta/Documents/Obsidian/STEM
```

Reload Obsidian, or enable **Obsidian Context MCP** in community plugins. Its
settings store the local project directory outside synced plugin data.
Markdown edits appear in the note itself: original lines are tinted red and
candidate lines appear below in green, with local Accept/Reject buttons. Use
the compare icon or **审阅候选修改** for proposal history and file operations.

## Local MCP

`npm run mcp` starts stdio. For a coding-agent client use command `node` with
the absolute argument `C:/Users/Meta/Project/Workspaces/obsidian-context-mcp/dist/mcp.cjs`
and `OBSIDIAN_MCP_PROJECT` set to that project directory.
No model API key is required by this server. Obsidian must be open and paired.

## ChatGPT Tunnel

`.local/tunnel.json` configures `client`, `credential_source`, `alias` and the
dedicated `tunnel_id`. The existing credential source is read only to launch
tunnel-client; credentials and the proxy are stripped from the MCP child.

```powershell
npm run tunnel:start
npm run tunnel:status
npm run tunnel:stop
```

The dedicated ChatGPT app is connected at
[Obsidian Context MCP — STEM Windows](https://chatgpt.com/plugins/plugin_asdk_app_6ab8ea1ed0b88191a8ff5e04e29bf2f8).
Start the runtime before using it; refresh ChatGPT tool metadata after schema
changes. The web chat has completed real read, propose and status calls.

## Review and restore

Accept/reject individual text hunks or an entire proposal. File creation, moving
with links, and recoverable deletion are grouped actions. No remote accept tool.
External edits cause a conflict; read again and generate a new proposal.

**恢复已应用修改** checks the current after-images and reverses completed steps.
It refuses to overwrite subsequent work. If a crash leaves an uncertain step,
inspect `.local/journals/stem` and `.local/backups`; never replay it blindly.
Recovery copies are retained until explicitly cleaned up.

Deployment backups are in `.local/deployment-backups`. To roll back, disable the
plugin and restore its previous three assets; restore enabled-plugin JSON only
after comparing it with current settings. Keep `.local` for proposal recovery.

See [API](docs/API.md) and [design boundaries](docs/design/workflow.md).
