import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class ACPProtocol {
  constructor(instruction) {
    this.messageId = 0;
    this.instruction = instruction;
    this.toolWhitelist = new Set();
    this.toolCallLog = [];
    this.rejectedCallLog = [];
    this.tools = {};
  }

  generateRequestId() {
    return ++this.messageId;
  }

  createJsonRpcRequest(method, params) {
    return {
      jsonrpc: "2.0",
      id: this.generateRequestId(),
      method,
      params,
    };
  }

  createJsonRpcResponse(id, result) {
    return {
      jsonrpc: "2.0",
      id,
      result,
    };
  }

  createJsonRpcError(id, error) {
    return {
      jsonrpc: "2.0",
      id,
      error: {
        code: -32603,
        message: error,
      },
    };
  }

  registerTool(name, description, inputSchema, handler) {
    this.toolWhitelist.add(name);
    this.tools[name] = handler;
    return {
      name,
      description,
      inputSchema,
    };
  }

  createInitializeResponse() {
    const agentCapabilities = Array.from(this.toolWhitelist).map(toolName => ({
      type: "tool",
      name: toolName,
      whitelisted: true,
    }));

    const result = {
      protocolVersion: "1.0",
      serverInfo: {
        name: "acpreact ACP Server",
        version: "1.0.0",
      },
      securityConfiguration: {
        toolWhitelistEnabled: true,
        allowedTools: Array.from(this.toolWhitelist),
        rejectionBehavior: "strict",
      },
      agentCapabilities,
    };

    if (this.instruction) {
      result.instruction = this.instruction;
    }

    return {
      jsonrpc: "2.0",
      id: 0,
      result,
    };
  }

  validateToolCall(toolName) {
    if (!this.toolWhitelist.has(toolName)) {
      const availableTools = Array.from(this.toolWhitelist);
      const error = `Tool not available. Only these tools are available: ${availableTools.join(', ')}`;
      this.rejectedCallLog.push({
        timestamp: new Date().toISOString(),
        attemptedTool: toolName,
        reason: 'Not in whitelist',
        availableTools: availableTools,
      });
      return { allowed: false, error };
    }
    return { allowed: true };
  }

  async callTool(toolName, params) {
    const validation = this.validateToolCall(toolName);
    if (!validation.allowed) {
      throw new Error(validation.error);
    }

    this.toolCallLog.push({
      timestamp: new Date().toISOString(),
      toolName,
      params,
      status: 'executing',
    });

    if (this.tools[toolName]) {
      const result = await this.tools[toolName](params);
      const lastLog = this.toolCallLog[this.toolCallLog.length - 1];
      lastLog.status = 'completed';
      lastLog.result = result;
      return result;
    }
    throw new Error(`Unknown tool: ${toolName}`);
  }

  async process(text, options = {}) {
    const cli = options.cli || 'opencode';
    const instruction = options.instruction || this.instruction || '';
    
    const toolsDesc = Array.from(this.toolWhitelist).map(name => {
      const tool = this.tools[name];
      return `- ${name}: Tool available`;
    }).join('\n');

    const prompt = `${instruction}

Available tools:
${toolsDesc}

Text to analyze:
${text}

Analyze the text and call appropriate tools using the ACP protocol. Respond with JSON-RPC tool calls.`;

    return new Promise((resolve, reject) => {
      let output = '';
      let errorOutput = '';

      const child = spawn(cli, ['--stdin'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: process.cwd()
      });

      child.stdout.on('data', (data) => {
        output += data.toString();
      });

      child.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      child.on('close', async (code) => {
        if (code !== 0 && code !== null) {
          reject(new Error(`CLI exited with code ${code}: ${errorOutput}`));
          return;
        }

        try {
          const toolCalls = this.parseToolCalls(output);
          const results = [];
          
          for (const call of toolCalls) {
            if (this.toolWhitelist.has(call.method)) {
              const result = await this.callTool(call.method, call.params);
              results.push({ tool: call.method, result });
            }
          }
          
          resolve({
            text: output,
            toolCalls: results,
            logs: this.toolCallLog
          });
        } catch (e) {
          resolve({
            text: output,
            error: e.message,
            logs: this.toolCallLog
          });
        }
      });

      child.on('error', (error) => {
        reject(new Error(`Failed to spawn ${cli}: ${error.message}`));
      });

      child.stdin.write(prompt);
      child.stdin.end();
    });
  }

  parseToolCalls(output) {
    const calls = [];
    const lines = output.split('\n');
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      
      try {
        const json = JSON.parse(trimmed);
        if (json.jsonrpc === '2.0' && json.method && json.params) {
          calls.push({ method: json.method, params: json.params });
        }
      } catch (e) {
        // Not JSON, skip
      }
    }
    
    return calls;
  }
}

export { ACPProtocol };
