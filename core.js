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
}

export { ACPProtocol };
