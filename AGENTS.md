# Goal

Implement a standalone Obsidian context MCP with local diff approval, complete
file operations and recoverable writes. Windows/STEM is the only deployment.

# Current State

- TypeScript v0.1.0 plugin and independent stdio MCP bridge implemented; deployed only to Windows STEM on Obsidian 1.13.7.
- 34 meaningful tests, type checking and production build pass. Independent stdio client and `npm run mcp` discover all six tools.
- Real UI verifies source/rendered selections, browser blur, clear selection, unified/split review, partial accepts, conflict blocking, create, linked move, attachment rename, trash and local restoration.
- Dedicated Tunnel profile/scripts prepared; new service connection awaits user authorization. No Tunnel has been created for this project yet.
- No model API calls and no remote approval endpoint.
- Design index: `docs/design/workflow.md`, `docs/API.md`; operations: `docs/OPERATIONS.md`; evidence: `docs/ACCEPTANCE.md`.

# Active Work

- Local implementation, final deployed parser/recovery status checks and packaging complete. The last inverse-move proposal displayed the expected link diffs and was entirely rejected; no files changed.
- After authorization, create dedicated Tunnel `Obsidian Context MCP — STEM Windows`, alias `obsidian-context-stem-win`; attach ChatGPT and verify real read + propose. Do not call first-version end-to-end acceptance complete before those calls.
- QA fixtures and proposals are in `STEM/MCP验收测试`; retain evidence in `.local/qa`. Do not change course notes for write tests.

# Build / Run / Test

- `npm ci`, `npm run check`.
- `npm run deploy -- C:/Users/Meta/Documents/Obsidian/STEM`.
- `npm run mcp`; `npm run tunnel:start`, `tunnel:status`, `tunnel:stop`.
- `npm run package` creates a plugin ZIP in `dist`; `npm run rollback` restores this plugin's prior deployment only and keeps local recovery state.
- Review-engine, transport or link changes require their corresponding tests.
- Credentials and state belong only in ignored `.local/` / `.env.local`.

# Durable Lessons

- Revision checks must use editor buffers when open, and recheck inside each
  write. Never treat a healthy Tunnel as proof of tool or UI acceptance.
- Read design docs before altering approval, link planning or recovery.
- Plugin onload can precede Vault hydration: register view/state early, but validate restored proposals and start the listener on workspace.onLayoutReady. Static Node imports are needed in the Electron plugin; raw dynamic Node imports fail.
- Code masking must parse blockquote/indented/multiline code, rather than matching plain fence lines only; Markdown reference definitions also contain relocatable URLs.
