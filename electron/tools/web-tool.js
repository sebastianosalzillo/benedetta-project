/**
 * @fileoverview Web tool wrapper — adapts existing web-tool.js to AgentTool interface.
 * Wraps webFetch and webSearch.
 *
 * @module tools/web-tool
 */

const { webFetch, webSearch, MAX_WEB_RESULTS } = require('../web-tool');

/**
 * AgentTool for fetching web pages.
 * @type {import('../agent/types').AgentTool}
 */
const webFetchTool = {
  name: 'web_fetch',
  label: 'Fetch Web Page',
  description:
    'Fetch the content of a web page and convert to markdown or plain text. ' +
    'Useful for reading articles, documentation, API responses.',
  parameters: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'URL to fetch',
      },
      format: {
        type: 'string',
        enum: ['markdown', 'text', 'html'],
        description: 'Output format (default: "markdown")',
      },
    },
    required: ['url'],
    additionalProperties: false,
  },
  async execute(_toolCallId, args) {
    const result = await webFetch(args.url, { format: args.format });
    if (!result.ok) {
      return { content: `Error: ${result.error}`, isError: true };
    }
    const preview = result.content.length > 10000
      ? result.content.slice(0, 10000) + '\n\n[Content truncated to 10KB]'
      : result.content;
    return {
      content: `Fetched: ${result.url}\nFormat: ${result.format}\n\n${preview}`,
      details: { url: result.url, format: result.format, contentLength: result.content.length },
    };
  },
};

/**
 * AgentTool for web search via DuckDuckGo.
 * @type {import('../agent/types').AgentTool}
 */
const webSearchTool = {
  name: 'web_search',
  label: 'Web Search',
  description:
    'Search the web using DuckDuckGo. Returns title and URL for each result. ' +
    `Max ${MAX_WEB_RESULTS} results. Use web_fetch to read a specific page.`,
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search query',
      },
      numResults: {
        type: 'number',
        description: `Number of results (default: ${MAX_WEB_RESULTS})`,
      },
    },
    required: ['query'],
    additionalProperties: false,
  },
  async execute(_toolCallId, args) {
    const result = await webSearch(args.query, { numResults: args.numResults });
    if (!result.ok) {
      return { content: `Error: ${result.error}`, isError: true };
    }
    if (!result.results || result.results.length === 0) {
      return { content: `No results for "${args.query}"`, details: result };
    }
    const lines = result.results.map((r, i) => `${i + 1}. **${r.title}**\n   ${r.url}`).join('\n\n');
    return {
      content: `Search results for "${args.query}" (${result.total} found):\n\n${lines}`,
      details: result,
    };
  },
};

module.exports = {
  webFetchTool,
  webSearchTool,
};
