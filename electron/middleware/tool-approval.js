/**
 * @fileoverview Tool approval middleware — blocks dangerous tool calls until user confirms.
 *
 * This is a beforeToolCall hook implementation.
 * It integrates with the Agent's beforeToolCall lifecycle to prevent
 * dangerous operations (shell commands, file deletion, desktop control)
 * from executing without explicit user approval.
 *
 * Usage with Agent:
 * ```js
 * const { createApprovalMiddleware, setApprover } = require('./middleware/tool-approval');
 *
 * // Set the approval function (called when a dangerous tool is requested)
 * setApprover(async (toolName, args, reason) => {
 *   // Show a dialog/prompt to the user
 *   const approved = await showApprovalDialog(toolName, args, reason);
 *   return approved;
 * });
 *
 * const agent = new Agent({
 *   beforeToolCall: createApprovalMiddleware(),
 * });
 * ```
 *
 * @module middleware/tool-approval
 */

// ============================================================
// Dangerous tool definitions
// ============================================================

/**
 * Tools that are considered dangerous and require user approval.
 * The keys are tool names, values are human-readable reasons.
 */
const DANGEROUS_TOOLS = {
  shell: 'Esecuzione comandi shell — può modificare il sistema o eliminare file.',
  delete_file: 'Eliminazione file — azione irreversibile.',
  edit_file: 'Modifica file — può alterare il contenuto dei file.',
  write_file: 'Scrittura file — può sovrascrivere file esistenti.',
  // Placeholder for future tools:
  // desktop_control: 'Controllo desktop — può interagire con qualsiasi applicazione.',
  // browser_automation: 'Automazione browser — può navigare e interagire con siti web.',
};

/**
 * Shell command patterns that are ALWAYS blocked, even if user approves.
 * These are too dangerous to ever allow.
 */
const HARD_BLOCKED_COMMANDS = [
  /^\brm\s+(-rf?|--recursive)\s+\/\s/i,          // rm -rf /
  /^\bdel\s+\/[fqs]\s+[a-zA-Z]:\\$/i,             // del /f C:\
  /^\bformat\s+[a-zA-Z]:/i,                        // format C:
  /^\bshutdown\s+\/[as]/i,                         // shutdown /a or /s
  /^\bsudo\s+(rm|dd|mkfs|fdisk)\b/i,              // sudo rm/dd/mkfs/fdisk
  /^\bnet\s+user\s+/i,                             // net user (create/delete users)
  /\b;.*\b(rm\s+-rf?\s+\/|format\s+[a-zA-Z]:)\b/i, // chained system destruction
];

/**
 * Check if a shell command is hard-blocked (too dangerous to ever allow).
 * @param {string} command
 * @returns {boolean}
 */
function isHardBlocked(command) {
  return HARD_BLOCKED_COMMANDS.some((pattern) => pattern.test(command));
}

// ============================================================
// Approval state and function
// ============================================================

/** @type {function(string, Object, string): Promise<boolean>|null} */
let _approver = null;

/**
 * Set the approval function.
 * @param {function(string, Object, string): Promise<boolean>} fn
 *   Receives (toolName, args, reason) and returns true to approve, false to block.
 */
function setApprover(fn) {
  _approver = fn;
}

/**
 * Clear the approval function.
 */
function clearApprover() {
  _approver = null;
}

/**
 * Check if a tool is in the dangerous list.
 * @param {string} toolName
 * @returns {boolean}
 */
function isDangerousTool(toolName) {
  return toolName in DANGEROUS_TOOLS;
}

/**
 * Get the reason why a tool is flagged as dangerous.
 * @param {string} toolName
 * @returns {string}
 */
function getDangerReason(toolName) {
  return DANGEROUS_TOOLS[toolName] || 'Tool flagged as dangerous.';
}

// ============================================================
// Middleware factory
// ============================================================

/**
 * Create a beforeToolCall middleware function for tool approval.
 *
 * The returned function:
 * 1. Checks if the tool is in the dangerous list
 * 2. If not dangerous, allows execution (no approval needed)
 * 3. If dangerous, checks for hard-blocked shell commands
 * 4. If hard-blocked, blocks unconditionally
 * 5. Otherwise, calls the approver function
 * 6. If no approver is set, defaults to BLOCK (safe default)
 *
 * @returns {import('../agent/types').AgentLoopConfig['beforeToolCall']}
 */
function createApprovalMiddleware() {
  return async function beforeToolCall(context, _signal) {
    const toolName = context.toolCall?.name || '';

    // Not a dangerous tool — allow
    if (!isDangerousTool(toolName)) {
      return undefined; // No block, allow execution
    }

    // Check for hard-blocked commands (shell commands that are NEVER allowed)
    if (toolName === 'shell') {
      const cmd = context.args?.command || '';
      if (isHardBlocked(cmd)) {
        return {
          block: true,
          reason: `Comando bloccato permanentemente per sicurezza: "${cmd.slice(0, 80)}"`,
        };
      }
    }

    // No approver set — safe default: BLOCK
    if (!_approver) {
      return {
        block: true,
        reason: `${getDangerReason(toolName)} (Nessuna funzione di approvazione configurata)`,
      };
    }

    // Ask the approver
    try {
      const approved = await _approver(toolName, context.args, getDangerReason(toolName));
      if (!approved) {
        return {
          block: true,
          reason: `${getDangerReason(toolName)} (Rifiutato dall'utente)`,
        };
      }
      return undefined; // Approved
    } catch (err) {
      // If the approver throws, block for safety
      return {
        block: true,
        reason: `Errore durante la richiesta di approvazione: ${err.message}`,
      };
    }
  };
}

module.exports = {
  createApprovalMiddleware,
  setApprover,
  clearApprover,
  isDangerousTool,
  getDangerReason,
  isHardBlocked,
  DANGEROUS_TOOLS,
};
