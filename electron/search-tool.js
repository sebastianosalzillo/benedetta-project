/**
 * @fileoverview File and content search tool with lazy reads.
 * Provides glob pattern matching, regex text search, and multi-file reads.
 * Uses streaming/lazy reads to avoid loading all files into memory.
 */

const fs = require('fs');
const path = require('path');

const MAX_GLOB_RESULTS = 100;
const MAX_GREP_RESULTS = 100;
const MAX_MULTI_FILES = 10;
const MAX_FILE_READ_SIZE = 100000;
const SEARCH_TOOL_ROOT = path.resolve(process.env.NYX_FILE_TOOL_ROOT || process.cwd());

/**
 * Glob search result.
 * @typedef {Object} GlobResult
 * @property {boolean} ok - Whether the search succeeded
 * @property {string} [pattern] - The glob pattern used
 * @property {Array<{path: string, relativePath?: string, type: string}>} [files] - Matched files
 * @property {number} [total] - Total matches found
 * @property {string} [error] - Error message if failed
 */

/**
 * Grep search result.
 * @typedef {Object} GrepResult
 * @property {boolean} ok - Whether the search succeeded
 * @property {string} [pattern] - The regex pattern used
 * @property {Array<{file: string, relativePath: string, line: number, text: string}>} [results] - Matched lines
 * @property {number} [total] - Total matches found
 * @property {string} [error] - Error message if failed
 */

/**
 * Grep search options.
 * @typedef {Object} GrepOptions
 * @property {string} [include] - Glob pattern to filter files (e.g., '*.js')
 * @property {number} [maxResults=100] - Maximum results to return
 * @property {boolean} [caseInsensitive=true] - Case-insensitive search
 */

/**
 * Multi-file read result.
 * @typedef {Object} MultiFileResult
 * @property {boolean} ok - Whether the operation succeeded
 * @property {Array<{path: string, ok: boolean, content?: string, size?: number, error?: string}>} [files] - File results
 * @property {string} [error] - Error message if failed
 */

function isPathWithinRoot(rootPath, targetPath) {
  return targetPath === rootPath || targetPath.startsWith(`${rootPath}${path.sep}`);
}

function resolveSearchPath(requestPath = '.') {
  const resolvedPath = path.resolve(SEARCH_TOOL_ROOT, String(requestPath || '.'));
  if (!isPathWithinRoot(SEARCH_TOOL_ROOT, resolvedPath)) {
    return null;
  }
  return resolvedPath;
}

/**
 * Find files matching a glob pattern.
 * 
 * Walks the directory tree lazily — stops after MAX_GLOB_RESULTS matches.
 * Does NOT read file contents into memory.
 *
 * @param {string} pattern - Glob pattern (supports *, **, ?, character classes)
 * @param {string} [searchPath='.'] - Directory to search in
 * @returns {GlobResult} Search results
 * @example
 * // Find all JS files
 * globFiles('**\/*.js')
 * 
 * // Find specific pattern
 * globFiles('src/**\/*.jsx', '.')
 */
function globFiles(pattern, searchPath = '.') {
  const resolvedPath = resolveSearchPath(searchPath);
  if (!resolvedPath) {
    return { ok: false, error: 'Path fuori dal root consentito del search tool.' };
  }
  if (!fs.existsSync(resolvedPath)) {
    return { ok: false, error: `Directory non trovata: ${resolvedPath}` };
  }

  const results = [];
  const normalizedPattern = pattern.replace(/\\/g, '/');
  const parts = normalizedPattern.split('/');
  const hasGlob = parts.some((p) => p.includes('*') || p.includes('?') || p.includes('['));

  if (!hasGlob) {
    const fullPath = path.join(resolvedPath, normalizedPattern);
    if (fs.existsSync(fullPath)) {
      results.push({ path: fullPath, type: fs.statSync(fullPath).isDirectory() ? 'directory' : 'file' });
    }
    return { ok: true, pattern, files: results.slice(0, MAX_GLOB_RESULTS), total: results.length };
  }

  function walk(dir) {
    if (results.length >= MAX_GLOB_RESULTS) return;
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (results.length >= MAX_GLOB_RESULTS) break;
        const fullPath = path.join(dir, entry.name);
        const relativePath = path.relative(resolvedPath, fullPath).replace(/\\/g, '/');

        if (matchGlob(normalizedPattern, relativePath)) {
          results.push({ path: fullPath, relativePath, type: entry.isDirectory() ? 'directory' : 'file' });
        }

        if (entry.isDirectory() && !entry.name.startsWith('.')) {
          walk(fullPath);
        }
      }
    } catch {}
  }

  walk(resolvedPath);
  return { ok: true, pattern, files: results.slice(0, MAX_GLOB_RESULTS), total: results.length };
}

