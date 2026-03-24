#!/usr/bin/env node
import { ACPProtocol } from './core.js';
import { createAdapter } from './adapters.js';
import { createGUI } from './gui.js';
import { BUILTIN_ARG_BUILDERS } from './services.js';

const args = process.argv.slice(2);
const flags = {}, positional = [];
for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith('--')) {
    const key = args[i].slice(2);
    flags[key] = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : true;
  } else positional.push(args[i]);
}

const agentName = flags.agent || process.env.ACPREACT_AGENT || 'claude';
const adapterType = flags.adapter;
const AGENTS = Object.keys(BUILTIN_ARG_BUILDERS);
const ADAPTERS = ['discord', 'telegram', 'slack', 'webhook'];

if (flags.list) {
  console.log('Agents:', AGENTS.join(', '));
  console.log('Adapters:', ADAPTERS.join(', '));
  process.exit(0);
}

async function getAdapter() {
  if (!adapterType) return null;
  const tokenKey = `${adapterType.toUpperCase()}_BOT_TOKEN`;
  return createAdapter(adapterType, { token: process.env[tokenKey], port: Number(flags.port) || 3000 });
}

if (flags.gui) {
  const gui = createGUI({ agent: agentName });
  const acp = new ACPProtocol('');
  getAdapter().then(async (adapter) => {
    if (adapter) {
      gui.addAdapter(adapterType);
      adapter.onMessage(async (msg) => {
        gui.log(`[${adapterType}] ${msg.author}: ${msg.content}`, 'in');
        const r = await acp.process(msg.content, { cli: agentName }).catch(e => ({ text: e.message, error: true }));
        gui.log(r.text || r.rawOutput, r.error ? 'error' : 'out');
        if (r.text) await adapter.send(msg.channelId, r.text).catch(() => {});
      });
      await adapter.start();
    }
    gui.start(async (prompt) => {
      const r = await acp.process(prompt, { cli: agentName }).catch(e => ({ text: e.message, error: true }));
      gui.log(r.text || r.rawOutput, r.error ? 'error' : 'out');
    });
  }).catch(e => { console.error(e.message); process.exit(1); });
} else if (positional.length > 0) {
  const acp = new ACPProtocol('');
  const r = await acp.process(positional.join(' '), { cli: agentName });
  console.log(r.text || r.rawOutput);
} else {
  console.log(`acpreact v1.2.0
Usage: acpreact [options] [prompt]

Options:
  --gui              Launch interactive TUI
  --agent <name>     Agent to use (default: claude)
  --adapter <type>   Connect adapter (discord|telegram|slack|webhook)
  --port <n>         Port for slack/webhook adapters (default: 3000)
  --list             List available agents and adapters

Agents: ${AGENTS.join(', ')}
Adapters: ${ADAPTERS.join(', ')}

Env vars: ACPREACT_AGENT, DISCORD_BOT_TOKEN, TELEGRAM_BOT_TOKEN, SLACK_BOT_TOKEN`);
}
