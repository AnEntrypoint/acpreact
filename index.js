import { ACPProtocol } from './core.js';
import { ServiceRegistry, isRateLimited, createServiceStack } from './services.js';
import { FallbackEngine } from './fallback.js';

export { ACPProtocol, ServiceRegistry, FallbackEngine, isRateLimited, createServiceStack };

/*
 * acpreact - ACP SDK for registering tools with multi-service fallback
 *
 * Basic usage (single service, backward compatible):
 *   import { ACPProtocol } from 'acpreact';
 *   const acp = new ACPProtocol('Your instruction');
 *   const result = await acp.process('prompt', { cli: 'kilo' });
 *
 * Multi-service fallback — pass a services array to the constructor:
 *   const acp = new ACPProtocol('Your instruction', [
 *     { cli: 'kilo' },
 *     { cli: 'opencode' },
 *     { cli: 'gemini' },
 *   ]);
 *   const result = await acp.process('prompt');
 *
 * Per-call override:
 *   const result = await acp.process('prompt', {
 *     services: [{ cli: 'opencode' }, { cli: 'kilo' }],
 *   });
 *
 * Custom ACP-compatible provider:
 *   acp.registry.registerService('my-agent', {
 *     binary: 'my-agent',
 *     buildArgs: (prompt, opts) => ['run', prompt],
 *   });
 *
 * Multiple profiles per provider (different logins):
 *   const acp = new ACPProtocol('instruction', [
 *     { cli: 'kilo', profile: 'account-a' },
 *     { cli: 'kilo', profile: 'account-b' },
 *     { cli: 'opencode', profile: 'account-c' },
 *   ]);
 *
 * Listen to fallback events:
 *   acp.on('rate-limited', ({ name, profileId, cooldownMs }) => { ... });
 *   acp.on('fallback', ({ from, to }) => { ... });
 *   acp.on('success', ({ name, profileId, attempted }) => { ... });
 *
 * Build a service stack manually:
 *   import { createServiceStack, ServiceRegistry, FallbackEngine } from 'acpreact';
 *   const stack = createServiceStack([{ cli: 'kilo' }, { cli: 'gemini' }]);
 */
