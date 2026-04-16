'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Debug logger for timeline events.
 * Logs raw/normalized/parsed/tool/avatar events to JSONL file.
 */

let DEBUG_LOG_PATH;
try {
  DEBUG_LOG_PATH = path.join(require('electron').app.getPath('userData'), 'debug-timeline.jsonl');
} catch {
  DEBUG_LOG_PATH = path.join(__dirname, '..', 'debug-timeline.jsonl'); // fallback for tests
}

/**
 * Log a timeline event.
 */
function logTimelineEvent(eventType, data, requestId = null) {
  try {
    const entry = {
      timestamp: new Date().toISOString(),
      eventType,
      requestId,
      data,
    };
    const line = JSON.stringify(entry) + '\n';
    fs.appendFileSync(DEBUG_LOG_PATH, line);
  } catch (error) {
    console.error('Failed to log timeline event:', error);
  }
}

/**
 * Log model output events.
 */
function logModelOutput(raw, normalized, requestId) {
  logTimelineEvent('model_output', { raw, normalized }, requestId);
}

/**
 * Log parse events.
 */
function logParseResult(parsed, requestId) {
  logTimelineEvent('parse_result', { parsed }, requestId);
}

/**
 * Log tool execution events.
 */
function logToolExecution(toolCall, result, requestId) {
  logTimelineEvent('tool_execution', { toolCall, result }, requestId);
}

/**
 * Log avatar command events.
 */
function logAvatarCommand(command, requestId) {
  logTimelineEvent('avatar_command', { command }, requestId);
}

/**
 * Get recent debug logs.
 */
function getRecentDebugLogs(limit = 100) {
  try {
    if (!fs.existsSync(DEBUG_LOG_PATH)) return [];
    const content = fs.readFileSync(DEBUG_LOG_PATH, 'utf8');
    const lines = content.trim().split('\n').filter(Boolean);
    const logs = lines.slice(-limit).map(line => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    }).filter(Boolean);
    return logs;
  } catch (error) {
    return [];
  }
}

/**
 * Clear debug logs.
 */
function clearDebugLogs() {
  try {
    if (fs.existsSync(DEBUG_LOG_PATH)) {
      fs.unlinkSync(DEBUG_LOG_PATH);
    }
  } catch (error) {
    console.error('Failed to clear debug logs:', error);
  }
}

module.exports = {
  logModelOutput,
  logParseResult,
  logToolExecution,
  logAvatarCommand,
  getRecentDebugLogs,
  clearDebugLogs,
  DEBUG_LOG_PATH,
};
