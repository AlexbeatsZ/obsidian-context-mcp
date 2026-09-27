# Goal

Implement a standalone Obsidian context MCP with local diff approval, complete
file operations and recoverable writes. Windows/STEM is the only deployment.

# Current State

- New TypeScript project; v0.1.0 implementation in progress.
- Independent stdio bridge, authenticated loopback plugin, dedicated Tunnel.
- No model API calls and no remote approval endpoint.
- Design index: `docs/design/workflow.md`, `docs/API.md`.

# Active Work

- Implement protocol, context, file operations, review, recovery and tests.
- Build, deploy and verify real STEM runtime before reporting acceptance.
- Prepare independent Tunnel, then connect and verify ChatGPT.

# Build / Run / Test

- `npm ci`, `npm run check`.
- `npm run deploy -- C:/Users/Meta/Documents/Obsidian/STEM`.
- `npm run mcp`; `npm run tunnel:start`, `tunnel:status`, `tunnel:stop`.
- Review-engine, transport or link changes require their corresponding tests.
- Credentials and state belong only in ignored `.local/` / `.env.local`.

# Durable Lessons

- Revision checks must use editor buffers when open, and recheck inside each
  write. Never treat a healthy Tunnel as proof of tool or UI acceptance.
- Read design docs before altering approval, link planning or recovery.
