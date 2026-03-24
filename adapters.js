import { createServer } from 'http';
import { EventEmitter } from 'events';

function base(type) {
  const em = new EventEmitter();
  return { type, onMessage: (fn) => em.on('message', fn), _emit: (msg) => em.emit('message', msg) };
}

async function discordAdapter(config) {
  const djs = await import('discord.js').catch(() => { throw new Error('discord.js not installed: npm install discord.js'); });
  const { Client, Events, GatewayIntentBits } = djs;
  const b = base('discord');
  const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });
  client.on(Events.MessageCreate, (msg) => {
    if (msg.author.bot) return;
    b._emit({ id: msg.id, content: msg.content, author: msg.author.tag, channelId: msg.channelId, timestamp: Date.now() });
  });
  client.on(Events.Error, (e) => console.error('discord error:', e.message));
  return {
    ...b,
    start: () => client.login(config.token),
    stop: () => client.destroy(),
    send: async (channelId, text) => { const ch = await client.channels.fetch(channelId); return ch?.send(text); },
  };
}

async function telegramAdapter(config) {
  const b = base('telegram');
  const api = `https://api.telegram.org/bot${config.token}`;
  let offset = 0, running = false;
  async function poll() {
    while (running) {
      try {
        const r = await fetch(`${api}/getUpdates?offset=${offset}&timeout=30`).then(r => r.json());
        for (const u of r.result || []) {
          offset = u.update_id + 1;
          if (u.message?.text) b._emit({ id: u.update_id, content: u.message.text, author: u.message.from?.username || String(u.message.from.id), channelId: u.message.chat.id, timestamp: Date.now() });
        }
      } catch {}
    }
  }
  return {
    ...b,
    start: async () => { running = true; poll(); },
    stop: () => { running = false; },
    send: (chatId, text) => fetch(`${api}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, text }) }),
  };
}

async function slackAdapter(config) {
  const b = base('slack');
  const postUrl = 'https://slack.com/api/chat.postMessage';
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${config.token}` };
  const server = createServer((req, res) => {
    if (req.method !== 'POST') return res.end();
    const chunks = [];
    req.on('data', d => chunks.push(d));
    req.on('end', () => {
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString());
        if (body.type === 'url_verification') return res.end(JSON.stringify({ challenge: body.challenge }));
        const ev = body.event;
        if (ev?.type === 'message' && !ev.bot_id) b._emit({ id: ev.ts, content: ev.text, author: ev.user, channelId: ev.channel, timestamp: Date.now() });
        res.end('ok');
      } catch { res.writeHead(400).end(); }
    });
  });
  return {
    ...b,
    start: () => new Promise(r => server.listen(config.port || 3000, r)),
    stop: () => new Promise(r => server.close(r)),
    send: (channelId, text) => fetch(postUrl, { method: 'POST', headers, body: JSON.stringify({ channel: channelId, text }) }),
  };
}

async function webhookAdapter(config) {
  const b = base('webhook');
  const server = createServer((req, res) => {
    if (req.method !== 'POST') return res.writeHead(405).end();
    const chunks = [];
    req.on('data', d => chunks.push(d));
    req.on('end', () => {
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString());
        b._emit({ id: Date.now(), content: body.content || body.text || body.message, author: body.author || 'webhook', channelId: body.channelId || body.channel || 'webhook', timestamp: Date.now() });
        res.writeHead(200).end(JSON.stringify({ ok: true }));
      } catch { res.writeHead(400).end(); }
    });
  });
  return {
    ...b,
    start: () => new Promise(r => server.listen(config.port || 3000, r)),
    stop: () => new Promise(r => server.close(r)),
    send: async () => {},
  };
}

async function createAdapter(type, config = {}) {
  switch (type) {
    case 'discord': return discordAdapter(config);
    case 'telegram': return telegramAdapter(config);
    case 'slack': return slackAdapter(config);
    case 'webhook': return webhookAdapter(config);
    default: throw new Error(`Unknown adapter: ${type}. Available: discord, telegram, slack, webhook`);
  }
}

export { createAdapter };
