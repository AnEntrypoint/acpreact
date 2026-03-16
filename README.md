# acpreact - ACP SDK

A lightweight SDK for registering tools and running them via kilo CLI or opencode. Allows kilo and opencode to call registered tools via a custom JSON-RPC 2.0 protocol injected into the prompt.

## Features

- **ACPProtocol**: Core ACP protocol implementation with JSON-RPC 2.0 support
- **Tool Registration**: Register custom tools with descriptions and input schemas
- **Tool Whitelist**: Built-in security model for controlling tool access
- **Tool Execution**: Execute whitelisted tools with validation and logging
- **CLI Integration**: Works with kilo CLI and opencode via `process()` method
- **ES Module**: Pure ES modules, no build step required

## Prerequisites

Install kilo CLI and/or opencode before using `process()`:

```bash
npm install -g @kilocode/cli    # for kilo
npm install -g opencode-ai      # for opencode
```

## Installation

```bash
npm install acpreact
```

## Quick Start

### Register Tools and Process with kilo CLI

```javascript
import { ACPProtocol } from 'acpreact';

const acp = new ACPProtocol('You are a calculator assistant. Use the add tool when asked to add numbers.');

acp.registerTool(
  'add',
  'Add two numbers together',
  {
    type: 'object',
    properties: {
      a: { type: 'number', description: 'First number' },
      b: { type: 'number', description: 'Second number' }
    },
    required: ['a', 'b']
  },
  async (params) => ({ sum: params.a + params.b })
);

const result = await acp.process('What is 15 + 27? Use the add tool.', { cli: 'kilo' });
console.log(result.text);          // human-readable text response
console.log(result.toolCalls);     // [{ tool: 'add', result: { sum: 42 } }]
console.log(result.logs);          // tool call audit log
```

### Using opencode

```javascript
const result = await acp.process('What is 15 + 27? Use the add tool.', { cli: 'opencode' });
```

### Using System Instructions

```javascript
import { ACPProtocol } from 'acpreact';

const acp = new ACPProtocol('You are a helpful weather assistant. Always provide temperature in Fahrenheit.');

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
  async (params) => ({
    location: params.location,
    temperature: 72,
    condition: 'sunny'
  })
);

const result = await acp.process('What is the weather in San Francisco?', { cli: 'kilo' });
console.log(result.text);       // text response (tool call JSON filtered out)
console.log(result.toolCalls);  // [{ tool: 'weather', result: { location: 'San Francisco', ... } }]
```

## API

### ACPProtocol

Main class for ACP protocol communication.

**Constructor:**

- `new ACPProtocol(instruction?)`: Initialize the protocol
  - `instruction` (optional): String - system instruction prepended to every prompt sent to the CLI

**Methods:**

- `registerTool(name, description, inputSchema, handler)`: Register a custom tool
  - `name`: String - tool identifier
  - `description`: String - tool description shown to the model
  - `inputSchema`: Object - JSON Schema for tool inputs
  - `handler`: Async function - receives params object, returns result
  - Returns: Tool definition object

- `async process(text, options?)`: Send a prompt to kilo or opencode and execute any tool calls
  - `text`: String - the user prompt
  - `options.cli`: `'kilo'` (default) or `'opencode'`
  - `options.model`: String - model in `provider/model` format (uses CLI default if omitted)
  - Returns: `{ text, rawOutput, toolCalls, logs }` or `{ text, rawOutput, error, logs }` on parse failure

- `createInitializeResponse()`: Generate ACP protocol initialization response with registered tools

- `createJsonRpcRequest(method, params)`: Create JSON-RPC 2.0 request object

- `createJsonRpcResponse(id, result)`: Create JSON-RPC 2.0 response object

- `createJsonRpcError(id, error)`: Create JSON-RPC 2.0 error object (accepts Error or string)

- `validateToolCall(toolName)`: Check if tool is whitelisted, returns `{ allowed, error? }`

- `async callTool(toolName, params)`: Execute a registered tool directly

- `parseTextOutput(output)`: Parse human-readable text from CLI JSON output (filters tool call JSON)

- `parseToolCalls(output)`: Parse JSON-RPC tool calls from CLI output, deduplicated by id+method

**Properties:**

- `instruction`: String (optional) - system instruction prepended to prompts
- `toolWhitelist`: Set of registered tool names
- `toolCallLog`: Array of executed tool calls with timestamps and results
- `rejectedCallLog`: Array of rejected tool attempts with reasons

## How It Works

`process()` injects the registered tool list and JSON-RPC call format into the prompt, invokes the CLI, and parses any JSON-RPC tool calls from the output. Matched tool calls are executed locally and their results returned.

The model outputs tool calls as JSON-RPC lines:
```
{"jsonrpc":"2.0","id":1,"method":"tools/add","params":{"a":15,"b":27}}
```

These are parsed, executed, and returned in `result.toolCalls`. The `text` field contains only human-readable model output with tool call JSON filtered out.

## Example: Multiple Tools

```javascript
import { ACPProtocol } from 'acpreact';

const acp = new ACPProtocol('You are a data assistant.');

acp.registerTool(
  'query_database',
  'Query the application database',
  {
    type: 'object',
    properties: { query: { type: 'string' } },
    required: ['query']
  },
  async (params) => ({ data: [] })
);

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
  async (params) => ({ response: {} })
);

const initResponse = acp.createInitializeResponse();
console.log(initResponse.result.tools.length); // 2
console.log(initResponse.result.agentCapabilities); // { toolCalling: true, streaming: false }
```

## License

ISC
