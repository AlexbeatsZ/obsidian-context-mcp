# Goal

Implement a standalone Obsidian context MCP with local diff approval, complete
file operations and recoverable writes. Windows and macOS each target their
local STEM vault; no Manage or mobile deployment.

# Current State

- TypeScript v0.1.0 plugin and independent stdio MCP bridge implemented; deployed to the local STEM vaults on Windows and macOS.
- 43 meaningful tests, type checking and production build pass on both hosts. Independent stdio clients discover all six tools.
- Windows real UI verifies source/rendered selections, browser blur, clear selection, inline review for Markdown edits and file operations, partial accepts, conflict blocking, create, linked move, attachment rename, trash and local restoration. The former full-page review view was removed. Mac UI review remains unverified.
- Dedicated Tunnel `tunnel_6ab8e356341081918c02253bec374df6` is connected to the Xia ChatGPT app. A real web chat completed context/read, proposal and status calls; runtime status was `ready` at the last check.
- On 2026-09-28 the Windows runtime was found `stopped` after ChatGPT reported `McpServerError: Session terminated`; local stdio still returned the selected text. `npm run tunnel:start` restored `ready`, and the same ChatGPT chat successfully called `obsidian_get_context`. The underlying exit trigger is not established; see `docs/ACCEPTANCE.md` and `docs/OPERATIONS.md`.
- On 2026-10-07 the user urgently requested local OMEN MCP recovery. Local stdio returned the current STEM note and the non-empty selection `系数`, while the dedicated Windows Tunnel was `stopped`. `npm run tunnel:start` restored `ready`; a second local context call passed. No plugin reload, config change or note write was needed. A fresh remote ChatGPT call remains unverified; the exit trigger is still unknown.
- Separate Mac Tunnel `tunnel_6ab9425b741081919d5a7ba1f10a3641` and ChatGPT app are connected. Mac local and web context/search/read/propose/status calls passed; Mac UI candidate approval and recovery still require real acceptance. See `docs/ACCEPTANCE.md`.
- No model API calls and no remote approval endpoint.
- META-OMEN Antigravity Desktop 2.19.1 and Claude Windows Store Desktop 2.19675.1.0 are configured with local stdio server `obsidian-context-stem-windows` (2026-10-06). Both exact configurations passed six-tool discovery and live STEM context retrieval. Antigravity generated six tool definitions and runs the MCP as a language-server child; Claude runtime logs confirm connection and announcement of all six tools. Existing MCP entries/settings were preserved. Config paths and narrow rollback are in `docs/OPERATIONS.md`.
- Git remote is `https://github.com/AlexbeatsZ/obsidian-context-mcp.git` (`origin`, branch `main`). Machine-specific configuration backups and QA evidence stay ignored under `.local/`.
- On 2026-10-06, the complete Git repository was copied from META-OMEN to META-ROGALLY at the same project path. ROG's existing Node 24.14.1/npm 11.11.0 ran project-local `npm ci` and all 43 tests, type checking and production builds successfully. OMEN's checkout remains available. Host-local `.local` state and Tunnel credentials were not copied; ROG plugin/runtime acceptance was pending at handoff and completed below. See `docs/ROG-HANDOFF.md`.
- On 2026-10-07, Obsidian 1.14.4 was installed on ROG from the official release with verified publisher signature and installer SHA256. ROG's own STEM plugin/runtime is connected. The acceptance scroll jump was reproduced on the original build, fixed, deployed and verified with real local buttons. All 49 tests, type checking and production builds pass. See `docs/ACCEPTANCE.md`; ROG has no ChatGPT Tunnel configured.
- Design index: `docs/design/workflow.md`, `docs/design/macos.md`, `docs/API.md`; operations: `docs/OPERATIONS.md`; evidence: `docs/ACCEPTANCE.md`.

# Active Work

- Acceptance scroll jump fixed on ROG (2026-10-07): whole-document replacement moved the cursor from line 39 to the start and scrollTop from 882 to 76 in the same leaf. `ObsidianPort.write()` now sends local character changes; `InlineReview` maps a CodeMirror scroll snapshot through writes and refreshes until the decision finishes. Real partial/final accepts, reverse selection, cursor outside viewport, Accept all and Reject all passed. Preserve this behavior; use only `STEM/MCP验收测试` for write tests. OMEN and Mac have not independently verified this fix.
- All review appears in Markdown note editors, deployed to STEM and packaged. Text candidates appear under their original lines; new files, moves, attachments and trash appear in compact blocks at the top of a note. See `docs/design/workflow.md` before changing presentation or routing.
- Remote test proposal `6eece0ce-1037-4d2e-bc42-c66623497325` is completed/accepted; `MCP验收测试/ChatGPT远程候选.md` exists. Two subsequent inline UI test proposals were rejected without writing their targets.
- A web proposal once persisted but returned an error because the old review view was deferred. The view is removed and local navigation/rendering no longer gates the MCP proposal response.
- QA fixtures and proposals are in `STEM/MCP验收测试`; retain evidence in `.local/qa`. Do not change course notes for write tests.
- macOS local deployment and ChatGPT candidate/status calls are complete. Pending Mac QA proposal `513470ed-bd0d-4cc4-a7bd-57679de54300` creates `MCP验收测试/Mac端内联审阅验收.md` only after local approval. Remaining Mac acceptance: local inline decisions, conflict and restart recovery. Do not claim these from Windows testing alone.

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
