import { EventEmitter } from 'events';

const DEFAULT_COOLDOWN_MS = 60_000;

const RATE_LIMIT_PATTERNS = {
  common: [
    /\b429\b/,
    /rate.?limit/i,
    /quota.?exceeded/i,
    /too.?many.?requests/i,
  ],
  gemini: [/RESOURCE_EXHAUSTED/],
  kilo: [],
  opencode: [],
};

const RETRY_AFTER_PATTERN = /retry.?after[:\s]+(\d+)/i;

const BUILTIN_ARG_BUILDERS = {
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
};

function buildArgs(providerName, prompt, options) {
  const builder = BUILTIN_ARG_BUILDERS[providerName];
  if (builder) return builder(prompt, options);
  const args = ['run'];
  if (options?.model) args.push('--model', options.model);
  args.push(prompt);
  return args;
}

function isRateLimited(providerName, output = '', stderr = '') {
  const combined = `${output}\n${stderr}`;
  const patterns = [
    ...RATE_LIMIT_PATTERNS.common,
    ...(RATE_LIMIT_PATTERNS[providerName] || []),
  ];

  let rateLimited = false;
  let retryAfterMs;

  for (const pattern of patterns) {
    if (pattern.test(combined)) {
      rateLimited = true;
      break;
    }
  }

  if (rateLimited) {
    const match = combined.match(RETRY_AFTER_PATTERN);
    if (match) retryAfterMs = parseInt(match[1], 10) * 1000;
  }

  return retryAfterMs !== undefined ? { rateLimited, retryAfterMs } : { rateLimited };
}

function createServiceStack(configs) {
  return configs.map(cfg => ({
    name: cfg.cli || cfg.name,
    profileId: cfg.profile ?? '__default__',
    config: cfg,
  }));
}

class ServiceRegistry extends EventEmitter {
  constructor() {
    super();
    this._services = [];
    this._cooldowns = new Map();
  }

  _cooldownKey(name, profileId) {
    return `${name}::${profileId ?? '__default__'}`;
  }

  registerService(name, config = {}) {
    const profileId = config.profile ?? '__default__';
    const existing = this._services.findIndex(
      s => s.name === name && s.profileId === profileId
    );
    const entry = { name, profileId, config };
    if (existing >= 0) {
      this._services[existing] = entry;
    } else {
      this._services.push(entry);
    }
    this._cooldowns.delete(this._cooldownKey(name, profileId));
    return this;
  }

  markRateLimited(name, profileId, cooldownMs = DEFAULT_COOLDOWN_MS) {
    const key = this._cooldownKey(name, profileId ?? '__default__');
    const expiry = cooldownMs === 0 ? 0 : Date.now() + cooldownMs;
    this._cooldowns.set(key, expiry);
    this.emit('rate-limited', { name, profileId, cooldownMs, expiry });
  }

  clearCooldown(name, profileId) {
    this._cooldowns.delete(this._cooldownKey(name, profileId ?? '__default__'));
  }

  isAvailable(name, profileId) {
    const key = this._cooldownKey(name, profileId ?? '__default__');
    if (!this._cooldowns.has(key)) return true;
    const expiry = this._cooldowns.get(key);
    if (expiry === 0 || Date.now() >= expiry) {
      this._cooldowns.delete(key);
      return true;
    }
    return false;
  }

  getAvailable() {
    return this._services.filter(s => this.isAvailable(s.name, s.profileId));
  }

  getAll() {
    return [...this._services];
  }
}

export { ServiceRegistry, isRateLimited, createServiceStack, buildArgs, DEFAULT_COOLDOWN_MS };
