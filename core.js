import { spawn } from 'child_process';
import { EventEmitter } from 'events';
import { parseTextOutput, parseToolCalls } from './parser.js';
import { ServiceRegistry, createServiceStack, buildArgs } from './services.js';
import { FallbackEngine } from './fallback.js';

const DEFAULT_TIMEOUT_MS = 120_000;

function attachOutputs(err, output, errorOutput) { err.output = output; err.stderr = errorOutput; return err; }

function spawnService(entry, prompt, options, callbacks) {
  const abortSignal = options?._abortSignal;
  return new Promise((resolve, reject) => {
    if (abortSignal?.aborted) return reject(new Error('Aborted'));
    const binary = entry.config?.binary || entry.name;
    const args = entry.config?.buildArgs
      ? entry.config.buildArgs(prompt, options)
      : buildArgs(entry.name, prompt, options);
    let output = '', errorOutput = '';
    const child = spawn(binary, args, { stdio: ['pipe', 'pipe', 'pipe'], cwd: process.cwd(), env: { ...process.env } });
    child.stdin.end();
    child.stdout.on('data', (d) => { const c = d.toString(); output += c; callbacks?.onOutput?.(c); });
    child.stderr.on('data', (d) => { const c = d.toString(); errorOutput += c; callbacks?.onStderr?.(c); });
    const timeoutMs = options?.timeout ?? DEFAULT_TIMEOUT_MS;
    const timer = setTimeout(() => {
      child.kill();
      reject(attachOutputs(new Error(`Timeout after ${timeoutMs}ms`), output, errorOutput));
    }, timeoutMs);
    const onAbort = () => { child.kill(); clearTimeout(timer); reject(attachOutputs(new Error('Aborted'), output, errorOutput)); };
    abortSignal?.addEventListener('abort', onAbort, { once: true });
    child.on('close', (code) => {
      clearTimeout(timer);
      abortSignal?.removeEventListener('abort', onAbort);
      if (code !== 0 && code !== null && !output)
        return reject(attachOutputs(new Error(`${binary} exited with code ${code}: ${errorOutput}`), output, errorOutput));
      resolve({ rawOutput: output, stderr: errorOutput, code });
    });
    child.on('error', (err) => { clearTimeout(timer); abortSignal?.removeEventListener('abort', onAbort); reject(attachOutputs(err, output, errorOutput)); });
  });
}

class ACPProtocol extends EventEmitter {
  constructor(instruction, services) {
    super();
    this.messageId = 0;
    this.instruction = instruction;
    this.toolWhitelist = new Set();
    this.toolSchemas = {};
    this.toolDescriptions = {};
    this.toolCallLog = [];
    this.rejectedCallLog = [];
    this.tools = {};
    this.registry = new ServiceRegistry();
    if (services) {
      for (const svc of services) {
        this.registry.registerService(svc.cli || svc.name, svc);
      }
    }
    this.fallback = new FallbackEngine([]);
    this.fallback.on('rate-limited', (e) => {
      this.registry.markRateLimited(e.name, e.profileId, e.cooldownMs);
      this.emit('rate-limited', e);
    });
    this.fallback.on('fallback', (e) => this.emit('fallback', e));
    this.fallback.on('success', (e) => this.emit('success', e));
    this._abortController = null;
  }

  generateRequestId() { return ++this.messageId; }

  registerTool(name, description, inputSchema, handler) {
    this.toolWhitelist.add(name);
    this.tools[name] = handler;
    this.toolSchemas[name] = inputSchema;
    this.toolDescriptions[name] = description;
    return { name, description, inputSchema };
  }

  getToolsList() {
    return Array.from(this.toolWhitelist).map(name => ({
      name,
      description: this.toolDescriptions[name],
      inputSchema: this.toolSchemas[name],
    }));
  }

