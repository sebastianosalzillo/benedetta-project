/**
 * @fileoverview File system operations tool with path sandboxing and read caching.
 * Provides file read/write/edit/delete with LRU caching for repeated reads,
 * path traversal prevention, and file size limits.
 */

const fs = require('fs');
const path = require('path');
const { LRUCache } = require('lru-cache');

const MAX_FILE_SIZE = 500000;
const MAX_READ_LINES = 2000;
const FILE_TOOL_ROOT = path.resolve(process.env.NYX_FILE_TOOL_ROOT || process.cwd());

/**
 * LRU cache for file reads.
 * Max 500 entries, 50MB total size, 5 minute TTL.
 * Cache entries validated via mtime comparison.
 */
const fileReadCache = new LRUCache({
  max: 500,
  maxSize: 50 * 1024 * 1024,
  sizeCalculation: (entry) => entry.size || 0,
  ttl: 5 * 60 * 1000, // 5 minutes
});

/**
 * File read result.
 * @typedef {Object} FileReadResult
 * @property {boolean} ok - Whether the read succeeded
 * @property {string} [path] - Resolved file path
 * @property {string} [content] - File content (sliced by lines)
 * @property {number} [totalLines] - Total lines in the file
 * @property {number} [linesShown] - Number of lines returned
 * @property {number} [startLine] - Start line returned (1-based)
 * @property {number} [endLine] - End line returned (1-based)
 * @property {boolean} [truncated] - Whether the file was truncated
 * @property {number} [size] - File size in bytes
 * @property {string} [error] - Error message if failed
 * @property {boolean} [cacheHit] - Whether the result came from cache
 */

/**
 * Options for file read.
 * @typedef {Object} FileReadOptions
 * @property {number} [startLine=1] 1-based start line
 * @property {number|null} [endLine=null] 1-based inclusive end line
 * @property {BufferEncoding} [encoding='utf-8'] File encoding
 */

/**
 * Options for file write.
 * @typedef {Object} FileWriteOptions
 * @property {boolean} [overwrite=true] Whether to overwrite existing files
 */

/**
 * Options for file edit.
 * @typedef {Object} FileEditOptions
 * @property {string} [oldString] Text to find
 * @property {string} [newString] Replacement text
 * @property {boolean} [replaceAll=false] Replace all occurrences
 * @property {boolean} [regex=false] Treat oldString as regex
 * @property {string} [regexFlags='g'] Regex flags
 */

function isPathWithinRoot(rootPath, targetPath) {
  return targetPath === rootPath || targetPath.startsWith(`${rootPath}${path.sep}`);
}

function resolveAllowedPath(filePath) {
  const resolvedPath = path.resolve(FILE_TOOL_ROOT, String(filePath || ''));
  if (!isPathWithinRoot(FILE_TOOL_ROOT, resolvedPath)) {
    return null;
  }
  return resolvedPath;
}

/**
 * Read a text file, optionally slicing by line range.
 *
 * Uses LRU cache with mtime validation for repeated reads.
 * Cache is bypassed if the file has been modified since last read.
 *
 * @param {string} filePath - Path relative to FILE_TOOL_ROOT
 * @param {FileReadOptions} [options] - Read options
 * @returns {FileReadResult} Read result with content or error
 * @example
 * // Read entire file (first 2000 lines)
 * readTextFile('src/main.js')
 * 
 * // Read specific lines
 * readTextFile('src/main.js', { startLine: 10, endLine: 50 })
 * 
 * // Read with different encoding
 * readTextFile('data.bin', { encoding: 'base64' })
 */
