import { ACPProtocol } from './core.js';

const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>acpreact</title>
<script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gray-950 text-gray-100 h-screen flex flex-col font-mono text-sm">
<header class="flex items-center gap-3 px-4 py-2 border-b border-gray-800 shrink-0">
  <span class="font-bold text-cyan-400 text-base">acpreact</span>
  <span id="agent" class="bg-gray-800 text-green-400 px-2 py-0.5 rounded text-xs"></span>
  <span id="adapters" class="text-gray-500 text-xs"></span>
  <span id="status" class="ml-auto text-xs text-gray-600">connecting\u2026</span>
</header>
<div id="log" class="flex-1 overflow-y-auto px-4 py-2 space-y-0.5"></div>
<form id="f" class="flex gap-2 p-4 border-t border-gray-800 shrink-0">
  <input id="inp" type="text" placeholder="Enter prompt\u2026" autocomplete="off"
    class="flex-1 bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500">
  <button class="bg-cyan-600 hover:bg-cyan-500 active:bg-cyan-700 px-4 py-2 rounded text-sm font-semibold transition-colors">Run</button>
</form>
<script>
const log=document.getElementById('log'),st=document.getElementById('status'),ag=document.getElementById('agent'),ad=document.getElementById('adapters');
function row(txt,cls){const d=document.createElement('div');d.className='px-2 py-0.5 rounded '+cls;d.textContent='['+new Date().toTimeString().slice(0,5)+'] '+txt;log.appendChild(d);log.scrollTop=log.scrollHeight;}
let ws;
function connect(){
  ws=new WebSocket('ws://'+location.host+'/ws');
  ws.onopen=()=>{st.textContent='connected';st.className='ml-auto text-xs text-green-400';};
  ws.onclose=()=>{st.textContent='disconnected';st.className='ml-auto text-xs text-red-500';setTimeout(connect,2000);};
  ws.onmessage=e=>{
    const d=JSON.parse(e.data);
    if(d.type==='init'){ag.textContent=d.agent;ad.textContent=(d.adapters||[]).join(' ');}
    else if(d.type==='result')row(d.text,'text-green-300');
    else if(d.type==='error')row(d.text,'text-red-400');
    else if(d.type==='message')row(d.text,'text-yellow-300');
  };
}
connect();
document.getElementById('f').addEventListener('submit',e=>{
  e.preventDefault();
  const v=document.getElementById('inp').value.trim();
  if(!v||ws.readyState!==1)return;
  row('> '+v,'text-gray-400');
  ws.send(JSON.stringify({type:'run',prompt:v}));
  document.getElementById('inp').value='';
});
</script>
</body></html>`;

const CLIENTS = new Set();

function createWebGUI(options = {}) {
  const { port = 3000, agent = 'claude', adapters: adapterList = [] } = options;
  let acp = null;

  const server = Bun.serve({
    port,
    fetch(req, server) {
      if (new URL(req.url).pathname === '/ws' && server.upgrade(req)) return;
      return new Response(HTML, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    },
    websocket: {
      open(ws) {
        CLIENTS.add(ws);
        ws.send(JSON.stringify({ type: 'init', agent, adapters: adapterList }));
      },
      close(ws) { CLIENTS.delete(ws); },
      async message(ws, raw) {
        const msg = JSON.parse(typeof raw === 'string' ? raw : Buffer.from(raw).toString());
        if (msg.type !== 'run' || !acp) return;
        try {
          const r = await acp.process(msg.prompt, { cli: agent });
          ws.send(JSON.stringify({ type: 'result', text: r.text || r.rawOutput }));
        } catch (e) {
          ws.send(JSON.stringify({ type: 'error', text: e.message }));
        }
      },
    },
  });

  function broadcast(type, text) {
    const msg = JSON.stringify({ type, text });
    for (const ws of CLIENTS) ws.send(msg);
  }

  return {
    server,
    url: server.url.toString(),
    setACP(instance) { acp = instance; },
    broadcast,
  };
}

export { createWebGUI };
