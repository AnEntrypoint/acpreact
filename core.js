import { spawn } from 'child_process';
import { EventEmitter } from 'events';
import { parseTextOutput, parseToolCalls } from './parser.js';

class ACPProtocol extends EventEmitter {
  constructor(instruction) {
    super();
    this.messageId = 0;
    this.instruction = instruction;
    this.toolWhitelist = new Set();
    this.toolSchemas = {};
    this.toolDescriptions = {};
    this.toolCallLog = [];
    this.rejectedCallLog = [];
    this.tools = {};
  }

  generateRequestId() {
    return ++this.messageId;
  }

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
      jsonrpc: '2.0',
      id: 1,
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

  createJsonRpcResponse(id, result) {
    return { jsonrpc: '2.0', id, result };
  }

  createJsonRpcError(id, error) {
    return {
      jsonrpc: '2.0',
      id,
      error: {
        code: error?.code ?? -32000,
        message: error instanceof Error ? error.message : String(error),
      },
    };
  }

  validateToolCall(toolName) {
    if (!this.toolWhitelist.has(toolName)) {
      const availableTools = Array.from(this.toolWhitelist);
      this.rejectedCallLog.push({
        timestamp: new Date().toISOString(),
        attemptedTool: toolName,
        reason: 'Not in whitelist',
        availableTools,
      });
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

  parseTextOutput(output) {
    return parseTextOutput(output);
  }

  parseToolCalls(output) {
    return parseToolCalls(output);
  }

  async process(text, options = {}) {
    const cli = options.cli || 'kilo';
    const model = options.model;
    const fullPrompt = this.instruction
      ? `${this.instruction}${this.getToolsPrompt()}\n\n---\n\n${text}`
      : `${this.getToolsPrompt()}\n\n---\n\n${text}`;

    const args = ['run', '--format', 'json'];
    if (cli === 'kilo') args.push('--auto');
    if (model) args.push('--model', model);
    args.push(fullPrompt);

    return new Promise((resolve, reject) => {
      let output = '';
      let errorOutput = '';

      const child = spawn(cli, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: process.cwd(),
        env: { ...process.env },
      });

      child.stdin.end();
      child.stdout.on('data', (data) => { output += data.toString(); });
      child.stderr.on('data', (data) => { errorOutput += data.toString(); });

      child.on('close', async (code) => {
        if (code !== 0 && code !== null && !output) {
          reject(new Error(`CLI exited with code ${code}: ${errorOutput}`));
          return;
        }
        try {
          const toolCalls = parseToolCalls(output);
          const results = [];
          for (const call of toolCalls) {
            const toolName = call.method.replace('tools/', '');
            if (this.toolWhitelist.has(toolName)) {
              const result = await this.callTool(toolName, call.params);
              results.push({ tool: toolName, result });
            }
          }
          resolve({ text: parseTextOutput(output), rawOutput: output, toolCalls: results, logs: this.toolCallLog });
        } catch (e) {
          resolve({ text: parseTextOutput(output), rawOutput: output, error: e.message, logs: this.toolCallLog });
        }
      });

      child.on('error', (error) => {
        reject(new Error(`Failed to spawn ${cli}: ${error.message}`));
      });

      setTimeout(() => { child.kill(); reject(new Error('Timeout')); }, 120000);
    });
  }

  stop() {}
}

export { ACPProtocol };
