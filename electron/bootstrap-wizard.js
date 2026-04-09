/**
 * @fileoverview Bootstrap wizard management — extracted from main.js.
 *
 * The bootstrap wizard guides new users through initial setup:
 * personality, workspace, identity, and tool configuration.
 * It manages a multi-turn conversation that populates workspace files.
 *
 * This module is SELF-CONTAINED — it manages its own state and persistence.
 * It communicates with the ACP runtime via callbacks (not direct imports).
 *
 * @module bootstrap-wizard
 */

const path = require('path');

// ============================================================
// Default state
// ============================================================

/**
 * Create default bootstrap state.
 * @returns {{active: boolean, startedAt: string|null, updatedAt: string|null, stepIndex: number, currentPrompt: string, answers: Object}}
 */
function createDefaultBootstrapState() {
  return {
    active: false,
    startedAt: null,
    updatedAt: null,
    stepIndex: 0,
    currentPrompt: '',
    answers: {},
  };
}

// ============================================================
// Bootstrap Wizard
// ============================================================

/**
 * Bootstrap wizard state (mutable reference).
 * @type {ReturnType<typeof createDefaultBootstrapState>}
 */
let _state = createDefaultBootstrapState();

/**
 * Get bootstrap state path.
 * @param {string} userDataDir - Electron userData directory path
 * @returns {string}
 */
function getStatePath(userDataDir) {
  return path.join(userDataDir, 'bootstrap-state.json');
}

/**
 * Get current bootstrap state (read-only copy).
 * @returns {ReturnType<typeof createDefaultBootstrapState>}
 */
function getState() {
  return JSON.parse(JSON.stringify(_state));
}

/**
 * Get internal state reference (for direct mutation).
 * @returns {ReturnType<typeof createDefaultBootstrapState>}
 */
function getStateRef() {
  return _state;
}

/**
 * Start the bootstrap wizard.
 * @param {string} initialPrompt - The first prompt to show to the user
 * @param {function(): string} getBootstrapInitialPrompt - Function to get initial prompt
 * @param {function(): void} refreshWorkspaceState - Function to refresh workspace state
 * @param {function(): void} broadcastStatus - Function to broadcast status to renderers
 * @param {function(string, Object): void} writeJsonFile - Function to write JSON to disk
 * @param {string} userDataDir - Electron userData directory
 */
function startWizard(initialPrompt, getBootstrapInitialPrompt, refreshWorkspaceState, broadcastStatus, writeJsonFile, userDataDir) {
  _state.active = true;
  _state.currentPrompt = initialPrompt || (typeof getBootstrapInitialPrompt === 'function' ? getBootstrapInitialPrompt() : '');
  _state.stepIndex = 1;
  _state.answers = {};
  _state.updatedAt = new Date().toISOString();
  _state.startedAt = _state.startedAt || new Date().toISOString();

  if (typeof writeJsonFile === 'function') {
    writeJsonFile(getStatePath(userDataDir), _state);
  }
  if (typeof refreshWorkspaceState === 'function') {
    refreshWorkspaceState();
  }
  if (typeof broadcastStatus === 'function') {
    broadcastStatus();
  }
}

/**
 * Complete the bootstrap wizard.
 * @param {function(): string} getBootstrapStatePath - Function to get state path
 * @param {function(string, Object): void} writeJsonFile - Function to write JSON
 * @param {function(): void} refreshWorkspaceState - Function to refresh workspace state
 * @param {function(): void} broadcastStatus - Function to broadcast status
 */
function completeWizard(getBootstrapStatePath, writeJsonFile, refreshWorkspaceState, broadcastStatus) {
  _state.active = false;
  _state.currentPrompt = '';
  _state.updatedAt = new Date().toISOString();

  if (typeof writeJsonFile === 'function') {
    writeJsonFile(getBootstrapStatePath(), _state);
  }
  if (typeof refreshWorkspaceState === 'function') {
    refreshWorkspaceState();
  }
  if (typeof broadcastStatus === 'function') {
    broadcastStatus();
  }
}

