# CLAUDE.md

## Runtime

Node v22 / Bun v1.3+, ESM (type: module). No build step. All files import directly.

`web.js` requires Bun runtime (`Bun.serve`, `Bun.sleep`) — not compatible with plain Node.

## Non-obvious caveats

- `parser.js` `parseTextOutput()`: agents using JSON lines (kilo/opencode) are parsed via `{type:"text",part:{text:"..."}}`. Agents with plain text output (claude --print) fall back to `output.trim()` when no JSON lines found. The `hasJson` flag gates this — removing it breaks claude output.

- `adapters.js` Telegram: uses a `while(running)` long-poll loop. The `running` flag must be set `true` before `poll()` starts. Clearing it stops the loop — no explicit kill needed.

- `adapters.js` Discord: `discord.js` is dynamically imported at call time. Missing `discord.js` throws a clear install message, not a module-not-found crash at startup.

- `web.js` `createWebGUI`: the `agent` option is both the display label AND the `{ cli: agent }` option passed to `acp.process()`. If you call `gui.setACP(acp)` where `acp` already has a service stack, the web GUI still overrides with `{ cli: agent }` per message — those two sources of truth can conflict.

- `core.js` default agent: falls back to `claude` when no services registered and no `options.cli` given.

- `core.js` tool store is a `Map` (name → `{description, schema, handler}`). The old separate `toolSchemas`/`toolDescriptions`/`tools` object properties no longer exist — code that accessed them directly will break.
