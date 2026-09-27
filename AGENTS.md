# Goal

Implement a standalone Obsidian context MCP with local diff approval, complete
file operations and recoverable writes. Windows/STEM is the only deployment.

# Current State

- TypeScript v0.1.0 plugin and independent stdio MCP bridge implemented; deployed only to Windows STEM on Obsidian 1.13.7.
- 38 meaningful tests, type checking and production build pass. Independent stdio client and `npm run mcp` discover all six tools.
- Real UI verifies source/rendered selections, browser blur, clear selection, inline Markdown review, unified/split file review, partial accepts, conflict blocking, create, linked move, attachment rename, trash and local restoration.
- Dedicated Tunnel `tunnel_6ab8e356341081918c02253bec374df6` is connected to the Xia ChatGPT app. A real web chat completed context/read, proposal and status calls; runtime status was `ready` at the last check.
- No model API calls and no remote approval endpoint.
- Design index: `docs/design/workflow.md`, `docs/API.md`; operations: `docs/OPERATIONS.md`; evidence: `docs/ACCEPTANCE.md`.

# Active Work

- Inline Markdown review is deployed and packaged. It shows candidate text below original lines with per-hunk buttons; the manager handles new files and linked moves. See `docs/design/workflow.md` before changing this routing.
- Remote test proposal `6eece0ce-1037-4d2e-bc42-c66623497325` is intentionally pending in Obsidian. Its target `MCP验收测试/ChatGPT远程候选.md` does not exist until locally accepted.
- The initial web proposal response failed after persistence because the restored manager leaf was deferred. The fix loads it before selection and skips redraw for unloaded leaves; repeat with the same request ID succeeded.
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
- `getLeavesOfType()` can return a deferred leaf after Obsidian reload. Call `loadIfDeferred()` before using its custom view methods; background redraw should skip deferred leaves so proposal persistence does not appear to fail remotely.
- Code masking must parse blockquote/indented/multiline code, rather than matching plain fence lines only; Markdown reference definitions also contain relocatable URLs.
