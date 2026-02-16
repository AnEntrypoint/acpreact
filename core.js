class ACPProtocol {
  constructor() {
    this.messageId = 0;
    this.toolWhitelist = new Set(['simulative_retriever']);
    this.toolCallLog = [];
    this.rejectedCallLog = [];
    this.tools = {
      simulative_retriever: this.simulativeRetriever.bind(this),
    };
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

  createInitializeResponse() {
    return {
      jsonrpc: "2.0",
      id: 0,
      result: {
        protocolVersion: "1.0",
        serverInfo: {
          name: "OpenCode ACP Server",
          version: "1.0.0",
        },
        securityConfiguration: {
          toolWhitelistEnabled: true,
          allowedTools: Array.from(this.toolWhitelist),
          rejectionBehavior: "strict",
        },
        agentCapabilities: [
          {
            type: "tool",
            name: "simulative_retriever",
            description: "Retrieve business information from a simulated database",
            whitelisted: true,
            inputSchema: {
              type: "object",
              properties: {
                query: {
                  type: "string",
                  description: "The search query",
                },
              },
              required: ["query"],
            },
            outputSchema: {
              type: "object",
              properties: {
                success: { type: "boolean" },
                result: { type: "string" },
                details: { type: "string" },
              },
              required: ["success", "result", "details"],
            },
          },
        ],
      },
    };
  }

  simulativeRetriever(query) {
    const lowerQuery = query.toLowerCase();
    if (
      (lowerQuery.includes("taj mahal") &&
        lowerQuery.includes("main street")) &&
      (lowerQuery.includes("phone") ||
        lowerQuery.includes("number") ||
        lowerQuery.includes("contact"))
    ) {
      return {
        success: true,
        result: "555-0142",
        details: "Found phone number for Taj Mahal on Main Street: 555-0142",
      };
    }
    return {
      success: false,
      result: null,
      details: `Information not found in database for query: "${query}"`,
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
      query: params.query,
      status: 'executing',
    });

    if (this.tools[toolName]) {
      const result = this.tools[toolName](params.query);
      const lastLog = this.toolCallLog[this.toolCallLog.length - 1];
      lastLog.status = 'completed';
      lastLog.result = result;
      return result;
    }
    throw new Error(`Unknown tool: ${toolName}`);
  }
}

function createSimulativeRetriever() {
  return {
    name: "simulative_retriever",
    description: "Retrieve business information from a simulated database",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The search query (e.g., 'Taj Mahal phone number')",
        },
      },
      required: ["query"],
    },
  };
}

async function processChat(chatContent, options = {}) {
  const acp = new ACPProtocol();
  const toolCalls = [];
  const answer = chatContent;

  const onToolCall = options.onToolCall || (() => {});

  if (options.onToolCall) {
    toolCalls.push({
      timestamp: new Date().toISOString(),
      content: chatContent.substring(0, 100),
    });
    onToolCall('analyze', { content: chatContent });
  }

  return {
    answer,
    toolCalls,
    logs: acp.toolCallLog,
    rejectedLogs: acp.rejectedCallLog,
  };
}

export { ACPProtocol, createSimulativeRetriever, processChat };
