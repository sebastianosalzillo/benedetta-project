const fs = require('fs');
const path = require('path');
const PATCH_ROOT = path.resolve(process.env.NYX_FILE_TOOL_ROOT || process.cwd());

function isPathWithinRoot(rootPath, targetPath) {
  return targetPath === rootPath || targetPath.startsWith(`${rootPath}${path.sep}`);
}

function resolvePatchPath(filePath) {
  const resolvedPath = path.resolve(PATCH_ROOT, String(filePath || ''));
  if (!isPathWithinRoot(PATCH_ROOT, resolvedPath)) {
    return null;
  }
  return resolvedPath;
}

function applyPatch(filePath, patch) {
  const resolvedPath = resolvePatchPath(filePath);
  if (!resolvedPath) {
    return { ok: false, error: 'Path fuori dal root consentito del patch tool.' };
  }
  if (!fs.existsSync(resolvedPath)) {
    return { ok: false, error: `File non trovato: ${resolvedPath}` };
  }

  try {
    const originalContent = fs.readFileSync(resolvedPath, 'utf-8');
    const lines = originalContent.split('\n');
    const newContent = lines.map((line, i) => {
      if (patch.oldStart !== undefined && i >= patch.oldStart && i < patch.oldStart + patch.oldLines.length) {
        const lineIndex = i - patch.oldStart;
        if (lineIndex < patch.oldLines.length && line.trim() === patch.oldLines[lineIndex].trim()) {
          return patch.newLines[lineIndex] !== undefined ? patch.newLines[lineIndex] : line;
        }
      }
      return line;
    }).join('\n');

    if (newContent === originalContent) {
      return { ok: false, error: 'Nessuna modifica applicata. Le righe non corrispondono.' };
    }

    fs.writeFileSync(resolvedPath, newContent, 'utf-8');
    return { ok: true, path: resolvedPath, diff: { old: patch.oldLines?.length || 0, new: patch.newLines?.length || 0 } };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

function applyPatchText(filePath, oldText, newText, replaceAll = false) {
  const resolvedPath = resolvePatchPath(filePath);
  if (!resolvedPath) {
    return { ok: false, error: 'Path fuori dal root consentito del patch tool.' };
  }
  if (!fs.existsSync(resolvedPath)) {
    return { ok: false, error: `File non trovato: ${resolvedPath}` };
  }

  try {
    const content = fs.readFileSync(resolvedPath, 'utf-8');
    let newContent;
    let replacements = 0;

    if (replaceAll) {
      const escaped = oldText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(escaped, 'g');
      const matches = content.match(pattern);
      replacements = matches ? matches.length : 0;
      newContent = content.replace(pattern, newText);
    } else {
      const index = content.indexOf(oldText);
      if (index === -1) {
        return { ok: false, error: 'Testo non trovato nel file.', path: resolvedPath };
      }
      replacements = 1;
      newContent = content.slice(0, index) + newText + content.slice(index + oldText.length);
    }

    if (newContent === content) {
      return { ok: false, error: 'Nessuna modifica. Testo non trovato o identico.', path: resolvedPath };
    }

    fs.writeFileSync(resolvedPath, newContent, 'utf-8');
    return { ok: true, path: resolvedPath, replacements, size: Buffer.byteLength(newContent, 'utf-8') };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

module.exports = { applyPatch, applyPatchText, resolvePatchPath };