  getToolsPrompt() {
    const tools = this.getToolsList();
    if (tools.length === 0) return '';
    let prompt = '\n\nYou have access to the following tools. You MUST use these tools to interact:\n\n';
    for (const tool of tools) {
      prompt += `## Tool: ${tool.name}\n${tool.description}\n`;
      prompt += `Parameters: ${JSON.stringify(tool.inputSchema, null, 2)}\n`;
      prompt += `To call this tool, output a JSON-RPC request on a single line:\n`;
      prompt += `{"jsonrpc":"2.0","id":<number>,"method":"tools/${tool.name}","params":{<parameters>}}\n\n`;
    }
    prompt += 'IMPORTANT: When you need to use a tool, output ONLY the JSON-RPC request, nothing else.\n';
    return prompt;
  }

  createInitializeResponse() {
    return {
      jsonrpc: '2.0', id: 1,
      result: {
        tools: this.getToolsList(),
        instruction: this.instruction,
        agentCapabilities: { toolCalling: true, streaming: false },
      },
    };
  }

  createJsonRpcRequest(method, params) {
    return { jsonrpc: '2.0', id: this.generateRequestId(), method, params };
  }

  createJsonRpcResponse(id, result) { return { jsonrpc: '2.0', id, result }; }

  createJsonRpcError(id, error) { return { jsonrpc: '2.0', id, error: { code: error?.code ?? -32000, message: error instanceof Error ? error.message : String(error) } }; }

  validateToolCall(toolName) {
    if (!this.toolWhitelist.has(toolName)) {
      const availableTools = Array.from(this.toolWhitelist);
      this.rejectedCallLog.push({ timestamp: new Date().toISOString(), attemptedTool: toolName, reason: 'Not in whitelist', availableTools });
      return { allowed: false, error: `Tool not available. Available: ${availableTools.join(', ')}` };
    }
    return { allowed: true };
  }

  async callTool(toolName, params) {
    const validation = this.validateToolCall(toolName);
    if (!validation.allowed) throw new Error(validation.error);
    const entry = { timestamp: new Date().toISOString(), toolName, params, status: 'executing' };
    this.toolCallLog.push(entry);
    if (!this.tools[toolName]) throw new Error(`Unknown tool: ${toolName}`);
    const result = await this.tools[toolName](params);
    entry.status = 'completed';
    entry.result = result;
    return result;
  }

  parseTextOutput(output) { return parseTextOutput(output); }
  parseToolCalls(output) { return parseToolCalls(output); }

  async process(text, options = {}) {
    const fullPrompt = this.instruction
      ? `${this.instruction}${this.getToolsPrompt()}\n\n---\n\n${text}`
      : `${this.getToolsPrompt()}\n\n---\n\n${text}`;

    let stack;
    if (options.services) {
      stack = createServiceStack(options.services);
    } else if (options.cli) {
      stack = [{ name: options.cli, profileId: '__default__', config: { cli: options.cli } }];
    } else {
      stack = this.registry.getAll().length > 0
        ? this.registry.getAvailable()
        : [{ name: 'kilo', profileId: '__default__', config: { cli: 'kilo' } }];
    }

    this._abortController = new AbortController();
    const runOptions = { ...options, _abortSignal: this._abortController.signal };
    const engine = new FallbackEngine(stack);
    engine.on('rate-limited', (e) => this.fallback.emit('rate-limited', e));
    engine.on('fallback', (e) => this.fallback.emit('fallback', e));
    engine.on('success', (e) => this.fallback.emit('success', e));

    const { rawOutput } = await engine.run(spawnService, fullPrompt, runOptions);
    this._abortController = null;

    try {
      const toolCalls = parseToolCalls(rawOutput);
      const results = [];
      for (const call of toolCalls) {
        const toolName = call.method.replace('tools/', '');
        if (this.toolWhitelist.has(toolName)) {
          const result = await this.callTool(toolName, call.params);
          results.push({ tool: toolName, result });
        }
      }
      return { text: parseTextOutput(rawOutput), rawOutput, toolCalls: results, logs: this.toolCallLog };
    } catch (e) {
      return { text: parseTextOutput(rawOutput), rawOutput, error: e.message, logs: this.toolCallLog };
    }
  }

  stop() { if (this._abortController) { this._abortController.abort(); this._abortController = null; } }
}

export { ACPProtocol };
