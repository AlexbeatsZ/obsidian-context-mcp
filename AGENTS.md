# Goal

Implement a standalone Obsidian context MCP with local diff approval, complete
file operations and recoverable writes. Windows and macOS each target their
local STEM vault; no Manage or mobile deployment.

# Current State

- TypeScript v0.1.0 plugin and independent stdio MCP bridge implemented; deployed only to Windows STEM on Obsidian 1.13.7.
- 43 meaningful tests, type checking and production build pass on Windows. Independent stdio client and `npm run mcp` discover all six tools.
- Real UI verifies source/rendered selections, browser blur, clear selection, inline review for Markdown edits and file operations, partial accepts, conflict blocking, create, linked move, attachment rename, trash and local restoration. The former full-page review view was removed.
- Dedicated Tunnel `tunnel_6ab8e356341081918c02253bec374df6` is connected to the Xia ChatGPT app. A real web chat completed context/read, proposal and status calls; runtime status was `ready` at the last check.
- No model API calls and no remote approval endpoint.
- Design index: `docs/design/workflow.md`, `docs/design/macos.md`, `docs/API.md`; operations: `docs/OPERATIONS.md`; evidence: `docs/ACCEPTANCE.md`.

# Active Work

- All review appears in Markdown note editors, deployed to STEM and packaged. Text candidates appear under their original lines; new files, moves, attachments and trash appear in compact blocks at the top of a note. See `docs/design/workflow.md` before changing presentation or routing.
- Remote test proposal `6eece0ce-1037-4d2e-bc42-c66623497325` is completed/accepted; `MCP验收测试/ChatGPT远程候选.md` exists. Two subsequent inline UI test proposals were rejected without writing their targets.
- A web proposal once persisted but returned an error because the old review view was deferred. The view is removed and local navigation/rendering no longer gates the MCP proposal response.
- QA fixtures and proposals are in `STEM/MCP验收测试`; retain evidence in `.local/qa`. Do not change course notes for write tests.
- macOS adaptation is in progress: host-local project default, canonical Vault identity, portable package and credential-stripping Tunnel entrypoint pass Windows tests. Deploy, real Mac MCP calls and separate Tunnel connection remain to verify.

# Build / Run / Test

- `npm ci`, `npm run check`.
- `npm run deploy -- C:/Users/Meta/Documents/Obsidian/STEM` (Windows) or `npm run deploy -- /Users/meta/Documents/Obsidian/STEM` (macOS).
- `npm run mcp`; `npm run tunnel:start`, `tunnel:status`, `tunnel:stop`.
- `npm run package` creates a plugin ZIP in `dist`; `npm run rollback` restores this plugin's prior deployment only and keeps local recovery state.
- Review-engine, transport or link changes require their corresponding tests.
- Credentials and state belong only in ignored `.local/` / `.env.local`.

# Durable Lessons

- Revision checks must use editor buffers when open, and recheck inside each
  write. Never treat a healthy Tunnel as proof of tool or UI acceptance.
- Read design docs before altering approval, link planning or recovery.
- Plugin onload can precede Vault hydration: validate restored proposals and start the listener on workspace.onLayoutReady. Static Node imports are needed in the Electron plugin; raw dynamic Node imports fail.
- `getLeavesOfType()` can return deferred leaves after Obsidian reload. Load the Markdown leaf before opening an inline review, and do not make a successful MCP proposal response depend on local UI navigation.
- Code masking must parse blockquote/indented/multiline code, rather than matching plain fence lines only; Markdown reference definitions also contain relocatable URLs.
- Synced plugin assets are not a working Mac runtime: the Mac project, pairing,
  proposals and Tunnel profile must stay local to that host. Do not reuse the
  Windows Tunnel ID. Root comparison uses real paths and folds case only on Windows.
