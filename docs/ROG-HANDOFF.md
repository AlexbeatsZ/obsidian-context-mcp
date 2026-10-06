# ROG continuation: candidate acceptance jumps

Migration verified on 2026-10-06. The user requested that this project's code be
moved to ROG so subsequent computer control and debugging can happen there.

## Completed on ROG (2026-10-07)

The user confirmed they currently use OMEN, then explicitly requested testing on
ROG and installation of Obsidian there. Obsidian 1.14.4 was installed from its
official Windows release. The installer has a valid Dynalist Inc signature and
SHA256 `28662520368d5956df7798076b8370ac730164a8863dcd4f678ced53f63faa00`.
The user completed the first-open vault trust step. ROG generated its own local
configuration, pairing endpoint, proposals and recovery records; no Tunnel was
created or copied.

The original plugin reproduced the reported problem in a real ROG editor:
Accept kept the same leaf and note but changed the cursor from zero-based
`{line:38,ch:13}` to `{line:0,ch:0}` and scrollTop from 882 to 76.
The whole-document transaction was the confirmed trigger.

The fix sends local character changes to every open editor, skips no-op editor
transactions, and maps a CodeMirror scroll snapshot through document writes and
review refreshes. The decision snapshot remains active until the final refresh,
including when the last candidate closes. Explicit review/file navigation
retains its existing behavior. Conflicts and recovery checks are unchanged.

The fixed plugin is deployed and running in ROG STEM. Real buttons passed three
sequential accepts (scrollTop 882, 2132 and 3246 respectively), an out-of-viewport
cursor, a reversed selection at final completion, Accept all and Reject all.
The selected text maps correctly when an earlier accepted change adds a line.
The final toolbar naturally closes when review ends; no scroll-to-cursor or
note/tab navigation occurs. All three test proposals are completed, and their
disk text matches the accepted/rejected hunks exactly. All 49 automated tests,
type checks, production builds and packaging pass. Evidence stays ignored under
`.local/qa/scroll-acceptance-20261007.json`, the `legacy-*` / `fixed-*` measurements,
and the browser regression fixture. No course notes were written. This does not
establish OMEN or Mac UI acceptance of the fix.

## Project and migration

- Source host: `META-OMEN`.
- Destination host: `META-ROGALLY`, verified over SSH at `meta@192.168.31.32`.
- Both project paths: `C:\Users\Meta\Project\Workspaces\obsidian-context-mcp`.
- Destination vault: `C:\Users\Meta\Documents\Obsidian\STEM` already exists.
- ROG initially had no project directory. The complete repository history was
  cloned from an OMEN Git bundle, on branch `main`; `origin` remains
  `https://github.com/AlexbeatsZ/obsidian-context-mcp.git`.
- OMEN's repository is retained. No course-note edits were made.
- ROG uses its existing Node `24.14.1` and npm `11.11.0`. Project-local `npm ci`,
  all 43 tests, TypeScript checks, plugin build and stdio MCP build passed.
- Ignored OMEN `.local`, pairing, proposals, recovery journals, backups, Tunnel
  credentials and `node_modules` were not transferred. ROG installed its own
  project dependencies and generated its own builds.
- A synced plugin manifest already exists in ROG's STEM vault. This does not
  establish a running ROG plugin, local MCP connection or UI acceptance. No
  deployment, plugin reload or Tunnel setup was performed during migration.

## Reported behavior and current evidence

The user reports that every Accept causes an unexpected page jump, instead of
remaining at the current position. It has not yet been established whether this
means a different note/tab or a large scroll inside the same note.

Code inspection found:

- `src/inline-review.ts`: Accept/Reject buttons invoke `run()`, engine decisions
  and decoration refreshes. `run()` itself does not call review navigation.
- `src/obsidian-port.ts`: `write()` updates every open source editor with a
  transaction replacing the whole document. Even one accepted hunk uses that
  full replacement. Cursor mapping/scroll from this transaction is a suspected
  trigger, not a confirmed live cause.
- Explicit `InlineReview.open()` does navigate to the proposal's host and scroll
  to the first pending hunk. `src/main.ts` also opens review after candidate
  submission. Those paths need distinguishing from an actual Accept click.
- `docs/ACCEPTANCE.md` records an earlier scroll-to-top repair. That older
  acceptance does not disprove the current user report.

OMEN's native Obsidian window was observed, but the user stopped Computer Use
with Escape before a reproduction or DevTools verification. They then requested
the code migration to ROG. No source fix, new regression test or live acceptance
verification has occurred.

## Original investigation checklist (now completed)

1. Read `AGENTS.md` and `docs/design/workflow.md`. Reuse the existing STEM vault;
   restrict temporary write fixtures to `STEM/MCP验收测试`.
2. Establish ROG's own plugin/project configuration and runtime as needed.
   Never reuse OMEN's pairing, proposals or Tunnel ID. Local UI testing needs
   no ChatGPT Tunnel or model API.
3. Reproduce with a long QA note and several separated hunks. Record active
   leaf/note, editor selection and viewport before and after an Accept click,
   including when the cursor is away from the reviewed block.
4. Confirm the actual trigger, apply the smallest complete correction and verify
   partial accepts and the final block. Keep review decisions at the user's
   current location; explicit review/file selection may navigate intentionally.
5. Re-run affected tests and `npm run check`, deploy to ROG STEM, reload only as
   needed, then verify the real local buttons. Record build proof separately
   from live acceptance and commit/push the completed fix.
