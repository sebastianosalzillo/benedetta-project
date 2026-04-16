const path = require('path');
const fs = require('fs');
const {
  getAppFilePath,
  getWorkspacePath,
  getWorkspaceDailyMemoryPath,
  getWorkspaceFilePath as wmGetWorkspaceFilePath,
  SESSIONS_DIRNAME,
  WORKSPACE_DAILY_MEMORY_DIRNAME,
} = require('./workspace-manager');

const getSessionsDirPath = (app) => path.join(getWorkspacePath(app), SESSIONS_DIRNAME);
const getLegacySessionsDirPath = (app) => getAppFilePath(app, SESSIONS_DIRNAME);

const getWorkspaceMemoryFileName = (app) => {
  if (fs.existsSync(wmGetWorkspaceFilePath(app, 'MEMORY.md'))) return 'MEMORY.md';
  if (fs.existsSync(wmGetWorkspaceFilePath(app, 'memory.md'))) return 'memory.md';
  return '';
};

const listRecentDailyMemoryNotes = (app, limit = 2) => {
  const memoryDir = getWorkspaceDailyMemoryPath(app);
  if (!fs.existsSync(memoryDir)) return [];
  try {
    return fs.readdirSync(memoryDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.md'))
      .map((entry) => {
        const fullPath = path.join(memoryDir, entry.name);
        const stats = fs.statSync(fullPath);
        return {
          name: entry.name,
          relativePath: `${WORKSPACE_DAILY_MEMORY_DIRNAME}/${entry.name}`.replace(/\\/g, '/'),
          fullPath,
          updatedAt: stats.mtime.toISOString(),
          size: stats.size,
        };
      })
      .sort((a, b) => b.name.localeCompare(a.name))
      .slice(0, limit);
  } catch { return []; }
};

module.exports = {
  getSessionsDirPath,
  getLegacySessionsDirPath,
  getWorkspaceMemoryFileName,
  listRecentDailyMemoryNotes,
};
