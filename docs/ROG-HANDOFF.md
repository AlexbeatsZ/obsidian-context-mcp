# ROG continuation: candidate acceptance jumps

Migration verified on 2026-10-06. The user requested that this project's code be
moved to ROG so subsequent computer control and debugging can happen there.

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

## Next work on ROG

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
