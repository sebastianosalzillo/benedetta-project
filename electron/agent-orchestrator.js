const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

/**
 * Configure dependencies for the orchestrator.
 */
let deps = {};
function setupOrchestrator(context) {
  deps = context;
}

const READ_ONLY_TOOL_TYPES = new Set(['read_file', 'glob', 'grep', 'web_fetch', 'web_search', 'memory_search']);
const DATA_TOOL_TYPES = new Set(['read_file', 'write_file', 'edit_file', 'apply_patch', 'shell', 'glob', 'grep', 'multi_file_read', 'git', 'web_fetch', 'web_search', 'task', 'memory_search']);
const ACTION_TOOL_TYPES = new Set(['avatar', 'delay', 'browser', 'computer', 'canvas', 'workspace']);

/**
 * Core agent loop that handles multi-turn interactions.
 */
async function agentLoop(requestId, userText, prompt, sessionInfo, options = {}) {
  const {
    MAX_AGENT_TURNS,
    getActiveResponseId,
    runAcpTurn,
    normalizeLegacyResponseToPhasePlan,
    emitPhaseStreamEvent,
    createMessageId,
    emitSpokenStatusUpdate,
    emitPhaseAssistantMessage,
    extractToolCalls,
    extractActionCalls,
    partitionAvailableToolCalls,
    buildAutoToolBatchStartText,
    handleBrowserDirective,
    canvasState,
    buildBrowserActionExecutionResult,
    handleComputerDirective,
    computerState,
    buildComputerInteractiveSummary,
    buildWindowSummary,
    applyWorkspaceUpdate,
    handleCanvasDirective,
    executeToolCalls,
    buildAutoToolBatchCompleteText,
    buildToolResultPrompt,
    emitSystemChatStream,
  } = deps;

  let currentPrompt = prompt;
  let turnCount = 0;
  let lastResponse = null;
  let allToolResults = [];
  const rebuildPrompt = typeof options.rebuildPrompt === 'function' ? options.rebuildPrompt : (() => prompt);

  while (turnCount < MAX_AGENT_TURNS) {
    turnCount += 1;

    if (getActiveResponseId() !== requestId) {
      return { cancelled: true, lastResponse, turns: turnCount, toolResults: allToolResults };
    }

    const turn = await runAcpTurn(requestId, currentPrompt, userText, sessionInfo, {
      ...options,
      streamPreview: turnCount === 1,
    });

    const phasePlan = turn.phasePlan || normalizeLegacyResponseToPhasePlan(turn.response, userText);
    const phases = Array.isArray(phasePlan?.phases) ? phasePlan.phases : [];

    if (!phases.length) {
      lastResponse = turn.response;
      break;
    }

    let nextPromptAfterTools = null;
    let shouldContinueLoop = false;

    for (const phase of phases) {
      const phaseId = String(phase?.phaseId || `phase-${turnCount}`).trim() || `phase-${turnCount}`;
      const phaseKind = String(phase?.kind || 'message').trim().toLowerCase();

      if (phaseKind === 'status') {
        emitPhaseStreamEvent(requestId, phaseId, phaseKind, {
          type: 'phase_status',
          message: {
            id: createMessageId('system'),
            requestId,
            phaseId,
            phaseKind,
            role: 'system',
            text: phase.statusText || '',
            ts: new Date().toISOString(),
          },
        });
        if (phase.speak === true) {
          await emitSpokenStatusUpdate(requestId, phaseId, phase.statusText, { emotion: 'think', gesture: 'index' });
        }
        continue;
      }

      if (phaseKind === 'message') {
        if (phase.response?.sequence?.length) {
          lastResponse = phase.response;
          emitPhaseStreamEvent(requestId, phaseId, phaseKind, { type: 'phase_started' });
          await emitPhaseAssistantMessage(requestId, phaseId, phaseKind, userText, phase.response);
        }
        continue;
      }

      if (phaseKind === 'blocked') {
        if (phase.response?.sequence?.length) {
          lastResponse = phase.response;
          emitPhaseStreamEvent(requestId, phaseId, phaseKind, { type: 'phase_started' });
          await emitPhaseAssistantMessage(requestId, phaseId, phaseKind, userText, phase.response);
        }
        return { cancelled: false, blocked: true, lastResponse, turns: turnCount, toolResults: allToolResults };
      }

      if (phaseKind === 'final') {
        if (phase.response?.sequence?.length) {
          lastResponse = phase.response;
          emitPhaseStreamEvent(requestId, phaseId, phaseKind, { type: 'phase_started' });
          await emitPhaseAssistantMessage(requestId, phaseId, phaseKind, userText, phase.response);
        }
        return { cancelled: false, completed: true, lastResponse, turns: turnCount, toolResults: allToolResults };
      }

      if (phaseKind !== 'tool_batch') continue;

      const phaseSequence = Array.isArray(phase.sequence) ? phase.sequence : [];
      const dataToolCalls = extractToolCalls(phaseSequence);
      const actionCalls = extractActionCalls(phaseSequence);
      const { available: executableActionCalls, blocked: blockedActionCalls } = partitionAvailableToolCalls(actionCalls);
      const { available: executableDataToolCalls, blocked: blockedDataToolCalls } = partitionAvailableToolCalls(dataToolCalls);
      
      const blockedResults = [...blockedActionCalls, ...blockedDataToolCalls];
      if (blockedResults.length) allToolResults.push(...blockedResults);

      const actionExecutionResults = [];
      const executableToolNames = [...executableActionCalls, ...executableDataToolCalls].map((call) => call.type);
      const autoStartText = buildAutoToolBatchStartText(executableActionCalls, executableDataToolCalls);

      if (autoStartText) {
        await emitSpokenStatusUpdate(requestId, phaseId, autoStartText, {
          emotion: executableToolNames.includes('browser') ? 'think' : 'neutral',
          gesture: executableToolNames.includes('browser') ? 'index' : undefined,
        });
      }

      emitPhaseStreamEvent(requestId, phaseId, phaseKind, {
        type: 'phase_tool_start',
        tools: executableToolNames,
        turn: turnCount,
      });

      for (const actionCall of executableActionCalls) {
        if (actionCall.type === 'avatar' || actionCall.type === 'delay') continue;
        if (actionCall.type === 'browser') {
          const browserResult = await handleBrowserDirective(actionCall.directive);
          actionExecutionResults.push(buildBrowserActionExecutionResult(actionCall.directive, browserResult, canvasState()));
        } else if (actionCall.type === 'computer') {
          const computerResult = await handleComputerDirective({ ...actionCall.directive, requestId });
          if (computerResult?.ok === false) {
            actionExecutionResults.push({
              type: 'computer',
              ok: false,
              action: actionCall.directive?.action || '',
              error: deps.sanitizeGenericOutput(computerResult.error),
              note: deps.sanitizeGenericOutput(computerResult?.warning || ''),
              warnings: [deps.sanitizeGenericOutput(computerResult?.warning || computerResult?.error || '')].filter(Boolean),
            });
          } else {
            const interactiveSummary = buildComputerInteractiveSummary(computerState().interactiveElements);
            actionExecutionResults.push({
              type: 'computer',
              ok: true,
              action: actionCall.directive?.action || '',
              windowTitle: deps.sanitizeGenericOutput(String(computerResult?.windowTitle || computerResult?.title || '').trim()),
              note: deps.sanitizeGenericOutput(String(computerResult?.message || computerResult?.warning || '').trim()),
              interactiveSummary: interactiveSummary.summary,
              topControls: interactiveSummary.topControls,
              windowSummary: buildWindowSummary(computerState().windows),
              warnings: [deps.sanitizeGenericOutput(computerResult?.warning || '')].filter(Boolean),
            });
          }
        } else if (actionCall.type === 'workspace') {
          const workspaceResult = applyWorkspaceUpdate(actionCall.directive);
          if (workspaceResult?.ok === false) {
            actionExecutionResults.push({ type: 'workspace', ok: false, error: workspaceResult.error, mode: String(actionCall.directive?.mode || 'append').trim(), warnings: [workspaceResult.error].filter(Boolean) });
          } else {
            actionExecutionResults.push({ type: 'workspace', ok: true, file: workspaceResult.file, path: workspaceResult.path, skipped: Boolean(workspaceResult.skipped), mode: String(actionCall.directive?.mode || 'append').trim(), summary: workspaceResult.skipped ? 'contenuto gia presente' : 'workspace aggiornato', warnings: [] });
          }
        } else if (actionCall.type === 'canvas') {
          await handleCanvasDirective(actionCall.directive);
          actionExecutionResults.push({
            type: 'canvas',
            ok: true,
            contentType: String(canvasState().content?.type || '').trim(),
            title: String(canvasState().content?.title || '').trim(),
            summary: canvasState().content?.type === 'browser'
              ? `browser canvas attivo su ${String(canvasState().content?.pageTitle || 'Browser').trim()}`
              : `canvas aggiornato con ${String(canvasState().content?.type || 'unknown').trim()}`,
            warnings: [],
          });
        }
      }

      if (actionExecutionResults.length) allToolResults.push(...actionExecutionResults);

      const nonSpeechToolResults = [...blockedResults, ...actionExecutionResults];
      if (!executableDataToolCalls.length) {
        if (nonSpeechToolResults.length) {
          emitPhaseStreamEvent(requestId, phaseId, phaseKind, nonSpeechToolResults.some(r => !r.ok) ? { type: 'phase_tool_error', errors: nonSpeechToolResults.filter(r => !r.ok).map(r => `${r.type}: ${r.error}`).join('; '), turn: turnCount } : { type: 'phase_tool_complete', tools: nonSpeechToolResults.map(r => r.type), turn: turnCount });
          const autoCompleteText = buildAutoToolBatchCompleteText(nonSpeechToolResults);
          if (autoCompleteText) await emitSpokenStatusUpdate(requestId, phaseId, autoCompleteText, { emotion: nonSpeechToolResults.some(r => !r.ok) ? 'fear' : 'happy', gesture: nonSpeechToolResults.some(r => !r.ok) ? 'shrug' : 'thumbup' });
          nextPromptAfterTools = [rebuildPrompt(userText), '', `--- TURN ${turnCount} PHASE ${phaseId} TOOL RESULTS ---`, buildToolResultPrompt(nonSpeechToolResults, userText)].join('\n\n');
          shouldContinueLoop = true;
        }
        continue;
      }

      const results = await executeToolCalls(executableDataToolCalls);
      const combinedResults = [...nonSpeechToolResults, ...results];
      allToolResults.push(...results);
      const hasErrors = combinedResults.some(r => !r.ok);

      emitPhaseStreamEvent(requestId, phaseId, phaseKind, hasErrors ? { type: 'phase_tool_error', errors: combinedResults.filter(r => !r.ok).map(r => `${r.type}: ${r.error}`).join('; '), turn: turnCount } : { type: 'phase_tool_complete', tools: combinedResults.map(r => r.type), turn: turnCount });
      const autoCompleteText = buildAutoToolBatchCompleteText(combinedResults);
      if (autoCompleteText) await emitSpokenStatusUpdate(requestId, phaseId, autoCompleteText, { emotion: hasErrors ? 'fear' : 'happy', gesture: hasErrors ? 'shrug' : 'thumbup' });
      nextPromptAfterTools = [rebuildPrompt(userText), '', `--- TURN ${turnCount} PHASE ${phaseId} TOOL RESULTS ---`, buildToolResultPrompt(combinedResults, userText)].join('\n\n');
      shouldContinueLoop = true;
      break;
    }

    if (shouldContinueLoop) {
      currentPrompt = nextPromptAfterTools || rebuildPrompt(userText);
      continue;
    }

    lastResponse = turn.response || lastResponse;
    break;
  }

  if (turnCount >= MAX_AGENT_TURNS) {
    emitSystemChatStream(requestId, `Agent loop: massimo ${MAX_AGENT_TURNS} turni raggiunto.`);
  }

  return { cancelled: false, completed: false, lastResponse, turns: turnCount, toolResults: allToolResults };
}

