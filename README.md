# acpreact - ACP SDK

A lightweight SDK for setting up tools and managing ACP protocol communication. Allows opencode to call registered tools via the ACP protocol.

## Features

- **ACPProtocol**: Core ACP protocol implementation with JSON-RPC 2.0 support
- **Tool Registration**: Register custom tools with descriptions and input schemas
- **Tool Whitelist**: Built-in security model for controlling tool access
- **Tool Execution**: Execute whitelisted tools with validation
- **ES Module**: Pure ES modules, no build step required

## Installation

```bash
npm install acpreact
```

## Quick Start

### Creating an ACP Server with Custom Tools

```javascript
import { ACPProtocol } from 'acpreact';

const acp = new ACPProtocol();

// Register a custom tool
acp.registerTool(
  'weather',
  'Get weather information for a location',
  {
    type: 'object',
    properties: {
      location: { type: 'string', description: 'City name' }
    },
    required: ['location']
  },
  async (params) => {
    return {
      location: params.location,
      temperature: 72,
      condition: 'sunny'
    };
  }
);

// Initialize protocol response
const response = acp.createInitializeResponse();

// Execute tool
const result = await acp.callTool('weather', { location: 'San Francisco' });
console.log(result);
```

### Using System Instructions

Pass a system instruction to the ACPProtocol constructor. The instruction will be included in the initialization response and communicated to opencode:

```javascript
import { ACPProtocol } from 'acpreact';

const instruction = 'You are a helpful weather assistant. Always provide temperature in Fahrenheit.';
const acp = new ACPProtocol(instruction);

// Register tools as usual
acp.registerTool(
  'weather',
  'Get weather information for a location',
  {
    type: 'object',
    properties: {
      location: { type: 'string', description: 'City name' }
    },
    required: ['location']
  },
  async (params) => {
    return {
      location: params.location,
      temperature: 72,
      condition: 'sunny'
    };
  }
);

// The instruction is included in the initialization response
const response = acp.createInitializeResponse();
console.log(response.result.instruction);
// Output: "You are a helpful weather assistant. Always provide temperature in Fahrenheit."
```

## API

### ACPProtocol

Main class for setting up ACP protocol communication.

**Constructor:**

- `new ACPProtocol(instruction)`: Initialize the protocol
  - `instruction` (optional): String - system instruction to communicate to opencode

**Methods:**

- `registerTool(name, description, inputSchema, handler)`: Register a custom tool
  - `name`: String - tool identifier
  - `description`: String - tool description
  - `inputSchema`: Object - JSON Schema for tool inputs
  - `handler`: Async function - receives params object, returns result
  - Returns: Tool definition object

- `createInitializeResponse()`: Generate protocol initialization response

- `createJsonRpcRequest(method, params)`: Create JSON-RPC request object

- `createJsonRpcResponse(id, result)`: Create JSON-RPC response object

- `createJsonRpcError(id, error)`: Create JSON-RPC error object

- `validateToolCall(toolName)`: Check if tool is whitelisted

- `async callTool(toolName, params)`: Execute a registered tool

**Properties:**

- `instruction`: String (optional) - system instruction communicated to opencode
- `toolWhitelist`: Set of registered tool names
- `toolCallLog`: Array of executed tool calls with timestamps
- `rejectedCallLog`: Array of rejected tool attempts

## Example: Multiple Tools

```javascript
import { ACPProtocol } from 'acpreact';

const acp = new ACPProtocol();

// Register database tool
acp.registerTool(
  'query_database',
  'Query the application database',
  {
    type: 'object',
    properties: {
      query: { type: 'string' }
    },
    required: ['query']
  },
  async (params) => {
    // Your database logic here
    return { data: [] };
  }
);

// Register API tool
acp.registerTool(
  'call_api',
  'Call an external API',
  {
    type: 'object',
    properties: {
      endpoint: { type: 'string' },
      method: { type: 'string', enum: ['GET', 'POST'] }
    },
    required: ['endpoint', 'method']
  },
  async (params) => {
    // Your API logic here
    return { response: {} };
  }
);

// Initialize and use
const initResponse = acp.createInitializeResponse();
console.log(initResponse.result.agentCapabilities);
```

## License

ISC
