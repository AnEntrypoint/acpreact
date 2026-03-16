import { EventEmitter } from 'events';
import { isRateLimited, DEFAULT_COOLDOWN_MS } from './services.js';

class FallbackEngine extends EventEmitter {
  constructor(serviceStack = []) {
    super();
    this._stack = serviceStack;
  }

  async run(spawnFn, text, options = {}) {
    if (this._stack.length === 0) {
      throw new Error('FallbackEngine: service stack is empty');
    }

    const errors = [];
    let attempted = 0;

    for (const entry of this._stack) {
      const { name, profileId } = entry;
      attempted++;

      let result;
      let spawnError;
      let output = '';
      let stderr = '';

      try {
        result = await spawnFn(entry, text, options, {
          onOutput: (chunk) => { output += chunk; },
          onStderr: (chunk) => { stderr += chunk; },
        });
      } catch (err) {
        spawnError = err;
        output = err.output || '';
        stderr = err.stderr || '';
      }

      const rlCheck = isRateLimited(name, output, stderr);
      const isMissing = spawnError?.code === 'ENOENT';

      if (!spawnError && !rlCheck.rateLimited) {
        this.emit('success', { name, profileId, attempted });
        return result;
      }

      if (rlCheck.rateLimited || isMissing) {
        const cooldownMs = rlCheck.retryAfterMs ?? DEFAULT_COOLDOWN_MS;
        this.emit('rate-limited', { name, profileId, cooldownMs, error: spawnError?.message });
        errors.push({ name, profileId, rateLimited: true, retryAfterMs: cooldownMs, error: spawnError?.message });
        const remaining = this._stack.slice(attempted);
        if (remaining.length > 0) this.emit('fallback', { from: { name, profileId }, to: remaining[0] });
        continue;
      }

      throw spawnError || new Error(`Service ${name} failed: ${output}${stderr}`);
    }

    const summary = errors.map(e => `${e.name}(${e.profileId}): rate-limited`).join(', ');
    throw new AggregateError(
      errors.map(e => Object.assign(new Error(`${e.name} rate-limited`), e)),
      `All services exhausted: ${summary}`
    );
  }
}

export { FallbackEngine };
