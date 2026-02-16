# Watcher - ACP SDK

A clean, production-ready SDK for implementing ACP (AI Control Protocol) with function-based chat analysis.

## Features

- **ACPProtocol**: Core ACP protocol implementation with JSON-RPC 2.0 support
- **processChat**: Analyze chat content with tool invocation and whitelist enforcement
- **Tool Factory**: Create tool definitions for ACP integration
- **Tool Whitelist**: Built-in security model for controlling tool access
- **ES Module**: Pure ES modules, no build step required

## Installation

```bash
npm install watcher
```

## Quick Start

### Processing Chat Content

```javascript
import { processChat } from 'watcher';

const chatContent = "[14:23] alice: Where is Taj Mahal?\n[14:24] bob: Main Street";
const result = await processChat(chatContent, {
  onToolCall: (toolName, args) => console.log('Tool:', toolName, args)
});
console.log(result.answer);
```

### Using ACPProtocol

```javascript
import { ACPProtocol } from 'watcher';

const acp = new ACPProtocol();
const response = acp.createInitializeResponse();
const result = await acp.callTool('simulative_retriever', {
  query: 'Taj Mahal Main Street phone number'
});
```

### Creating Tool Definitions

```javascript
import { createSimulativeRetriever } from 'watcher';

const tool = createSimulativeRetriever();
// Use in your ACP setup
```

## API

### processChat(chatContent, options)

Process chat content with tool invocation and analysis.

**Parameters:**
- `chatContent`: String containing chat messages
- `options`: Optional configuration object
  - `onToolCall(toolName, args)`: Callback when a tool is invoked
  - `systemPrompt`: Custom system prompt for analysis

**Returns:** Promise resolving to object with:
- `answer`: Processed chat analysis
- `toolCalls`: Array of tool invocations
- `logs`: Tool execution log
- `rejectedLogs`: Failed tool call attempts

**Example:**
```javascript
const result = await processChat(chatContent, {
  onToolCall: (name, args) => console.log(`Called: ${name}`)
});
```

### ACPProtocol

Main protocol handler for ACP communication.

**Methods:**
- `createInitializeResponse()`: Generate protocol initialization response
- `createJsonRpcRequest(method, params)`: Create JSON-RPC request
- `createJsonRpcResponse(id, result)`: Create JSON-RPC response
- `createJsonRpcError(id, error)`: Create JSON-RPC error
- `validateToolCall(toolName)`: Check if tool is whitelisted
- `callTool(toolName, params)`: Execute a whitelisted tool

**Properties:**
- `toolWhitelist`: Set of allowed tool names
- `toolCallLog`: Array of executed tool calls
- `rejectedCallLog`: Array of rejected tool attempts

### createSimulativeRetriever()

Factory function that returns a tool definition for simulative_retriever.

**Returns:** Tool object with name, description, and inputSchema

## License

ISC
