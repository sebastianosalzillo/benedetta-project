const { spawn } = require('child_process');

const MAX_WEB_RESULTS = 8;
const DEFAULT_TIMEOUT_MS = 15000;

async function webFetch(url, options = {}) {
  const { format = 'markdown', timeout = DEFAULT_TIMEOUT_MS } = options;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Nyx-ACP-Desktop/0.1.0' },
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      return { ok: false, error: `HTTP ${response.status}: ${response.statusText}` };
    }

    const text = await response.text();
    let content = text;

    if (format === 'markdown') {
      content = htmlToMarkdown(text);
    } else if (format === 'text') {
      content = htmlToText(text);
    }

    return { ok: true, url, content: content.slice(0, 50000), format };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

async function webSearch(query, options = {}) {
  const { numResults = MAX_WEB_RESULTS, timeout = DEFAULT_TIMEOUT_MS } = options;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const response = await fetch(searchUrl, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Nyx-ACP-Desktop/0.1.0' },
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      return { ok: false, error: `HTTP ${response.status}: ${response.statusText}` };
    }

    const html = await response.text();
    const results = parseDuckDuckgoResults(html, numResults);

    return { ok: true, query, results, total: results.length };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

function htmlToMarkdown(html) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<header[\s\S]*?<\/header>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<h([1-6])[^>]*>/gi, '\n## ')
    .replace(/<\/h[1-6]>/gi, '\n')
    .replace(/<p[^>]*>/gi, '\n\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<a[^>]*href=["']([^"']*)["'][^>]*>/gi, '[$1](')
    .replace(/<\/a>/gi, ')')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function htmlToText(html) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function parseDuckDuckgoResults(html, limit) {
  const results = [];
  const resultRegex = /<a[^>]*class="[^"]*result[^"]*"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match;

  while ((match = resultRegex.exec(html)) !== null && results.length < limit) {
    const url = match[1];
    const title = match[2].replace(/<[^>]+>/g, '').trim();
    if (title && url) {
      results.push({ title, url });
    }
  }

  if (results.length === 0) {
    const snippetRegex = /<a[^>]*href="([^"]*)"[^>]*class="[^"]*result[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
    while ((match = snippetRegex.exec(html)) !== null && results.length < limit) {
      const url = match[1];
      const title = match[2].replace(/<[^>]+>/g, '').trim();
      if (title && url && !url.includes('duckduckgo.com')) {
        results.push({ title, url });
      }
    }
  }

  return results;
}

module.exports = {
  webFetch,
  webSearch,
  htmlToMarkdown,
  htmlToText,
  MAX_WEB_RESULTS,
  DEFAULT_TIMEOUT_MS,
};