async function startDirectAcpRequest(requestId, userText) {
  const {
    resetBrowserAgentState,
    getSelectedBrainOption,
    hasSelectedBrainLauncher,
    createMessageId,
    appendHistoryMessage,
    emitChatStream,
    setStatus,
    setBrainMode,
    setStreamStatus,
    setTtsState,
    STREAM_STATUS,
    refreshComputerState,
    buildDirectAcpPrompt,
    prepareAcpSessionTurn,
    getBrainSpawnConfig,
    setActiveResponseId,
    sendAvatarCommand,
    agentLoop,
    activeChatRequest,
    setActiveChatRequest,
    markAcpSessionTurnCompleted,
    consumeStartupBootPrompt,
    resetAcpSession,
    stopActiveChatRequest,
  } = deps;

  resetBrowserAgentState();
  const selectedBrain = getSelectedBrainOption();

  if (!hasSelectedBrainLauncher()) {
    const errorMessage = { id: createMessageId('system'), role: 'system', text: `ACP non disponibile: launcher ${selectedBrain.label} non trovato.`, ts: new Date().toISOString() };
    appendHistoryMessage(errorMessage);
    emitChatStream({ type: 'error', requestId, error: errorMessage.text, message: errorMessage });
    setStatus('error');
    setBrainMode('direct-acp-missing');
    setStreamStatus(STREAM_STATUS.DISCONNECTED);
    setTtsState('error', { error: errorMessage.text });
    return;
  }

  await refreshComputerState().catch(() => null);
  const prompt = buildDirectAcpPrompt(userText);
  const sessionInfo = prepareAcpSessionTurn();
  const launch = await getBrainSpawnConfig(prompt, sessionInfo);
  
  setActiveResponseId(requestId);
  setStatus('thinking');
  setBrainMode('direct-acp-streaming');
  setStreamStatus(STREAM_STATUS.WAIT);
  sendAvatarCommand({ cmd: 'expression', expression: 'think' });
  sendAvatarCommand({ cmd: 'gesture', gesture: 'index', duration: 6 });
  emitChatStream({ type: 'started', requestId });

  try {
    const result = await agentLoop(requestId, userText, prompt, sessionInfo, {
      rebuildPrompt: buildDirectAcpPrompt,
      streamPreview: launch.kind !== 'ollama-http',
      strictJson: true,
    });

    if (result.cancelled) {
      const active = activeChatRequest();
      if (active?.id === requestId) {
        active.streamEmitter?.stop();
        setActiveChatRequest(null);
      }
      setActiveResponseId(null);
      setStatus('idle');
      setBrainMode('direct-acp-ready');
      setStreamStatus(STREAM_STATUS.CONNECTED);
      return;
    }

    const active = activeChatRequest();
    const finalSessionId = active?.acpSessionId || sessionInfo.id;
    if (active?.id === requestId) {
      active.streamEmitter?.stop();
      setActiveChatRequest(null);
    }
    markAcpSessionTurnCompleted(finalSessionId);
    consumeStartupBootPrompt();
    setStatus('idle');
    setBrainMode('direct-acp-ready');
    setStreamStatus(STREAM_STATUS.CONNECTED);
  } catch (error) {
    const active = activeChatRequest();
    const cancelled = Boolean(active?.cancelled);
    const stopReason = active?.stopReason;
    const acpSessionId = active?.acpSessionId || sessionInfo.id;
    const acpSessionNew = Boolean(active?.acpSessionNew ?? sessionInfo.isNew);

    if (active?.id === requestId) {
      active.streamEmitter?.stop();
      setActiveChatRequest(null);
    }

    if (cancelled) {
      if (acpSessionNew) resetAcpSession(acpSessionId);
      setActiveResponseId(null);
      const systemMessage = { id: createMessageId('system'), role: 'system', text: stopReason === 'timeout' ? 'Risposta interrotta per timeout.' : 'Risposta interrotta.', ts: new Date().toISOString() };
      appendHistoryMessage(systemMessage);
      emitChatStream({ type: 'stopped', requestId, message: systemMessage });
      setStatus('idle');
      setBrainMode('direct-acp-ready');
      setStreamStatus(stopReason === 'timeout' ? STREAM_STATUS.TIMEOUT : STREAM_STATUS.CONNECTED);
      setTtsState('idle', { error: null });
      return;
    }

    setActiveResponseId(null);
    const systemMessage = { id: createMessageId('system'), role: 'system', text: error.message || 'Errore ACP diretto', ts: new Date().toISOString() };
    appendHistoryMessage(systemMessage);
    emitChatStream({ type: 'error', requestId, error: systemMessage.text, message: systemMessage });
    setStatus('error');
    setBrainMode('direct-acp-error');
    setStreamStatus(STREAM_STATUS.ERROR);
    setTtsState('error', { error: systemMessage.text });
  }
}

