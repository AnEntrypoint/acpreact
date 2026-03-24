# CLAUDE.md

## Runtime

Node v22, ESM (type: module). No build step. All files import directly.

## Non-obvious caveats

- `parser.js` `parseTextOutput()`: agents that output JSON lines (kilo/opencode) are parsed via `{type:"text",part:{text:"..."}}` format. Agents that output plain text (claude --print) fall back to raw `output.trim()` when no JSON lines are found. The `hasJson` flag gates this — do not remove it.

- `adapters.js` Telegram: uses synchronous long-polling loop (`while(running)`). The `running` flag must be set before calling `poll()` and cleared to stop. No library — pure `fetch`.

- `adapters.js` Discord: `discord.js` is dynamically imported at runtime so the package can be installed without it for non-Discord use cases. Missing `discord.js` throws a clear install message.

- `core.js` default agent: falls back to `claude` (not `kilo`) when no services registered and no `options.cli` given. Only `claude` is system-installed in this environment.

- `bin.js` is the CLI entry and requires the `bin` field in `package.json`. It is an ES module with top-level await.

- `gui.js` requires a real TTY (`process.stdout.isTTY`). In non-TTY environments (pipes, CI) it prints a warning and skips rendering. Raw mode is set via `process.stdin.setRawMode(true)` — will throw in non-TTY.
