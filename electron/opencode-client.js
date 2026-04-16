function normalizeBaseUrl(baseUrl) {
  return String(baseUrl || '').trim().replace(/\/+$/, '');
}

async function createOpenCodeChatCompletion({ baseUrl, apiKey, model, messages, signal }) {
  const endpoint = `${normalizeBaseUrl(baseUrl)}/chat/completions`;
  const response = await fetch(endpoint, {
    method: 'POST',
    signal,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages,
      stream: false,
    }),
  });

  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const detail = payload?.error?.message || payload?.message || text || response.statusText;
    throw new Error(`OpenCode Zen ${response.status}: ${detail}`);
  }

  return payload;
}

function extractOpenCodeText(payload) {
  const choices = Array.isArray(payload?.choices) ? payload.choices : [];
  const content = choices[0]?.message?.content || choices[0]?.text || '';
  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part === 'string' ? part : part?.text || ''))
      .join('');
  }
  return String(content || '');
}

module.exports = {
  createOpenCodeChatCompletion,
  extractOpenCodeText,
};
