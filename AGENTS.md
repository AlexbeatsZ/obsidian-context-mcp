# Goal

Maintain a shareable Obsidian desktop context MCP with local human review,
file operations and recoverable writes. The public distribution supports any
configured vault, one checkout per vault and one independent runtime per host.

# Current State

- Version 0.2.0, MIT license. User authorized publishing the existing
  `AlexbeatsZ/obsidian-context-mcp` repository on 2026-10-18.
- Six stdio MCP tools expose context/list/search/read/propose/status only.
  There is no model API call, remote accept/restore or shell tool.
- `setup --vault` configures arbitrary desktop vaults. Fresh identity defaults
  to `notes`; existing identities such as `stem` are preserved. Reusing a
  project with another root/identity is refused to protect recovery state.
- Full desktop ZIP bundles the bridge, CLI, plugin, runtime scripts and docs;
  no npm dependency install is needed by desktop ZIP users. Node 22+ is needed.
- The plugin-only ZIP contains three plugin assets plus license notices. Tunnel client/credentials
  are obtained independently by each user. The deployment guide is the public
  entrypoint; older operations/acceptance records are maintainer history.
- Windows local test suite: 57 tests passed plus a release extraction smoke
  test. Production bundles and dependency notices generated. Cross-platform
  CI is configured for Windows/macOS/Linux; inspect current runs before
  claiming they passed. No fresh 0.2.0 Obsidian UI or ChatGPT web acceptance.
- Historical Windows local review and real ChatGPT calls passed. Mac local
  and Web calls passed historically; Mac inline decisions/recovery remain
  unverified. Source/build/stdio/Tunnel ready are distinct from real UI checks.
- Existing maintainer runtime and plugin state are retained in ignored `.local`.
  Windows uses login startup only and manual recovery, with no periodic
  supervisor. Actual logout/reboot acceptance remains untested.

# Active Work

- Publish and validate v0.2.0, then record the resulting public release and CI.
- Each new user's actual ChatGPT workspace permission and local review UI need
  their own acceptance. Do not use real course notes for write testing.
- macOS real local review/conflict/recovery and Linux desktop UI remain pending.
- Multi-vault Windows startup entries currently have a single fixed task and
  shortcut name. Manual runtime aliases can differ; do not install that entry
  repeatedly for unrelated project copies.

# Build / Run / Test

- Source: `npm ci`, `npm run check`, `npm run package`.
- Release: `node --import tsx --test tests/distribution.smoke.ts` after packaging.
  This extracts the release into platform temporary `.agents` storage and
  uses a simulated plugin with a real stdio MCP bridge, without node_modules.
- Install: `npm run setup -- --vault <absolute-vault-path>`, set the plugin's
  local project directory, reload Obsidian, `npm run doctor`.
- Local calls: `npm run tools`, `npm run context` or
  `node dist/call.cjs <tool> [arguments.json]`.
- Tunnel: `tunnel:configure`, `tunnel:start`, `tunnel:status`, `tunnel:stop`.
  Existing runtime profiles must not be overwritten for distribution testing.
- Windows optional startup: `tunnel:autostart:install/status/uninstall` and
  `tunnel:shortcut`. Read lifecycle design before changes.
- Package script uses an explicit allowlist. `.local`, Vault notes, tokens,
  backups and credentials must never be staged or distributed.
- Keep manifest/package/lockfile/service versions consistent. Bundle inputs
  drive third-party license notices. Release includes the full ZIP, plugin ZIP
  and individual plugin assets. Commit and push completed changes.

# Design Index

- `docs/DEPLOYMENT.zh-CN.md`: new-user setup, acceptance, update and rollback.
- `docs/DISTRIBUTION.md`: sharing model, product limitations and release steps.
- `docs/PRIVACY.md`: actual data exposure and local state.
- `docs/design/workflow.md`: review, link planning, conflicts and recovery.
- `docs/design/macos.md`: original host-local runtime boundaries.
- `docs/design/tunnel-runtime.md`: login-only startup and manual recovery.
- `docs/API.md`: tool schemas and revisions.

Read corresponding design documents before changing those modules; update them
when semantics change. User-facing UI should show tasks and state concisely.

# Durable Lessons

- Plugin onload can precede Vault hydration. Validate restored proposals and
  start the listener only on workspace layout readiness.
- Use editor buffers for revisions, and recheck before each write. Synced assets
  are not a working host runtime: pairing/proposals/Tunnel state stay local.
- Deferred Markdown leaves must be loaded before navigation. Proposal persistence
  and successful MCP responses cannot depend on local navigation/rendering.
- CodeMirror disables a ViewPlugin that throws. Guard toolbar/widget rendering,
  log locally and retain bar-independent local review commands.
- Keep selections/scroll anchored while applying local character edits; a
  whole-document replacement formerly jumped the cursor and viewport.
- Link masking must handle quoted/indented/multiline code and reference URLs.
- A remote probe 429 has accompanied a stopped Tunnel with healthy stdio.
  Establish local bridge, runtime and actual remote call separately; ready alone
  is insufficient and the original exit cause may remain unknown.
- Release CLI must be bundled too. A plugin ZIP or bridge alone does not provide
  dependency-free diagnostic commands to a new user.
