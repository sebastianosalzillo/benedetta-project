const fs = require('fs');
const path = require('path');

const MAX_GLOB_RESULTS = 100;
const MAX_GREP_RESULTS = 100;
const MAX_MULTI_FILES = 10;
const MAX_FILE_READ_SIZE = 100000;

function globFiles(pattern, searchPath = '.') {
  const resolvedPath = path.resolve(searchPath);
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

function grepFiles(pattern, searchPath = '.', options = {}) {
  const { include = null, maxResults = MAX_GREP_RESULTS, caseInsensitive = true } = options;
  const resolvedPath = path.resolve(searchPath);
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

function readManyFiles(filePaths, options = {}) {
  const { maxFiles = MAX_MULTI_FILES, maxSize = MAX_FILE_READ_SIZE } = options;
  const files = Array.isArray(filePaths) ? filePaths.slice(0, maxFiles) : [];

  if (!files.length) {
    return { ok: false, error: 'Nessun file specificato.' };
  }

  const results = [];
  for (const filePath of files) {
    const resolvedPath = path.resolve(filePath);
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
  MAX_GLOB_RESULTS,
  MAX_GREP_RESULTS,
  MAX_MULTI_FILES,
  MAX_FILE_READ_SIZE,
};