/**
 * Update bootstrap state from ACP response.
 * Parses the ACP reasoning to extract answers and advance the wizard.
 *
 * @param {Object} acpResponse - ACP turn response object
 * @param {Object} options - Update options
 * @param {function(): void} [options.refreshWorkspaceState]
 * @param {function(): void} [options.broadcastStatus]
 * @param {function(string, Object): void} [options.writeJsonFile]
 * @param {string} [options.userDataDir]
 * @returns {{active: boolean, stepIndex: number, answers: Object}}
 */
function updateStateFromAcp(acpResponse, options = {}) {
  if (!acpResponse || !acpResponse.reasoning) {
    return { active: _state.active, stepIndex: _state.stepIndex, answers: _state.answers };
  }

  // Parse reasoning to extract answers (implementation mirrors main.js logic)
  const reasoning = String(acpResponse.reasoning || '');

  // Try to parse JSON reasoning
  try {
    const parsed = JSON.parse(reasoning);
    if (parsed.answers && typeof parsed.answers === 'object') {
      _state.answers = { ..._state.answers, ...parsed.answers };
    }
    if (parsed.nextPrompt) {
      _state.currentPrompt = String(parsed.nextPrompt);
    }
    if (parsed.stepIndex !== undefined) {
      _state.stepIndex = Number(parsed.stepIndex);
    }
    if (parsed.done === true) {
      _state.active = false;
    }
  } catch {
    // Non-JSON reasoning — check for answer markers
    const answerMatch = reasoning.match(/Answer\s*(\w+):\s*(.+)/i);
    if (answerMatch) {
      _state.answers[answerMatch[1].toLowerCase()] = answerMatch[2].trim();
    }
    const stepMatch = reasoning.match(/Step:\s*(\d+)/i);
    if (stepMatch) {
      _state.stepIndex = Number(stepMatch[1]);
    }
  }

  _state.updatedAt = new Date().toISOString();

  // Persist
  if (options.writeJsonFile && options.userDataDir) {
    options.writeJsonFile(getStatePath(options.userDataDir), _state);
  }
  if (options.refreshWorkspaceState) {
    options.refreshWorkspaceState();
  }
  if (options.broadcastStatus) {
    options.broadcastStatus();
  }

  return { active: _state.active, stepIndex: _state.stepIndex, answers: _state.answers };
}

/**
 * Load bootstrap state from disk.
 * @param {string} userDataDir
 * @param {function(string, Object): Object} [readJsonFile] - JSON file reader function
 * @returns {boolean} True if state was loaded
 */
function loadFromDisk(userDataDir, readJsonFile) {
  if (typeof readJsonFile !== 'function') return false;

  try {
    const loaded = readJsonFile(getStatePath(userDataDir), createDefaultBootstrapState());
    if (loaded && typeof loaded === 'object') {
      _state = { ...createDefaultBootstrapState(), ...loaded };
      return true;
    }
  } catch {
    // Ignore load errors — use defaults
  }
  return false;
}

/**
 * Reset bootstrap state to defaults.
 * @param {function(): string} getBootstrapStatePath
 * @param {function(string, Object): void} writeJsonFile
 * @param {string} userDataDir
 */
function resetState(getBootstrapStatePath, writeJsonFile, userDataDir) {
  _state = createDefaultBootstrapState();
  if (typeof writeJsonFile === 'function') {
    writeJsonFile(getBootstrapStatePath(), _state);
  }
}

/**
 * Get bootstrap status summary for display.
 * @returns {Object}
 */
function getStatus() {
  return {
    active: _state.active,
    stepIndex: _state.stepIndex,
    currentPrompt: _state.currentPrompt,
    answerCount: Object.keys(_state.answers || {}).length,
    startedAt: _state.startedAt,
    updatedAt: _state.updatedAt,
  };
}

/**
 * Check if the current turn is a bootstrap turn.
 * @param {boolean} workspaceBootstrapPending - Whether workspace has pending bootstrap
 * @returns {boolean}
 */
function isBootstrapTurn(workspaceBootstrapPending) {
  return workspaceBootstrapPending || _state.active;
}

// ============================================================
// Module exports
// ============================================================

module.exports = {
  // State management
  createDefaultBootstrapState,
  getState,
  getStateRef,
  getStatePath,
  loadFromDisk,
  resetState,
  getStatus,

  // Wizard lifecycle
  startWizard,
  completeWizard,
  updateStateFromAcp,
  isBootstrapTurn,

  // Internal state reference (for direct mutation when needed)
  _state,
};
