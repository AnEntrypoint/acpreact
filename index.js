import { ACPProtocol, createSimulativeRetriever, processChat } from './core.js';

export { ACPProtocol, createSimulativeRetriever, processChat };

/*
 * ACP SDK Usage Examples
 *
 * Basic usage:
 *   import { ACPProtocol, createSimulativeRetriever, processChat } from 'thready';
 *
 * Create and use ACP Protocol:
 *   const acp = new ACPProtocol();
 *   const response = acp.createInitializeResponse();
 *   const result = await acp.callTool('simulative_retriever', { query: 'test' });
 *
 * Create tool definition:
 *   const tool = createSimulativeRetriever();
 *
 * Process chat content:
 *   const chatContent = "[14:23] alice: Where is Taj Mahal?\n[14:24] bob: Main Street";
 *   const result = await processChat(chatContent, {
 *     onToolCall: (toolName, args) => console.log(toolName, args)
 *   });
 *   console.log(result.answer);
 */
