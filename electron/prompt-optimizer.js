const MAX_STATIC_PROMPT_AGE_MS = 3600000;

function createDefaultPromptCacheState() {
  return {
    staticPrompt: '',
    staticPromptHash: '',
    staticPromptGeneratedAt: 0,
    dynamicContext: {},
    lastOptimizationAt: 0,
    tokenEstimate: 0,
  };
}

function buildStaticPrompt(template) {
  return {
    content: String(template || ''),
    generatedAt: Date.now(),
    hash: simpleHash(String(template || '')),
  };
}

function needsRegeneration(cacheState, newTemplate) {
  const newHash = simpleHash(String(newTemplate || ''));
  return newHash !== cacheState.staticPromptHash;
}

function updateStaticPrompt(cacheState, template) {
  const staticPrompt = buildStaticPrompt(template);
  cacheState.staticPrompt = staticPrompt.content;
  cacheState.staticPromptHash = staticPrompt.hash;
  cacheState.staticPromptGeneratedAt = staticPrompt.generatedAt;
  cacheState.lastOptimizationAt = Date.now();
  return cacheState;
}

function updateDynamicContext(cacheState, context) {
  cacheState.dynamicContext = { ...context };
  cacheState.lastOptimizationAt = Date.now();
  return cacheState;
}

function buildOptimizedPrompt(cacheState, dynamicContext = {}) {
  const context = { ...cacheState.dynamicContext, ...dynamicContext };
  const parts = [];

  if (cacheState.staticPrompt) {
    parts.push(cacheState.staticPrompt);
  }

  if (context.workspaceContext) {
    parts.push(context.workspaceContext);
  }

  if (context.sessionContext) {
    parts.push(context.sessionContext);
  }

  if (context.personalityContext) {
    parts.push(context.personalityContext);
  }

  if (context.userInput) {
    parts.push(`USER_INPUT: ${context.userInput}`);
  }

  const prompt = parts.filter(Boolean).join('\n\n');
  cacheState.tokenEstimate = Math.ceil(prompt.length / 4);
  return prompt;
}

function getPromptStats(cacheState) {
  return {
    staticPromptLength: cacheState.staticPrompt.length,
    dynamicContextKeys: Object.keys(cacheState.dynamicContext),
    tokenEstimate: cacheState.tokenEstimate,
    lastOptimizationAt: cacheState.lastOptimizationAt ? new Date(cacheState.lastOptimizationAt).toISOString() : null,
    staticPromptAge: cacheState.staticPromptGeneratedAt
      ? Date.now() - cacheState.staticPromptGeneratedAt
      : null,
  };
}

function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(16);
}

function estimateTokenCount(text) {
  return Math.ceil(String(text || '').length / 4);
}

function isPromptTooLong(tokenEstimate, maxTokens = 8000) {
  return tokenEstimate > maxTokens;
}

function trimPrompt(prompt, maxTokens = 8000) {
  const currentTokens = estimateTokenCount(prompt);
  if (currentTokens <= maxTokens) return prompt;

  const lines = prompt.split('\n');
  const maxChars = maxTokens * 4;

  if (prompt.length <= maxChars) return prompt;

  const staticEnd = prompt.indexOf('USER_INPUT:');
  if (staticEnd > 0) {
    const staticPart = prompt.slice(0, staticEnd);
    const userInput = prompt.slice(staticEnd);
    const availableForInput = maxChars - staticPart.length;
    if (availableForInput > 100) {
      return staticPart + userInput.slice(0, availableForInput);
    }
  }

  return prompt.slice(0, maxChars);
}

module.exports = {
  createDefaultPromptCacheState,
  buildStaticPrompt,
  needsRegeneration,
  updateStaticPrompt,
  updateDynamicContext,
  buildOptimizedPrompt,
  getPromptStats,
  estimateTokenCount,
  isPromptTooLong,
  trimPrompt,
  MAX_STATIC_PROMPT_AGE_MS,
};
