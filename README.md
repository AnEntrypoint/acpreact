# acpreact

Multi-agent ACP SDK with chat platform adapters and a zero-dependency TUI.

## Features

- **8 CLI agents**: claude (default), kilo, opencode, gemini, aider, codex, goose, amp
- **4 chat adapters**: Discord, Telegram, Slack, Webhook
- **Rate-limit fallback**: automatic failover across a service stack
- **TUI**: zero-dep terminal dashboard via `--gui`
- **CLI**: `acpreact --gui` to launch interactively

## Installation

```bash
npm install acpreact
```

## CLI Usage

```bash
acpreact "What is 15 + 27?"                         # run prompt via claude (default)
acpreact --agent kilo "refactor this"               # use a specific agent
acpreact --gui                                       # launch TUI
acpreact --gui --adapter discord                     # TUI + Discord adapter
acpreact --gui --adapter telegram                    # TUI + Telegram adapter
acpreact --gui --adapter slack --port 3000           # TUI + Slack Events API
acpreact --gui --adapter webhook --port 3000         # TUI + generic webhook
acpreact --list                                      # list agents and adapters
```

Environment variables:

| Var | Purpose |
|---|---|
| `ACPREACT_AGENT` | Default agent (overrides claude) |
| `DISCORD_BOT_TOKEN` | Discord adapter |
| `TELEGRAM_BOT_TOKEN` | Telegram adapter |
| `SLACK_BOT_TOKEN` | Slack adapter |

## API

### ACPProtocol

```javascript
import { ACPProtocol } from 'acpreact';

const acp = new ACPProtocol('You are a helpful assistant.', [
  { cli: 'claude' },
  { cli: 'kilo' },
  { cli: 'opencode' },
]);

acp.registerTool('reply', 'Send a reply', {
  type: 'object',
  properties: { message: { type: 'string' } },
  required: ['message']
}, async (params) => ({ sent: params.message }));

const result = await acp.process('Hello!');
console.log(result.text);       // human-readable response
console.log(result.toolCalls);  // executed tool calls
```

**Constructor**: `new ACPProtocol(instruction?, services?)`
- `instruction`: system prompt prepended to every call
- `services`: `[{ cli, profile?, model? }]` — fallback stack

**process(text, options?)** — run a prompt
- `options.cli`: agent name (overrides constructor stack)
- `options.services`: per-call fallback stack
- `options.model`: model name
- `options.timeout`: ms (default 120000)
- Returns `{ text, rawOutput, toolCalls, logs }`
- Throws `AggregateError` when all services exhausted

**Fallback events**: `rate-limited`, `fallback`, `success`

### Adapters

```javascript
import { createAdapter } from 'acpreact';

const adapter = await createAdapter('discord', { token: process.env.DISCORD_BOT_TOKEN });
adapter.onMessage(async (msg) => {
  const result = await acp.process(msg.content);
  await adapter.send(msg.channelId, result.text);
});
await adapter.start();
```

Adapter types: `discord` · `telegram` · `slack` · `webhook`

Each adapter: `{ start(), stop(), send(channelId, text), onMessage(fn) }`

Telegram and Slack require no library — pure `fetch` long-polling / HTTP.

### GUI (TUI)

```javascript
import { createGUI } from 'acpreact';

const gui = createGUI({ agent: 'claude', version: '1.2.0' });
gui.addAdapter('discord');
gui.log('Bot started', 'out');
gui.start(async (prompt) => {
  const result = await acp.process(prompt);
  gui.log(result.text);
});
```

Zero dependencies — uses Node built-in `readline` + ANSI escape codes.

### Service Stack / Fallback

```javascript
import { createServiceStack, FallbackEngine } from 'acpreact';

const stack = createServiceStack([{ cli: 'claude' }, { cli: 'kilo' }, { cli: 'gemini' }]);
acp.on('rate-limited', ({ name, cooldownMs }) => console.log(name, 'cooling down', cooldownMs));
acp.on('fallback', ({ from, to }) => console.log('fallback:', from.name, '->', to.name));
```

### dadapter (Discord bot)

[dadapter](https://github.com/AnEntrypoint/dadapter) is a thin entry-point that wires the Discord adapter to ACPProtocol:

```bash
DISCORD_BOT_TOKEN=xxx ACPREACT_AGENT=claude node index.js
```

## Agents

| Agent | Binary | Args format |
|---|---|---|
| claude | `claude` | `claude --print [--model M] <prompt>` |
| kilo | `kilo` | `kilo run --format json --auto [--model M] <prompt>` |
| opencode | `opencode` | `opencode run --format json [--model M] <prompt>` |
| gemini | `gemini` | `gemini run [--model M] <prompt>` |
| aider | `aider` | `aider --message <prompt> --yes --no-auto-commits` |
| codex | `codex` | `codex [--model M] <prompt>` |
| goose | `goose` | `goose run --text <prompt>` |
| amp | `amp` | `amp run [--model M] <prompt>` |

## License

ISC
