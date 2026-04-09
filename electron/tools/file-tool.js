/**
 * @fileoverview File tool wrapper — adapts existing file-tool.js to AgentTool interface.
 * Wraps readTextFile, writeTextFile, editFile, deleteFile, listDirectory.
 *
 * @module tools/file-tool
 */

const {
  readTextFile,
  writeTextFile,
  editFile,
  deleteFile,
  listDirectory,
} = require('../file-tool');

/**
 * AgentTool for reading text files.
 * @type {import('../agent/types').AgentTool}
 */
const readFileTool = {
  name: 'read_file',
  label: 'Read File',
  description:
    'Read the contents of a text file. Supports line range slicing. ' +
    'Files are sandboxed — only files within the project root can be accessed.',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'File path relative to project root',
      },
      startLine: {
        type: 'number',
        description: '1-based start line (default: 1)',
      },
      endLine: {
        type: 'number',
        description: '1-based end line (default: 2000)',
      },
    },
    required: ['path'],
    additionalProperties: false,
  },
  async execute(_toolCallId, args) {
    const result = readTextFile(args.path, {
      startLine: args.startLine,
      endLine: args.endLine,
    });
    if (!result.ok) {
      return { content: `Error: ${result.error}`, isError: true };
    }
    const header = `File: ${result.path} (${result.totalLines} lines, ${result.size} bytes)`;
    const truncatedNote = result.truncated ? `\n[File truncated, showing lines ${result.startLine}-${result.endLine}]` : '';
    return {
      content: `${header}${truncatedNote}\n\n${result.content}`,
      details: result,
    };
  },
};

/**
 * AgentTool for writing text files.
 * @type {import('../agent/types').AgentTool}
 */
const writeFileTool = {
  name: 'write_file',
  label: 'Write File',
  description:
    'Write content to a text file. Creates parent directories if needed. ' +
    'Overwrites existing files by default.',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'File path relative to project root',
      },
      content: {
        type: 'string',
        description: 'Content to write',
      },
      overwrite: {
        type: 'boolean',
        description: 'Whether to overwrite existing file (default: true)',
      },
    },
    required: ['path', 'content'],
    additionalProperties: false,
  },
  async execute(_toolCallId, args) {
    const result = writeTextFile(args.path, args.content, { overwrite: args.overwrite });
    if (!result.ok) {
      return { content: `Error: ${result.error}`, isError: true };
    }
    return {
      content: `File written: ${result.path} (${result.size} bytes)`,
      details: result,
    };
  },
};

/**
 * AgentTool for editing text files.
 * @type {import('../agent/types').AgentTool}
 */
const editFileTool = {
  name: 'edit_file',
  label: 'Edit File',
  description:
    'Edit a file by replacing text. Supports plain text replacement or regex. ' +
    'Use replaceAll for multiple occurrences, regex for pattern matching.',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'File path relative to project root',
      },
      oldString: {
        type: 'string',
        description: 'Text to find (or regex pattern if regex: true)',
      },
      newString: {
        type: 'string',
        description: 'Replacement text',
      },
      replaceAll: {
        type: 'boolean',
        description: 'Replace all occurrences (default: false)',
      },
      regex: {
        type: 'boolean',
        description: 'Treat oldString as regex (default: false)',
      },
    },
    required: ['path', 'oldString', 'newString'],
    additionalProperties: false,
  },
  async execute(_toolCallId, args) {
    const result = editFile(args.path, {
      oldString: args.oldString,
      newString: args.newString,
      replaceAll: args.replaceAll,
      regex: args.regex,
    });
    if (!result.ok) {
      return { content: `Error: ${result.error}`, isError: true };
    }
    return {
      content: `File edited: ${result.path} (${result.replacements} replacement(s), ${result.size} bytes)`,
      details: result,
    };
  },
};

/**
 * AgentTool for deleting files.
 * @type {import('../agent/types').AgentTool}
 */
const deleteFileTool = {
  name: 'delete_file',
  label: 'Delete File',
  description: 'Delete a file from disk. This action cannot be undone.',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'File path relative to project root',
      },
    },
    required: ['path'],
    additionalProperties: false,
  },
  async execute(_toolCallId, args) {
    const result = deleteFile(args.path);
    if (!result.ok) {
      return { content: `Error: ${result.error}`, isError: true };
    }
    return {
      content: `File deleted: ${result.path}`,
      details: result,
    };
  },
};

/**
 * AgentTool for listing directories.
 * @type {import('../agent/types').AgentTool}
 */
const listDirTool = {
  name: 'list_dir',
  label: 'List Directory',
  description: 'List files and subdirectories in a directory.',
  parameters: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Directory path relative to project root',
      },
    },
    required: ['path'],
    additionalProperties: false,
  },
  async execute(_toolCallId, args) {
    const result = listDirectory(args.path);
    if (!result.ok) {
      return { content: `Error: ${result.error}`, isError: true };
    }
    const items = result.items.map((i) => `  ${i.type}: ${i.name}`).join('\n');
    return {
      content: `Directory: ${result.path}\n\n${items || '(empty)'}`,
      details: result,
    };
  },
};

module.exports = {
  readFileTool,
  writeFileTool,
  editFileTool,
  deleteFileTool,
  listDirTool,
};
