import { EventEmitter } from 'events';

const DEFAULT_COOLDOWN_MS = 60_000;

const RATE_LIMIT_PATTERNS = {
  common: [/\b429\b/, /rate.?limit/i, /quota.?exceeded/i, /too.?many.?requests/i],
  claude: [/overloaded/i, /\bCapacity\b/i],
  kilo: [],
  opencode: [],
  gemini: [/RESOURCE_EXHAUSTED/],
  aider: [],
  codex: [],
  goose: [],
  amp: [],
};

const RETRY_AFTER_PATTERN = /retry.?after[:\s]+(\d+)/i;

const BUILTIN_ARG_BUILDERS = {
  claude: (prompt, options) => {
    const args = ['--print'];
    if (options?.model) args.push('--model', options.model);
    args.push(prompt);
    return args;
  },
  kilo: (prompt, options) => {
    const args = ['run', '--format', 'json', '--auto'];
    if (options?.model) args.push('--model', options.model);
    args.push(prompt);
    return args;
  },
  opencode: (prompt, options) => {
    const args = ['run', '--format', 'json'];
    if (options?.model) args.push('--model', options.model);
    args.push(prompt);
    return args;
  },
  gemini: (prompt, options) => {
    const args = ['run'];
    if (options?.model) args.push('--model', options.model);
    args.push(prompt);
    return args;
  },
  aider: (prompt, options) => {
    const args = ['--message', prompt, '--yes', '--no-auto-commits'];
    if (options?.model) args.push('--model', options.model);
    return args;
  },
  codex: (prompt, options) => {
    const args = [];
    if (options?.model) args.push('--model', options.model);
    args.push(prompt);
    return args;
  },
  goose: (prompt, options) => {
    const args = ['run', '--text', prompt];
    if (options?.model) args.push('--provider', options.model);
    return args;
  },
  amp: (prompt, options) => {
    const args = ['run'];
    if (options?.model) args.push('--model', options.model);
    args.push(prompt);
    return args;
  },
};

function buildArgs(name, prompt, options) {
  const builder = BUILTIN_ARG_BUILDERS[name];
  if (builder) return builder(prompt, options);
  const args = ['run'];
  if (options?.model) args.push('--model', options.model);
  args.push(prompt);
  return args;
}

function isRateLimited(name, output = '', stderr = '') {
  const combined = `${output}\n${stderr}`;
  const patterns = [...RATE_LIMIT_PATTERNS.common, ...(RATE_LIMIT_PATTERNS[name] || [])];
  let rateLimited = false, retryAfterMs;
  for (const pattern of patterns) {
    if (pattern.test(combined)) { rateLimited = true; break; }
  }
  if (rateLimited) {
    const match = combined.match(RETRY_AFTER_PATTERN);
    if (match) retryAfterMs = parseInt(match[1], 10) * 1000;
  }
  return retryAfterMs !== undefined ? { rateLimited, retryAfterMs } : { rateLimited };
}

function createServiceStack(configs) {
  return configs.map(cfg => ({ name: cfg.cli || cfg.name, profileId: cfg.profile ?? '__default__', config: cfg }));
}

class ServiceRegistry extends EventEmitter {
  constructor() { super(); this._services = []; this._cooldowns = new Map(); }

  _key(name, profileId) { return `${name}::${profileId ?? '__default__'}`; }

  registerService(name, config = {}) {
    const profileId = config.profile ?? '__default__';
    const idx = this._services.findIndex(s => s.name === name && s.profileId === profileId);
    const entry = { name, profileId, config };
    if (idx >= 0) this._services[idx] = entry; else this._services.push(entry);
    this._cooldowns.delete(this._key(name, profileId));
    return this;
  }

  markRateLimited(name, profileId, cooldownMs = DEFAULT_COOLDOWN_MS) {
    const key = this._key(name, profileId ?? '__default__');
    this._cooldowns.set(key, cooldownMs === 0 ? 0 : Date.now() + cooldownMs);
    this.emit('rate-limited', { name, profileId, cooldownMs });
  }

  clearCooldown(name, profileId) { this._cooldowns.delete(this._key(name, profileId ?? '__default__')); }

  isAvailable(name, profileId) {
    const key = this._key(name, profileId ?? '__default__');
    if (!this._cooldowns.has(key)) return true;
    const expiry = this._cooldowns.get(key);
    if (expiry === 0 || Date.now() >= expiry) { this._cooldowns.delete(key); return true; }
    return false;
  }

  getAvailable() { return this._services.filter(s => this.isAvailable(s.name, s.profileId)); }
  getAll() { return [...this._services]; }
}

export { ServiceRegistry, isRateLimited, createServiceStack, buildArgs, DEFAULT_COOLDOWN_MS, BUILTIN_ARG_BUILDERS };
