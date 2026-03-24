import { spawn } from 'child_process';
import { EventEmitter } from 'events';
import { parseTextOutput, parseToolCalls } from './parser.js';
import { ServiceRegistry, createServiceStack, buildArgs } from './services.js';
import { FallbackEngine } from './fallback.js';
const DEFAULT_TIMEOUT_MS = 120_000;
function spawnService(entry, prompt, options, cbs) {
  const sig = options?._abortSignal;
  return new Promise((resolve, reject) => {
    if (sig?.aborted) return reject(new Error('Aborted'));
    const binary = entry.config?.binary || entry.name;
    const args = entry.config?.buildArgs ? entry.config.buildArgs(prompt, options) : buildArgs(entry.name, prompt, options);
    let out = '', err = '';
    const child = spawn(binary, args, { stdio: ['pipe','pipe','pipe'], cwd: process.cwd(), env: { ...process.env } });
    child.stdin.end();
    child.stdout.on('data', d => { const c = d.toString(); out += c; cbs?.onOutput?.(c); });
    child.stderr.on('data', d => { const c = d.toString(); err += c; cbs?.onStderr?.(c); });
    const ms = options?.timeout ?? DEFAULT_TIMEOUT_MS;
    const t = setTimeout(() => { child.kill(); reject(Object.assign(new Error(`Timeout after ${ms}ms`), { output: out, stderr: err })); }, ms);
    const abort = () => { child.kill(); clearTimeout(t); reject(Object.assign(new Error('Aborted'), { output: out, stderr: err })); };
    sig?.addEventListener('abort', abort, { once: true });
    child.on('close', code => {
      clearTimeout(t); sig?.removeEventListener('abort', abort);
      if (code !== 0 && code !== null && !out)
        return reject(Object.assign(new Error(`${binary} exited ${code}: ${err}`), { output: out, stderr: err }));
      resolve({ rawOutput: out, stderr: err, code });
    });
    child.on('error', e => { clearTimeout(t); sig?.removeEventListener('abort', abort); reject(Object.assign(e, { output: out, stderr: err })); });
  });
}

class ACPProtocol extends EventEmitter {
  constructor(instruction, services) {
    super();
    this.instruction = instruction;
    this.tools = new Map();
    this.toolCallLog = [];
    this.registry = new ServiceRegistry();
    if (services) for (const s of services) this.registry.registerService(s.cli || s.name, s);
    this._abort = null;
  }
  registerTool(name, description, schema, handler) {
    this.tools.set(name, { description, schema, handler });
    return { name, description, inputSchema: schema };
  }
  getToolsPrompt() {
    if (!this.tools.size) return '';
    let p = '\n\nYou have access to the following tools. You MUST use these tools to interact:\n\n';
    for (const [name, { description, schema }] of this.tools) {
      p += `## Tool: ${name}\n${description}\nParameters: ${JSON.stringify(schema, null, 2)}\n`;
      p += `To call this tool, output a JSON-RPC request on a single line:\n`;
      p += `{"jsonrpc":"2.0","id":<number>,"method":"tools/${name}","params":{<parameters>}}\n\n`;
    }
    return p + 'IMPORTANT: When you need to use a tool, output ONLY the JSON-RPC request, nothing else.\n';
  }

  async callTool(name, params) {
    const tool = this.tools.get(name);
    if (!tool) throw new Error(`Tool not available: ${name}`);
    const entry = { timestamp: new Date().toISOString(), toolName: name, params, status: 'executing' };
    this.toolCallLog.push(entry);
    const result = await tool.handler(params);
    entry.status = 'completed'; entry.result = result;
    return result;
  }

  async process(text, options = {}) {
    const prompt = this.instruction
      ? `${this.instruction}${this.getToolsPrompt()}\n\n---\n\n${text}`
      : `${this.getToolsPrompt()}\n\n---\n\n${text}`;
    let stack;
    if (options.services) stack = createServiceStack(options.services);
    else if (options.cli) stack = [{ name: options.cli, profileId: '__default__', config: { cli: options.cli } }];
    else stack = this.registry.getAll().length
      ? this.registry.getAvailable()
      : [{ name: 'claude', profileId: '__default__', config: { cli: 'claude' } }];
    this._abort = new AbortController();
    const engine = new FallbackEngine(stack);
    engine.on('rate-limited', e => { this.registry.markRateLimited(e.name, e.profileId, e.cooldownMs); this.emit('rate-limited', e); });
    engine.on('fallback', e => this.emit('fallback', e));
    engine.on('success', e => this.emit('success', e));
    const { rawOutput } = await engine.run(spawnService, prompt, { ...options, _abortSignal: this._abort.signal });
    this._abort = null;
    try {
      const calls = parseToolCalls(rawOutput), results = [];
      for (const c of calls) {
        const n = c.method.replace('tools/', '');
        if (this.tools.has(n)) results.push({ tool: n, result: await this.callTool(n, c.params) });
      }
      return { text: parseTextOutput(rawOutput), rawOutput, toolCalls: results, logs: this.toolCallLog };
    } catch (e) {
      return { text: parseTextOutput(rawOutput), rawOutput, error: e.message, logs: this.toolCallLog };
    }
  }

  stop() { if (this._abort) { this._abort.abort(); this._abort = null; } }
}

export { ACPProtocol };
