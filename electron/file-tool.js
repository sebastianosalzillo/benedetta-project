const fs = require('fs');
const path = require('path');

const MAX_FILE_SIZE = 500000;
const MAX_READ_LINES = 2000;

function readTextFile(filePath, options = {}) {
  const { startLine = 1, endLine = null, encoding = 'utf-8' } = options;
  const resolvedPath = path.resolve(filePath);

  if (!fs.existsSync(resolvedPath)) {
    return { ok: false, error: `File non trovato: ${resolvedPath}` };
  }

  const stats = fs.statSync(resolvedPath);
  if (stats.size > MAX_FILE_SIZE && !startLine && !endLine) {
    return { ok: false, error: `File troppo grande (${stats.size} bytes). Usa startLine/endLine per leggere a blocchi.` };
  }

  try {
    const content = fs.readFileSync(resolvedPath, encoding);
    const lines = content.split(/\r?\n/);
    const start = Math.max(0, startLine - 1);
    const end = endLine ? Math.min(endLine, lines.length) : Math.min(start + MAX_READ_LINES, lines.length);
    const slicedLines = lines.slice(start, end);

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
    };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

function writeTextFile(filePath, content, options = {}) {
  const { overwrite = false } = options;
  const resolvedPath = path.resolve(filePath);
  const dir = path.dirname(resolvedPath);

  if (fs.existsSync(resolvedPath) && !overwrite) {
    return { ok: false, error: `File esistente: ${resolvedPath}. Usa overwrite: true per sovrascrivere.` };
  }

  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(resolvedPath, content, 'utf-8');
    return { ok: true, path: resolvedPath, size: Buffer.byteLength(content, 'utf-8') };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

function editFile(filePath, options = {}) {
  const { oldString, newString, replaceAll = false, regex = false, regexFlags = 'g' } = options;
  const resolvedPath = path.resolve(filePath);

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

function deleteFile(filePath) {
  const resolvedPath = path.resolve(filePath);
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

function listDirectory(dirPath) {
  const resolvedPath = path.resolve(dirPath);
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
  MAX_FILE_SIZE,
  MAX_READ_LINES,
};
