import { spawn } from 'child_process';
import { EventEmitter } from 'events';

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
    return Array.from(this.toolWhitelist).map(toolName => ({
      name: toolName,
      description: this.toolDescriptions[toolName],
      inputSchema: this.toolSchemas[toolName],
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

  validateToolCall(toolName) {
    if (!this.toolWhitelist.has(toolName)) {
      const availableTools = Array.from(this.toolWhitelist);
      const error = `Tool not available. Available: ${availableTools.join(', ')}`;
      this.rejectedCallLog.push({
        timestamp: new Date().toISOString(),
        attemptedTool: toolName,
        reason: 'Not in whitelist',
        availableTools,
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

  parseTextOutput(output) {
    let text = '';
    const lines = output.split('\n');
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      
      try {
        const json = JSON.parse(trimmed);
        if (json.type === 'text' && json.part?.text) {
          text += json.part.text;
        }
      } catch {}
    }
    
    return text;
  }

  parseToolCalls(output) {
    const calls = [];
    
    const textContent = this.parseTextOutput(output);
    
    for (const line of textContent.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      
      try {
        const json = JSON.parse(trimmed);
        if (json.jsonrpc === '2.0' && json.method?.startsWith('tools/') && json.params) {
          calls.push({ 
            id: json.id,
            method: json.method, 
            params: json.params 
          });
        }
      } catch {}
    }
    
    const lines = output.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      
      try {
        const json = JSON.parse(trimmed);
        if (json.jsonrpc === '2.0' && json.method?.startsWith('tools/') && json.params) {
          calls.push({ 
            id: json.id,
            method: json.method, 
            params: json.params 
          });
        }
      } catch {}
    }
    
    return calls;
  }

  async process(text, options = {}) {
    const cli = options.cli || 'kilo';
    const model = options.model || 'kilo/z-ai/glm-5:free';
    
    const fullPrompt = this.instruction 
      ? `${this.instruction}${this.getToolsPrompt()}\n\n---\n\n${text}`
      : `${this.getToolsPrompt()}\n\n---\n\n${text}`;

    const escapedPrompt = fullPrompt.replace(/"/g, '\\"').replace(/\n/g, ' ');
    
    return new Promise((resolve, reject) => {
      let output = '';
      let errorOutput = '';

      const child = spawn('script', ['-q', '-c', 
        `${cli} run --auto --model ${model} --format json "${escapedPrompt}"`, 
        '/dev/null'
      ], {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: process.cwd(),
        env: { ...process.env, TERM: 'dumb' },
      });

      child.stdout.on('data', (data) => {
        output += data.toString();
      });

      child.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      child.on('close', async (code) => {
        if (code !== 0 && code !== null && !output) {
          reject(new Error(`CLI exited with code ${code}: ${errorOutput}`));
          return;
        }

        try {
          const toolCalls = this.parseToolCalls(output);
          const results = [];
          
          for (const call of toolCalls) {
            const toolName = call.method.replace('tools/', '');
            if (this.toolWhitelist.has(toolName)) {
              const result = await this.callTool(toolName, call.params);
              results.push({ tool: toolName, result });
            }
          }
          
          resolve({
            text: this.parseTextOutput(output),
            rawOutput: output,
            toolCalls: results,
            logs: this.toolCallLog
          });
        } catch (e) {
          resolve({
            text: this.parseTextOutput(output),
            rawOutput: output,
            error: e.message,
            logs: this.toolCallLog
          });
        }
      });

      child.on('error', (error) => {
        reject(new Error(`Failed to spawn ${cli}: ${error.message}`));
      });

      setTimeout(() => {
        child.kill();
        reject(new Error('Timeout'));
      }, 120000);
    });
  }

  stop() {}
}

export { ACPProtocol };
