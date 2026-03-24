# acpreact

Multi-agent ACP SDK with chat platform adapters and a Bun web GUI.

## Features

- **8 CLI agents**: claude (default), kilo, opencode, gemini, aider, codex, goose, amp
- **4 chat adapters**: Discord, Telegram, Slack, Webhook
- **Rate-limit fallback**: automatic failover across a service stack
- **Web GUI**: single-page app via Bun.serve + WebSocket + Tailwind (`--web`)
- **CLI**: `acpreact --web` to launch browser dashboard

## Installation

```bash
npm install acpreact
```

## CLI Usage

```bash
acpreact "What is 15 + 27?"                         # run prompt via claude (default)
acpreact --agent kilo "refactor this"               # use a specific agent
acpreact --web                                       # launch web GUI (Bun runtime)
acpreact --web --adapter discord                     # web GUI + Discord adapter
acpreact --web --adapter telegram                    # web GUI + Telegram adapter
acpreact --web --adapter slack --port 3000           # web GUI + Slack Events API
acpreact --web --adapter webhook --port 3000         # web GUI + generic webhook
acpreact --list                                      # list available agents and adapters
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

### Web GUI

```javascript
import { createWebGUI } from 'acpreact';

const gui = createWebGUI({ port: 3000, agent: 'claude', adapters: ['discord'] });
const acp = new ACPProtocol('You are helpful.');
gui.setACP(acp);
// open http://localhost:3000
```

**Requires Bun runtime.** Serves a single-page app with Tailwind CSS, dark theme, WebSocket-driven chat log.

`createWebGUI({ port, agent, adapters })` returns `{ server, url, setACP(acp), broadcast(type, text) }`

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

Telegram and Slack use pure `fetch` — no extra libraries required.

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
