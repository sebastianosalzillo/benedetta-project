'use strict';

const fs = require('fs');
const path = require('path');
const {
  WORKSPACE_REQUIRED_FILES,
  WORKSPACE_FILE_MAX_CHARS,
} = require('./workspace-manager');
const { getWorkspacePath, getWorkspaceFilePath } = require('./workspace-manager');

// Files that are always injected when present and non-empty (required)
// HEARTBEAT.md is injected only if non-empty to avoid wasting tokens.
// MEMORY.md and memory.md are handled exclusively in buildMemoryContextPrompt.
const REQUIRED_FILES = WORKSPACE_REQUIRED_FILES.filter((f) => f !== 'HEARTBEAT.md');

// Files injected only in private sessions (exclude MEMORY.md — handled separately)
const PRIVATE_ONLY_FILES = ['USER.md', 'SOUL.md', 'IDENTITY.md'];

// Optional: injected only when the file exists (e.g. after bootstrap completes)
const OPTIONAL_FILES = ['BOOTSTRAP.md'];

/**
 * Gets the agent workspace path.
 */
function getAgentWorkspacePath(app) {
  return getWorkspacePath(app);
}

/**
 * Reads a workspace Markdown file, trimming to maxChars if specified.
 * Returns null if missing or empty.
 */
function readWorkspaceMarkdown(app, name, { maxChars = WORKSPACE_FILE_MAX_CHARS } = {}) {
  const filePath = getWorkspaceFilePath(app, name);
  try {
    if (!fs.existsSync(filePath)) return null;
    const content = fs.readFileSync(filePath, 'utf8');
    if (!content.trim()) return null; // treat empty files as missing
    return content.slice(0, maxChars);
  } catch (error) {
    console.error(`Error reading workspace file ${name}:`, error.message);
    return null;
  }
}

/**
 * Builds the project context prompt section.
 *
 * - Required files: always included; missing files get a MISSING marker.
 * - HEARTBEAT.md: included only when non-empty (avoids token waste).
 * - PRIVATE_ONLY_FILES: included only in private (1:1) sessions.
 * - OPTIONAL_FILES (e.g. BOOTSTRAP.md): included only when the file exists.
 * - MEMORY.md / memory.md: NOT included here; handled by buildMemoryContextPrompt.
 */
function buildProjectContextPrompt(app, { privateSession = false } = {}) {
  const sections = [];

  // Required files — always inject, MISSING marker if absent
  for (const fileName of REQUIRED_FILES) {
    const content = readWorkspaceMarkdown(app, fileName);
    if (content !== null) {
      sections.push(`### ${fileName}\n${content}\n`);
    } else {
      sections.push(`### ${fileName}\n${fileName}: MISSING\n`);
    }
  }

  // HEARTBEAT.md — only if non-empty
  const heartbeat = readWorkspaceMarkdown(app, 'HEARTBEAT.md');
  if (heartbeat !== null) {
    sections.push(`### HEARTBEAT.md\n${heartbeat}\n`);
  }

  // Private-only files (USER.md etc.) — duplicated in mutable list too, but MEMORY handled separately
  if (privateSession) {
    for (const fileName of PRIVATE_ONLY_FILES) {
      // Skip if already injected via REQUIRED_FILES
      if (REQUIRED_FILES.includes(fileName)) continue;
      const content = readWorkspaceMarkdown(app, fileName);
      if (content !== null) {
        sections.push(`### ${fileName}\n${content}\n`);
      }
    }
  }

  // Optional files — inject only if they exist (no MISSING marker)
  for (const fileName of OPTIONAL_FILES) {
    const content = readWorkspaceMarkdown(app, fileName);
    if (content !== null) {
      sections.push(`### ${fileName}\n${content}\n`);
    }
  }

  return sections.length > 0 ? `PROJECT_CONTEXT:\n${sections.join('')}` : '';
}

/**
 * Builds the memory context prompt section.
 *
 * - MEMORY.md / memory.md: injected only in private sessions (single source of truth).
 * - Lists available daily notes and DREAMS.md for tool-based access.
 * - Today's and yesterday's daily notes are included inline if present.
 */
function buildMemoryContextPrompt(app, { privateSession = false } = {}) {
  const sections = [];

  if (privateSession) {
    // Long-term curated memory — single injection point (not duplicated in buildProjectContextPrompt)
    const memoryContent = readWorkspaceMarkdown(app, 'MEMORY.md');
    if (memoryContent !== null) {
      sections.push(`### MEMORY.md\n${memoryContent}\n`);
    }

    // Alternate lowercase variant
    const memoryMdContent = readWorkspaceMarkdown(app, 'memory.md');
    if (memoryMdContent !== null) {
      sections.push(`### memory.md\n${memoryMdContent}\n`);
    }

    // Inject today's and yesterday's daily notes inline
    const workspacePath = getAgentWorkspacePath(app);
    const memoryDir = path.join(workspacePath, 'memory');
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    for (const day of [yesterday, today]) {
      const dayFile = path.join(memoryDir, `${day}.md`);
      try {
        if (fs.existsSync(dayFile)) {
          const dayContent = fs.readFileSync(dayFile, 'utf8').trim();
          if (dayContent) {
            sections.push(`### memory/${day}.md\n${dayContent.slice(0, 4000)}\n`);
          }
        }
      } catch (_) { /* ignore */ }
    }
  }

  // Always hint about all available memory files (for tool-based access)
  const workspacePath = getAgentWorkspacePath(app);
  const availableFiles = [];
  try {
    const memoryDir = path.join(workspacePath, 'memory');
    if (fs.existsSync(memoryDir)) {
      const files = fs.readdirSync(memoryDir).filter((f) => f.endsWith('.md')).sort().reverse().slice(0, 30);
      availableFiles.push(...files.map((f) => `memory/${f}`));
    }
    if (fs.existsSync(path.join(workspacePath, 'DREAMS.md'))) {
      availableFiles.push('DREAMS.md');
    }
  } catch (_) { /* ignore */ }

  if (availableFiles.length > 0) {
    sections.push(`AVAILABLE_MEMORY_FILES: ${availableFiles.join(', ')}\n`);
  }

  return sections.length > 0 ? `MEMORY_CONTEXT:\n${sections.join('')}` : '';
}

module.exports = {
  getAgentWorkspacePath,
  readWorkspaceMarkdown,
  buildProjectContextPrompt,
  buildMemoryContextPrompt,
};