function readTextFile(filePath, options = {}) {
  const { startLine = 1, endLine = null, encoding = 'utf-8' } = options;
  const resolvedPath = resolveAllowedPath(filePath);
  if (!resolvedPath) {
    return { ok: false, error: 'Path fuori dal root consentito del file tool.' };
  }

  if (!fs.existsSync(resolvedPath)) {
    return { ok: false, error: `File non trovato: ${resolvedPath}` };
  }

  const stats = fs.statSync(resolvedPath);
  if (stats.size > MAX_FILE_SIZE && !startLine && !endLine) {
    return { ok: false, error: `File troppo grande (${stats.size} bytes). Usa startLine/endLine per leggere a blocchi.` };
  }

  // Check cache with mtime validation
  const cached = fileReadCache.get(resolvedPath);
  if (cached && stats.mtimeMs === cached.mtimeMs && !startLine && !endLine) {
    return {
      ok: true,
      path: resolvedPath,
      content: cached.content,
      totalLines: cached.totalLines,
      linesShown: cached.totalLines,
      startLine: 1,
      endLine: cached.totalLines,
      truncated: false,
      size: stats.size,
      cacheHit: true,
    };
  }

  try {
    const content = fs.readFileSync(resolvedPath, encoding);
    const lines = content.split(/\r?\n/);
    const start = Math.max(0, startLine - 1);
    const end = endLine ? Math.min(endLine, lines.length) : Math.min(start + MAX_READ_LINES, lines.length);
    const slicedLines = lines.slice(start, end);

    // Cache full file content if reading entire file
    if (!startLine && !endLine) {
      fileReadCache.set(resolvedPath, {
        content,
        mtimeMs: stats.mtimeMs,
        totalLines: lines.length,
        size: stats.size,
      });
    }

    return {
      ok: true,
      path: resolvedPath,
      content: slicedLines.join('\n'),
      totalLines: lines.length,
      linesShown: slicedLines.length,
      startLine: start + 1,
      endLine: end,
      truncated: lines.length > end,
      size: stats.size,
      cacheHit: false,
    };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

/**
 * Write a text file to disk.
 * 
 * Invalidates the read cache entry for this file if it exists.
 *
 * @param {string} filePath - Path relative to FILE_TOOL_ROOT
 * @param {string} content - File content to write
 * @param {FileWriteOptions} [options] - Write options
 * @returns {{ok: boolean, path?: string, size?: number, error?: string}} Write result
 * @example
 * // Write new file
 * writeTextFile('output.txt', 'Hello world')
 * 
 * // Fail if file exists
 * writeTextFile('output.txt', 'Hello', { overwrite: false })
 */
function writeTextFile(filePath, content, options = {}) {
  const { overwrite = true } = options;
  const resolvedPath = resolveAllowedPath(filePath);
  if (!resolvedPath) {
    return { ok: false, error: 'Path fuori dal root consentito del file tool.' };
  }
  const dir = path.dirname(resolvedPath);

  if (fs.existsSync(resolvedPath) && !overwrite) {
    return { ok: false, error: `File esistente: ${resolvedPath}. Usa overwrite: true per sovrascrivere.` };
  }

  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(resolvedPath, content, 'utf-8');
    // Invalidate read cache for this file
    fileReadCache.delete(resolvedPath);
    return { ok: true, path: resolvedPath, size: Buffer.byteLength(content, 'utf-8') };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

/**
 * Edit a file by replacing plain text or regex matches.
 * 
 * Invalidates the read cache entry for this file if edits are applied.
 *
 * @param {string} filePath - Path relative to FILE_TOOL_ROOT
 * @param {FileEditOptions} [options] - Edit options
 * @returns {{ok: boolean, path?: string, replacements?: number, size?: number, error?: string}} Edit result
 * @example
 * // Replace first occurrence
 * editFile('config.json', { oldString: '"port": 3000', newString: '"port": 8080' })
 * 
 * // Replace all with regex
 * editFile('main.js', { oldString: 'console\\.log\\(.*\\)', newString: '// removed', regex: true, replaceAll: true })
 */
function editFile(filePath, options = {}) {
  const { oldString, newString, replaceAll = false, regex = false, regexFlags = 'g' } = options;
  const resolvedPath = resolveAllowedPath(filePath);
  if (!resolvedPath) {
    return { ok: false, error: 'Path fuori dal root consentito del file tool.' };
  }

  if (!fs.existsSync(resolvedPath)) {
    return { ok: false, error: `File non trovato: ${resolvedPath}` };
  }

  try {
    let content = fs.readFileSync(resolvedPath, 'utf-8');
    let newContent;
    let replacements = 0;

    if (regex) {
      const pattern = new RegExp(oldString, regexFlags);
      const matches = content.match(pattern);
      replacements = matches ? matches.length : 0;
      newContent = content.replace(pattern, newString);
    } else {
      if (replaceAll) {
        const escaped = oldString.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const pattern = new RegExp(escaped, 'g');
        const matches = content.match(pattern);
        replacements = matches ? matches.length : 0;
        newContent = content.replace(pattern, newString);
      } else {
        const index = content.indexOf(oldString);
        if (index === -1) {
          return { ok: false, error: 'Stringa non trovata nel file.', path: resolvedPath };
        }
        replacements = 1;
        newContent = content.slice(0, index) + newString + content.slice(index + oldString.length);
      }
    }

    if (newContent === content) {
      return { ok: false, error: 'Nessuna modifica apportata. Stringa non trovata o identica.', path: resolvedPath };
    }

    fs.writeFileSync(resolvedPath, newContent, 'utf-8');
    // Invalidate read cache for this file
    fileReadCache.delete(resolvedPath);
    return {
      ok: true,
      path: resolvedPath,
      replacements,
      size: Buffer.byteLength(newContent, 'utf-8'),
    };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

/**
 * Delete a file from disk.
 * 
 * Invalidates the read cache entry for this file if it exists.
 *
 * @param {string} filePath - Path relative to FILE_TOOL_ROOT
 * @returns {{ok: boolean, path?: string, error?: string}} Delete result
 * @example
 * deleteFile('temp.txt')
 */
function deleteFile(filePath) {
  const resolvedPath = resolveAllowedPath(filePath);
  if (!resolvedPath) {
    return { ok: false, error: 'Path fuori dal root consentito del file tool.' };
  }
  if (!fs.existsSync(resolvedPath)) {
    return { ok: false, error: `File non trovato: ${resolvedPath}` };
  }
  try {
    fs.unlinkSync(resolvedPath);
    return { ok: true, path: resolvedPath };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

/**
 * List entries in a directory.
 *
 * @param {string} dirPath - Path relative to FILE_TOOL_ROOT
 * @returns {{ok: boolean, path?: string, items?: Array<{name: string, type: string, path: string}>, error?: string}} List result
 * @example
 * const result = listDirectory('src')
 * console.log(result.items.map(i => `${i.type}: ${i.name}`))
 */
function listDirectory(dirPath) {
  const resolvedPath = resolveAllowedPath(dirPath);
  if (!resolvedPath) {
    return { ok: false, error: 'Path fuori dal root consentito del file tool.' };
  }
  if (!fs.existsSync(resolvedPath)) {
    return { ok: false, error: `Directory non trovata: ${resolvedPath}` };
  }
  try {
    const entries = fs.readdirSync(resolvedPath, { withFileTypes: true });
    const items = entries.map((entry) => ({
      name: entry.name,
      type: entry.isDirectory() ? 'directory' : 'file',
      path: path.join(resolvedPath, entry.name),
    }));
    return { ok: true, path: resolvedPath, items };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

module.exports = {
  readTextFile,
  writeTextFile,
  editFile,
  deleteFile,
  listDirectory,
  resolveAllowedPath,
  invalidateFileCache: (filePath) => fileReadCache.delete(resolveAllowedPath(filePath)),
  clearFileCache: () => fileReadCache.clear(),
  getFileCacheStats: () => ({
    size: fileReadCache.size,
    maxSize: fileReadCache.max,
    maxSizeBytes: fileReadCache.maxSize,
    currentSizeBytes: fileReadCache.sizeCalculation ? 'tracked' : 'untracked',
  }),
  MAX_FILE_SIZE,
  MAX_READ_LINES,
};
