#!/usr/bin/env node
import { ACPProtocol } from './core.js';
import { createAdapter } from './adapters.js';
import { BUILTIN_ARG_BUILDERS } from './services.js';

const args = process.argv.slice(2);
const flags = {}, pos = [];
for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith('--')) {
    const k = args[i].slice(2);
    flags[k] = args[i+1] && !args[i+1].startsWith('--') ? args[++i] : true;
  } else pos.push(args[i]);
}

const agentName = flags.agent || process.env.ACPREACT_AGENT || 'claude';
const adapterType = flags.adapter;
const AGENTS = Object.keys(BUILTIN_ARG_BUILDERS);
const ADAPTERS = ['discord','telegram','slack','webhook'];

if (flags.list) {
  console.log('Agents:', AGENTS.join(', '));
  console.log('Adapters:', ADAPTERS.join(', '));
  process.exit(0);
}

async function getAdapter() {
  if (!adapterType) return null;
  return createAdapter(adapterType, {
    token: process.env[`${adapterType.toUpperCase()}_BOT_TOKEN`],
    port: Number(flags.port) || 3000,
  });
}

if (flags.web) {
  const { createWebGUI } = await import('./web.js');
  const port = Number(flags.port) || 3000;
  const adapter = await getAdapter();
  const adapterList = adapter ? [adapterType] : [];
  const gui = createWebGUI({ port, agent: agentName, adapters: adapterList });
  const acp = new ACPProtocol('');
  gui.setACP(acp);
  if (adapter) {
    adapter.onMessage(async (msg) => {
      gui.broadcast('message', `[${adapterType}] ${msg.author}: ${msg.content}`);
      const r = await acp.process(msg.content, { cli: agentName }).catch(e => ({ text: e.message }));
      gui.broadcast('result', r.text || r.rawOutput || '');
      if (r.text) await adapter.send(msg.channelId, r.text).catch(() => {});
    });
    await adapter.start();
  }
  console.log(`acpreact web GUI → ${gui.url}`);
} else if (pos.length > 0) {
  const acp = new ACPProtocol('');
  const r = await acp.process(pos.join(' '), { cli: agentName });
  console.log(r.text || r.rawOutput);
} else {
  const v = JSON.parse(require('fs').readFileSync(new URL('./package.json', import.meta.url))).version;
  console.log(`acpreact v${v}
Usage: acpreact [options] [prompt]

  --web              Launch web GUI (Bun.serve)
  --agent <name>     Agent (default: claude)
  --adapter <type>   Chat adapter: discord|telegram|slack|webhook
  --port <n>         Port for web/slack/webhook (default: 3000)
  --list             List available agents and adapters

Env: ACPREACT_AGENT, DISCORD_BOT_TOKEN, TELEGRAM_BOT_TOKEN, SLACK_BOT_TOKEN`);
}
