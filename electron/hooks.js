const hooks = new Map();
let hookIdCounter = 0;

function registerHook(event, handler, options = {}) {
  const id = `hook-${++hookIdCounter}`;
  const entry = {
    id,
    event,
    handler,
    priority: options.priority || 0,
    once: options.once || false,
    enabled: options.enabled !== false,
  };

  if (!hooks.has(event)) {
    hooks.set(event, []);
  }
  hooks.get(event).push(entry);
  hooks.get(event).sort((a, b) => b.priority - a.priority);

  return id;
}

function unregisterHook(hookId) {
  for (const [event, entries] of hooks.entries()) {
    const index = entries.findIndex((e) => e.id === hookId);
    if (index !== -1) {
      entries.splice(index, 1);
      if (entries.length === 0) hooks.delete(event);
      return true;
    }
  }
  return false;
}

async function emitHook(event, payload) {
  const entries = hooks.get(event);
  if (!entries || entries.length === 0) return [];

  const results = [];
  for (const entry of entries) {
    if (!entry.enabled) continue;

    try {
      const result = await entry.handler(payload);
      results.push({ hookId: entry.id, result, error: null });

      if (entry.once) {
        unregisterHook(entry.id);
      }

      if (result && result.abort) {
        results.push({ hookId: entry.id, result: null, error: null, aborted: true });
        break;
      }
    } catch (error) {
      results.push({ hookId: entry.id, result: null, error: error.message });
    }
  }

  return results;
}

function listHooks(event = null) {
  if (event) {
    return (hooks.get(event) || []).map((e) => ({ id: e.id, event: e.event, priority: e.priority, once: e.once, enabled: e.enabled }));
  }
  const all = [];
  for (const [evt, entries] of hooks.entries()) {
    all.push(...entries.map((e) => ({ id: e.id, event: evt, priority: e.priority, once: e.once, enabled: e.enabled })));
  }
  return all;
}

const HOOK_EVENTS = {
  TOOL_BEFORE: 'tool:before',
  TOOL_AFTER: 'tool:after',
  TOOL_ERROR: 'tool:error',
  CHAT_BEFORE: 'chat:before',
  CHAT_AFTER: 'chat:after',
  CHAT_STREAM: 'chat:stream',
  AVATAR_BEFORE: 'avatar:before',
  AVATAR_AFTER: 'avatar:after',
  SESSION_START: 'session:start',
  SESSION_END: 'session:end',
  DREAM_MODE: 'dream:mode',
  FRUSTRATION: 'frustration:detected',
  CONTEXT_PRUNE: 'context:prune',
  MEMORY_WRITE: 'memory:write',
  AGENT_TURN_START: 'agent:turn:start',
  AGENT_TURN_END: 'agent:turn:end',
};

module.exports = {
  registerHook,
  unregisterHook,
  emitHook,
  listHooks,
  HOOK_EVENTS,
};