function matchGlob(pattern, filePath) {
  const regex = pattern
    .replace(/\*\*/g, '___DOUBLE_STAR___')
    .replace(/\*/g, '[^/]*')
    .replace(/___DOUBLE_STAR___/g, '.*')
    .replace(/\?/g, '[^/]')
    .replace(/\./g, '\\.');
  try {
    return new RegExp(`^${regex}$`).test(filePath);
  } catch {
    return false;
  }
}

/**
 * Search file contents using a regex pattern.
 * 
 * Uses lazy streaming — reads files one at a time and stops after maxResults.
 * Does NOT load all files into memory simultaneously.
 *
 * @param {string} pattern - Regex pattern to search for
 * @param {string} [searchPath='.'] - Directory to search in
 * @param {GrepOptions} [options] - Search options
 * @returns {GrepResult} Search results with matched lines
 * @example
 * // Search for function definitions
 * grepFiles('function\\\\s+\\\\w+', 'src')
 * 
 * // Search only in JS files
 * grepFiles('import.*from', 'src', { include: '*.js' })
 * 
 * // Case sensitive, limit to 50 results
 * grepFiles('TODO', '.', { caseInsensitive: false, maxResults: 50 })
 */
function grepFiles(pattern, searchPath = '.', options = {}) {
  const { include = null, maxResults = MAX_GREP_RESULTS, caseInsensitive = true } = options;
  const resolvedPath = resolveSearchPath(searchPath);
  if (!resolvedPath) {
    return { ok: false, error: 'Path fuori dal root consentito del search tool.' };
  }
  if (!fs.existsSync(resolvedPath)) {
    return { ok: false, error: `Directory non trovata: ${resolvedPath}` };
  }

  const results = [];
  const flags = caseInsensitive ? 'gi' : 'g';
  let regex;
  try {
    regex = new RegExp(pattern, flags);
  } catch (error) {
    return { ok: false, error: `Regex non valida: ${error.message}` };
  }

  function walk(dir) {
    if (results.length >= maxResults) return;
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (results.length >= maxResults) break;
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory() && !entry.name.startsWith('.')) {
          walk(fullPath);
        } else if (entry.isFile()) {
          if (include && !matchGlob(include, entry.name)) continue;
          try {
            const content = fs.readFileSync(fullPath, 'utf-8');
            const lines = content.split(/\r?\n/);
            for (let i = 0; i < lines.length; i++) {
              if (regex.test(lines[i])) {
                regex.lastIndex = 0;
                results.push({
                  file: fullPath,
                  relativePath: path.relative(resolvedPath, fullPath),
                  line: i + 1,
                  text: lines[i].trim().slice(0, 200),
                });
                if (results.length >= maxResults) break;
              }
            }
          } catch {}
        }
      }
    } catch {}
  }

  walk(resolvedPath);
  return { ok: true, pattern, results: results.slice(0, maxResults), total: results.length };
}

/**
 * Read multiple files in one call.
 * 
 * Reads files lazily with per-file size limits.
 * Files exceeding maxSize are skipped with an error.
 *
 * @param {string[]} filePaths - Array of file paths to read
 * @param {Object} [options] - Read options
 * @param {number} [options.maxFiles=10] - Maximum files to read
 * @param {number} [options.maxSize=100000] - Maximum bytes per file
 * @returns {MultiFileResult} Results for each file
 * @example
 * // Read multiple config files
 * readManyFiles(['package.json', 'vite.config.js'])
 * 
 * // With custom limits
 * readManyFiles(['large1.log', 'large2.log'], { maxFiles: 5, maxSize: 500000 })
 */
function readManyFiles(filePaths, options = {}) {
  const { maxFiles = MAX_MULTI_FILES, maxSize = MAX_FILE_READ_SIZE } = options;
  const files = Array.isArray(filePaths) ? filePaths.slice(0, maxFiles) : [];

  if (!files.length) {
    return { ok: false, error: 'Nessun file specificato.' };
  }

  const results = [];
  for (const filePath of files) {
    const resolvedPath = resolveSearchPath(filePath);
    if (!resolvedPath) {
      results.push({ path: String(filePath || ''), ok: false, error: 'Path fuori dal root consentito del search tool.' });
      continue;
    }
    if (!fs.existsSync(resolvedPath)) {
      results.push({ path: resolvedPath, ok: false, error: 'File non trovato' });
      continue;
    }
    try {
      const stats = fs.statSync(resolvedPath);
      if (stats.size > maxSize) {
        results.push({ path: resolvedPath, ok: false, error: `File troppo grande (${stats.size} bytes)` });
        continue;
      }
      const content = fs.readFileSync(resolvedPath, 'utf-8');
      results.push({ path: resolvedPath, ok: true, content, size: stats.size });
    } catch (error) {
      results.push({ path: resolvedPath, ok: false, error: error.message });
    }
  }

  return { ok: true, files: results };
}

module.exports = {
  globFiles,
  grepFiles,
  readManyFiles,
  resolveSearchPath,
  MAX_GLOB_RESULTS,
  MAX_GREP_RESULTS,
  MAX_MULTI_FILES,
  MAX_FILE_READ_SIZE,
};
