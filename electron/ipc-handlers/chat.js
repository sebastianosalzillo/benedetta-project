/**
 * @fileoverview Chat IPC handlers — extracted from main.js.
 *
 * Factory function that returns the chat:send and chat:stop handlers.
 * The handlers are NOT registered with ipcMain — the caller wires them up.
 *
 * Usage in main.js:
 * ```js
 * const { createChatHandlers } = require('./ipc-handlers/chat');
 * const { send, stop } = createChatHandlers({
 *   getActiveChatRequest, stopActiveChatRequest, ...deps
 * });
 *
 * registerValidatedIpcHandler(ipcMain, 'chat:send', send);
 * registerValidatedIpcHandler(ipcMain, 'chat:stop', stop);
 * ```
 *
 * @module ipc-handlers/chat
 */

/**
 * Dependencies for chat handlers.
 * @typedef {Object} ChatHandlerDeps
 * @property {function(): boolean|null} getActiveChatRequest - Check if a request is active
 * @property {function(string): void} stopActiveChatRequest - Stop active chat with reason
 * @property {function(): string|null} getActiveResponseId - Get active response ID
 * @property {function(string, boolean): void} resolvePlaybackWaitersForRequest - Resolve playback waiters
 * @property {function(): void} clearSpeechResetTimer - Clear speech reset timer
 * @property {function(Object): void} sendAvatarCommand - Send command to avatar
 * @property {function(string): void} setStatus - Set app status
 * @property {function(string): void} setStreamStatus - Set stream status
 * @property {function(string): string} createRequestId - Generate request ID
 * @property {function(string): Object} detectFrustration - Detect user frustration
 * @property {function(Object, string): Object} smartPrune - Smart context pruning
 * @property {function(Object): void} onUserInteraction - Track user interaction for dream mode
 * @property {function(Object, function): void} scheduleDream - Schedule dream cycle
 * @property {function(string, Object): Promise<Object>} runDreamCycle - Run dream cycle
 * @property {function(Object): void} appendHistoryMessage - Add message to chat history
 * @property {function(string): string} createMessageId - Generate message ID
 * @property {function(string): Promise<Object|null>} runLocalChatCommand - Run local commands (slash commands, etc.)
 * @property {function(): boolean} isBootstrapPending - Check if workspace bootstrap is pending
 * @property {function(): boolean} isBootstrapActive - Check if bootstrap wizard is active
 * @property {function(): void} startBootstrapWizard - Start bootstrap wizard
 * @property {function(string, string, Object): Promise<void>} startBootstrapAcpRequest - Start bootstrap ACP request
 * @property {function(string, string): Promise<void>} startDirectAcpRequest - Start direct ACP request
 * @property {function(string, Object): void} reportDetachedAsyncError - Report async error
 * @property {function(string): void} emitHook - Emit event hook
 * @property {Object} personalityState - Personality state reference
 * @property {Object} dreamState - Dream state reference
 * @property {string} personalityPath - Path to personality file
 * @property {Object} chatHistory - Chat history array reference
 * @property {Object} workspaceState - Workspace state reference
 * @property {Object} bootstrapState - Bootstrap state reference
 * @property {string} STREAM_STATUS - Stream status constants
 */

/**
 * Create chat IPC handlers.
 * @param {ChatHandlerDeps} deps
 * @returns {{send: Function, stop: Function}}
 */
function createChatHandlers(deps) {
  return {
    /**
     * chat:stop — stop active chat request.
     */
    stop: async () => {
      deps.stopActiveChatRequest('user-stop');
      return { ok: true };
    },

    /**
     * chat:send — send a user message and start processing.
     */
    send: async (_event, text) => {
      const trimmed = String(text || '').trim();
      if (!trimmed) {
        return { ok: false, error: 'Empty message' };
      }

      // Check for active request (concurrency guard)
      if (deps.getActiveChatRequest()) {
        return { ok: false, error: 'Another response is already running' };
      }

      // Clear previous response state
      const prevResponseId = deps.getActiveResponseId();
      if (prevResponseId) {
        deps.resolvePlaybackWaitersForRequest(prevResponseId, false);
        deps.clearSpeechResetTimer();
        deps.sendAvatarCommand({ cmd: 'stop' });
        deps.setStatus('idle');
        deps.setStreamStatus(deps.STREAM_STATUS.CONNECTED);
      }

      // Check if this is a bootstrap turn
      const isBootstrapTurn = deps.workspaceState.bootstrapPending || deps.bootstrapState.active;
      const requestId = deps.createRequestId();

      // Frustration detection
      const frustrationResult = deps.detectFrustration(trimmed);
      if (frustrationResult.frustrated) {
        deps.personalityState.empathyLevel = Math.min(1, deps.personalityState.empathyLevel + 0.05);
        deps.personalityState.energyLevel = Math.max(0, deps.personalityState.energyLevel - 0.05);
        deps.emitHook(deps.HOOK_EVENTS.FRUSTRATION, {
          text: trimmed,
          score: frustrationResult.score,
        });
      }

      // Context pruning
      const pruneResult = deps.smartPrune(deps.chatHistory, trimmed);
      if (pruneResult.action !== 'none') {
        deps.emitHook(deps.HOOK_EVENTS.CONTEXT_PRUNE, {
          chatHistory: deps.chatHistory,
          action: pruneResult.action,
          pruned: pruneResult.pruned,
        });
      }

      // Dream mode scheduling
      deps.onUserInteraction(deps.dreamState);
      deps.scheduleDream(deps.dreamState, async () => {
        await deps.runDreamCycle(deps.personalityPath);
      });

      // Create user message
      const userMessage = {
        id: deps.createMessageId('user'),
        requestId,
        role: 'user',
        text: trimmed,
        meta: isBootstrapTurn ? { bootstrap: true } : undefined,
        ts: new Date().toISOString(),
      };

      deps.appendHistoryMessage(userMessage);

      // Check for local commands (slash commands, etc.)
      const localCommandResult = await deps.runLocalChatCommand(trimmed);
      if (localCommandResult) {
        deps.appendHistoryMessage(localCommandResult.message);
        return {
          ok: true,
          requestId: null,
          replaceHistory: Boolean(localCommandResult.replaceHistory),
          messages: localCommandResult.replaceHistory
            ? deps.chatHistory
            : [userMessage, localCommandResult.message],
        };
      }

      // Bootstrap flow
      if (isBootstrapTurn) {
        if (!deps.bootstrapState.active) {
          deps.startBootstrapWizard();
          deps.startBootstrapAcpRequest(requestId, trimmed, { mode: 'start' })
            .catch((error) => {
              deps.reportDetachedAsyncError('startBootstrapAcpRequest:start', error, requestId);
            });
        } else {
          deps.startBootstrapAcpRequest(requestId, trimmed, { mode: 'answer' })
            .catch((error) => {
              deps.reportDetachedAsyncError('startBootstrapAcpRequest:answer', error, requestId);
            });
        }

        return {
          ok: true,
          requestId,
          replaceHistory: false,
          messages: [userMessage],
        };
      }

      // Normal ACP flow
      deps.startDirectAcpRequest(requestId, trimmed)
        .catch((error) => {
          deps.reportDetachedAsyncError('startDirectAcpRequest', error, requestId);
        });

      return {
        ok: true,
        requestId,
        messages: [userMessage],
      };
    },
  };
}

module.exports = {
  createChatHandlers,
};
