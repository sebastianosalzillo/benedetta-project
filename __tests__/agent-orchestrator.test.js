const {
  setupOrchestrator,
  agentLoop,
  startDirectAgentRequest,
} = require('../electron/agent-orchestrator');

describe('agent-orchestrator phase bridge', () => {
  test('emits phase status and phase assistant messages through provided callbacks', async () => {
    const phaseEvents = [];
    const assistantMessages = [];

    setupOrchestrator({
      MAX_AGENT_TURNS: 3,
      getActiveResponseId: () => 'req-1',
      runAgentTurn: jest.fn(async () => ({
        response: { sequence: [] },
        phasePlan: {
          phases: [
            { phaseId: 'status-1', kind: 'status', statusText: 'Sto lavorando.' },
            {
              phaseId: 'final-1',
              kind: 'final',
              response: {
                speech: 'Fatto.',
                sequence: [{ type: 'speech', text: 'Fatto.' }],
              },
            },
          ],
        },
      })),
      normalizeLegacyResponseToPhasePlan: () => ({ phases: [] }),
      emitPhaseStreamEvent: (...args) => phaseEvents.push(args),
      createMessageId: (prefix) => `${prefix}-id`,
      emitSpokenStatusUpdate: jest.fn(async () => null),
      emitPhaseAssistantMessage: jest.fn(async (...args) => {
        assistantMessages.push(args);
        return { id: 'assistant-id' };
      }),
      extractToolCalls: () => [],
      extractActionCalls: () => [],
      partitionAvailableToolCalls: () => ({ available: [], blocked: [] }),
      buildAutoToolBatchStartText: () => '',
      handleBrowserDirective: jest.fn(),
      canvasState: () => ({}),
      buildBrowserActionExecutionResult: jest.fn(),
      handleComputerDirective: jest.fn(),
      computerState: () => ({ interactiveElements: [], windows: [] }),
      buildComputerInteractiveSummary: () => ({ summary: '', topControls: [] }),
      buildWindowSummary: () => '',
      applyWorkspaceUpdate: jest.fn(),
      handleCanvasDirective: jest.fn(),
      executeToolCalls: jest.fn(async () => []),
      buildAutoToolBatchCompleteText: () => '',
      buildToolResultPrompt: () => '',
      emitSystemChatStream: jest.fn(),
      sanitizeGenericOutput: (text) => String(text || ''),
    });

    const result = await agentLoop('req-1', 'ciao', 'prompt', {}, {});

    expect(result.completed).toBe(true);
    expect(phaseEvents[0]).toEqual([
      'req-1',
      'status-1',
      'status',
      expect.objectContaining({ type: 'phase_status' }),
    ]);
    expect(assistantMessages[0]).toEqual([
      'req-1',
      'final-1',
      'final',
      'ciao',
      expect.objectContaining({ speech: 'Fatto.' }),
    ]);
  });

  test('clears activeChatRequest created during direct agent loop completion', async () => {
    let activeRequest = null;
    const setActiveChatRequest = jest.fn((next) => {
      activeRequest = next;
    });

    setupOrchestrator({
      resetBrowserAgentState: jest.fn(),
      getSelectedBrainOption: () => ({ label: 'OpenCode' }),
      hasSelectedBrainLauncher: () => true,
      createMessageId: (prefix) => `${prefix}-id`,
      appendHistoryMessage: jest.fn(),
      emitChatStream: jest.fn(),
      setStatus: jest.fn(),
      setBrainMode: jest.fn(),
      setStreamStatus: jest.fn(),
      setTtsState: jest.fn(),
      STREAM_STATUS: { WAIT: 'wait', CONNECTED: 'connected', DISCONNECTED: 'disconnected', ERROR: 'error' },
      refreshComputerState: jest.fn(async () => null),
      buildDirectAgentPrompt: () => 'prompt',
      prepareAgentSessionTurn: () => ({ id: 'session-1', isNew: false }),
      getBrainSpawnConfig: jest.fn(async () => ({ kind: 'opencode-http' })),
      setActiveResponseId: jest.fn(),
      sendAvatarCommand: jest.fn(),
      agentLoop: jest.fn(async (requestId) => {
        activeRequest = {
          id: requestId,
          agentSessionId: 'session-1',
          streamEmitter: { stop: jest.fn() },
        };
        return { cancelled: false, completed: true, lastResponse: null, turns: 1, toolResults: [] };
      }),
      activeChatRequest: () => activeRequest,
      setActiveChatRequest,
      markAgentSessionTurnCompleted: jest.fn(),
      consumeStartupBootPrompt: jest.fn(),
      resetAgentSession: jest.fn(),
      stopActiveChatRequest: jest.fn(),
    });

    await startDirectAgentRequest('req-cleanup', 'ciao');

    expect(setActiveChatRequest).toHaveBeenCalledWith(null);
    expect(activeRequest).toBe(null);
  });
});