async function startBootstrapAcpRequest(requestId, userText, options = {}) {
  const {
    resetBrowserAgentState,
    getSelectedBrainOption,
    hasSelectedBrainLauncher,
    createMessageId,
    appendHistoryMessage,
    emitChatStream,
    setStatus,
    setBrainMode,
    setStreamStatus,
    setTtsState,
    STREAM_STATUS,
    prepareAcpSessionTurn,
    setActiveChatRequest,
    buildBootstrapAcpPrompt,
    agentLoop,
    setActiveResponseId,
    consumeStartupBootPrompt,
    completeWorkspaceBootstrap,
  } = deps;

  resetBrowserAgentState();
  const selectedBrain = getSelectedBrainOption();

  if (!hasSelectedBrainLauncher()) {
    const errorMessage = { id: createMessageId('system'), role: 'system', text: `ACP non disponibile: launcher ${selectedBrain.label} non trovato.`, ts: new Date().toISOString() };
    appendHistoryMessage(errorMessage);
    emitChatStream({ type: 'error', requestId, error: errorMessage.text, message: errorMessage });
    setStatus('error');
    setBrainMode('direct-acp-missing');
    setStreamStatus(STREAM_STATUS.DISCONNECTED);
    setTtsState('error', { error: errorMessage.text });
    return;
  }

  const sessionInfo = prepareAcpSessionTurn();
  const activeChatRequest = {
    id: requestId,
    proc: null,
    cancelled: false,
    buffer: '',
    preview: '',
    acpSessionId: sessionInfo.id,
    acpSessionNew: sessionInfo.isNew,
    streamEmitter: deps.createStreamEmitter(requestId),
  };
  setActiveChatRequest(activeChatRequest);

  const prompt = buildBootstrapAcpPrompt(userText, options);
  setActiveResponseId(requestId);
  setStatus('thinking');
  setBrainMode('direct-acp-streaming');
  setStreamStatus(STREAM_STATUS.WAIT);
  emitChatStream({ type: 'started', requestId });

  try {
    const result = await agentLoop(requestId, userText, prompt, sessionInfo, {
      rebuildPrompt: buildBootstrapAcpPrompt,
      streamPreview: true,
      strictJson: true,
    });

    if (result.cancelled) {
      if (activeChatRequest.id === requestId) {
        activeChatRequest.streamEmitter?.stop();
        setActiveChatRequest(null);
      }
      setActiveResponseId(null);
      setStatus('idle');
      return;
    }

    if (activeChatRequest.id === requestId) {
      activeChatRequest.streamEmitter?.stop();
      setActiveChatRequest(null);
    }
    consumeStartupBootPrompt();
    setStatus('idle');
    setBrainMode('direct-acp-ready');
    setStreamStatus(STREAM_STATUS.CONNECTED);
  } catch (error) {
    setActiveResponseId(null);
    if (activeChatRequest.id === requestId) {
      activeChatRequest.streamEmitter?.stop();
      setActiveChatRequest(null);
    }
    const systemMessage = { id: createMessageId('system'), role: 'system', text: error.message || 'Errore bootstrap', ts: new Date().toISOString() };
    appendHistoryMessage(systemMessage);
    emitChatStream({ type: 'error', requestId, error: systemMessage.text, message: systemMessage });
    setStatus('error');
  }
}

module.exports = {
  setupOrchestrator,
  agentLoop,
  startDirectAcpRequest,
  startBootstrapAcpRequest,
};
