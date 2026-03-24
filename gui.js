import { createInterface } from 'readline';

const C = { reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m', green: '\x1b[32m', cyan: '\x1b[36m', yellow: '\x1b[33m', red: '\x1b[31m', blue: '\x1b[34m' };
const ESC = (s) => `\x1b[${s}`;
const CLEAR = '\x1b[2J\x1b[H';
const MAX_LOG = 20;

function createGUI(options = {}) {
  const state = { agent: options.agent || 'claude', adapters: [], log: [], input: '', version: options.version || '1.2.0' };
  let inputHandler = null;

  function render() {
    if (!process.stdout.isTTY) return;
    const cols = process.stdout.columns || 80;
    const line = C.dim + '─'.repeat(cols) + C.reset;
    const rows = process.stdout.rows || 24;
    const logRows = Math.max(4, rows - 7);
    let out = CLEAR;
    out += `${C.bold}${C.cyan} acpreact${C.reset} ${C.dim}v${state.version}${C.reset}  `;
    out += `${C.bold}agent:${C.reset} ${C.green}${state.agent}${C.reset}  `;
    out += `${C.bold}adapters:${C.reset} ${state.adapters.length ? C.blue + state.adapters.join(' ') + C.reset : C.dim + 'none' + C.reset}\n`;
    out += line + '\n';
    const logSlice = state.log.slice(-logRows);
    for (const entry of logSlice) {
      const col = entry.type === 'in' ? C.yellow : entry.type === 'error' ? C.red : C.green;
      out += `${col}${entry.text}${C.reset}\n`;
    }
    for (let i = logSlice.length; i < logRows; i++) out += '\n';
    out += line + '\n';
    out += `${C.bold}>${C.reset} ${state.input}${ESC('?25h')}`;
    process.stdout.write(out);
  }

  function log(text, type = 'out') {
    const t = new Date().toTimeString().slice(0, 5);
    const lines = String(text).split('\n').filter(Boolean);
    for (const line of lines) state.log.push({ text: `[${t}] ${line}`, type });
    render();
  }

  function start(onPrompt) {
    if (!process.stdout.isTTY) { console.error('Non-TTY: pipe output or run in a terminal'); return; }
    inputHandler = onPrompt;
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', handleKey);
    process.on('resize', render);
    render();
  }

  function handleKey(key) {
    if (key === '\u0003' || (key === 'q' && !state.input)) { stop(); process.exit(0); }
    else if (key === '\r' || key === '\n') {
      const prompt = state.input.trim();
      state.input = '';
      if (prompt) { log(`> ${prompt}`, 'in'); inputHandler?.(prompt); }
    } else if (key === '\u007f') {
      state.input = state.input.slice(0, -1);
    } else if (key >= ' ') {
      state.input += key;
    }
    render();
  }

  function stop() {
    process.stdin.off('data', handleKey);
    process.stdout.write(CLEAR);
    try { process.stdin.setRawMode(false); } catch {}
  }

  function setAgent(name) { state.agent = name; render(); }
  function addAdapter(name) { if (!state.adapters.includes(name)) state.adapters.push(name); render(); }

  return { start, stop, log, setAgent, addAdapter };
}

export { createGUI };
