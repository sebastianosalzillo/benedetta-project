/**
 * @fileoverview Search tool wrapper — adapts existing search-tool.js to AgentTool interface.
 * Wraps globFiles, grepFiles, readManyFiles.
 *
 * @module tools/search-tool
 */

const {
  globFiles,
  grepFiles,
  readManyFiles,
} = require('../search-tool');

/**
 * AgentTool for glob pattern file search.
 * @type {import('../agent/types').AgentTool}
 */
const globSearchTool = {
  name: 'glob_search',
  label: 'Glob File Search',
  description:
    'Find files matching a glob pattern. Supports *, **, ?, character classes. ' +
    'Returns file paths and types without reading contents. Max 100 results.',
  parameters: {
    type: 'object',
    properties: {
      pattern: {
        type: 'string',
        description: 'Glob pattern (e.g., "**/*.js", "src/**/*.tsx")',
      },
      searchPath: {
        type: 'string',
        description: 'Directory to search in (default: ".")',
      },
    },
    required: ['pattern'],
    additionalProperties: false,
  },
  async execute(_toolCallId, args) {
    const result = globFiles(args.pattern, args.searchPath || '.');
    if (!result.ok) {
      return { content: `Error: ${result.error}`, isError: true };
    }
    if (!result.files || result.files.length === 0) {
      return { content: `No files match pattern "${args.pattern}"`, details: result };
    }
    const lines = result.files.map((f) => `  ${f.type}: ${f.relativePath || f.path}`).join('\n');
    return {
      content: `Found ${result.total} file(s) matching "${args.pattern}":\n\n${lines}`,
      details: result,
    };
  },
};

/**
 * AgentTool for regex content search.
 * @type {import('../agent/types').AgentTool}
 */
const grepSearchTool = {
  name: 'grep_search',
  label: 'Grep Content Search',
  description:
    'Search file contents using a regex pattern. Streams files lazily — ' +
    'does NOT load all files into memory. Max 100 results.',
  parameters: {
    type: 'object',
    properties: {
      pattern: {
        type: 'string',
        description: 'Regex pattern to search for',
      },
      searchPath: {
        type: 'string',
        description: 'Directory to search in (default: ".")',
      },
      include: {
        type: 'string',
        description: 'Glob pattern to filter files (e.g., "*.js")',
      },
      maxResults: {
        type: 'number',
        description: 'Maximum results (default: 100)',
      },
      caseInsensitive: {
        type: 'boolean',
        description: 'Case-insensitive search (default: true)',
      },
    },
    required: ['pattern'],
    additionalProperties: false,
  },
  async execute(_toolCallId, args) {
    const result = grepFiles(args.pattern, args.searchPath || '.', {
      include: args.include,
      maxResults: args.maxResults,
      caseInsensitive: args.caseInsensitive !== false,
    });
    if (!result.ok) {
      return { content: `Error: ${result.error}`, isError: true };
    }
    if (!result.results || result.results.length === 0) {
      return { content: `No matches for pattern "${args.pattern}"`, details: result };
    }
    const lines = result.results
      .map((r) => `  ${r.relativePath}:${r.line}: ${r.text}`)
      .join('\n');
    return {
      content: `Found ${result.total} match(es) for "${args.pattern}":\n\n${lines}`,
      details: result,
    };
  },
};

/**
 * AgentTool for reading multiple files.
 * @type {import('../agent/types').AgentTool}
 */
const readManyFilesTool = {
  name: 'read_many_files',
  label: 'Read Multiple Files',
  description:
    'Read multiple files in one call. Files are read lazily with per-file size limits. ' +
    'Max 10 files, 100KB each by default.',
  parameters: {
    type: 'object',
    properties: {
      paths: {
        type: 'array',
        items: { type: 'string' },
        description: 'Array of file paths to read',
      },
    },
    required: ['paths'],
    additionalProperties: false,
  },
  async execute(_toolCallId, args) {
    const result = readManyFiles(args.paths);
    if (!result.ok) {
      return { content: `Error: ${result.error}`, isError: true };
    }
    const contents = result.files
      .map((f) => {
        if (!f.ok) return `  [Error] ${f.path}: ${f.error}`;
        return `  === ${f.path} (${f.size} bytes) ===\n${f.content}`;
      })
      .join('\n\n');
    return {
      content: `Read ${result.files.filter((f) => f.ok).length}/${result.files.length} file(s):\n\n${contents}`,
      details: result,
    };
  },
};

module.exports = {
  globSearchTool,
  grepSearchTool,
  readManyFilesTool,
};
