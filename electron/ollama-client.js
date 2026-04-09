const { Ollama } = require('ollama');

function createOllamaClient(host) {
  const normalizedHost = String(host || '').trim().replace(/\/+$/, '');
  return new Ollama({ host: normalizedHost });
}

async function listOllamaModels(host) {
  const client = createOllamaClient(host);
  const response = await client.list();
  const models = Array.isArray(response?.models)
    ? response.models
        .map((item) => String(item?.model || item?.name || '').trim())
        .filter(Boolean)
    : [];
  return Array.from(new Set(models));
}

async function generateOllamaResponse(host, model, prompt, options = {}) {
  const client = createOllamaClient(host);
  return client.generate({
    model,
    prompt,
    stream: false,
    ...options,
  });
}

module.exports = {
  createOllamaClient,
  generateOllamaResponse,
  listOllamaModels,
};
