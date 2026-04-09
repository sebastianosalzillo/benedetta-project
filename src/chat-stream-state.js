/**
 * @typedef {Object} ChatMessage
 * @property {string} id - Unique message identifier
 * @property {string} role - Message role: 'user' | 'assistant' | 'system'
 * @property {string} text - Message content
 * @property {string} [requestId] - Associated request ID for streaming
 * @property {string} [phaseId] - ACP phase identifier
 * @property {string} [phaseKind] - ACP phase kind
 * @property {boolean} [streaming] - Whether message is still streaming
 * @property {boolean} [interrupted] - Whether streaming was interrupted
 * @property {string} [ts] - ISO timestamp
 * @property {Object} [meta] - Additional metadata (emotion, mood, motion)
 */

/**
 * @typedef {Object} StreamEvent
 * @property {string} type - Event type
 * @property {string} [requestId] - Request identifier
 * @property {string} [phaseId] - Phase identifier
 * @property {string} [phaseKind] - Phase kind
 * @property {number} [turn] - Turn number
 * @property {ChatMessage} [message] - Message object
 * @property {string} [text] - Delta text for streaming
 * @property {string[]} [tools] - Tool names
 * @property {string} [errors] - Error message
 * @property {string} [error] - Error message
 */

/**
 * Creates a system message with generated ID.
 * @param {string} text - Message content
 * @returns {ChatMessage} System message object
 */
export function createSystemMessage(text) {
  return {
    id: `system-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    role: 'system',
    text,
  };
}

function normalizeStreamMessage(message, fallbackText, overrides = {}) {
  if (message && typeof message === 'object' && !Array.isArray(message)) {
    return {
      ...message,
      ...overrides,
      id: message.id || overrides.id || `stream-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      role: message.role || overrides.role || 'system',
      text: typeof message.text === 'string' ? message.text : (fallbackText || ''),
    };
  }

  return {
    ...createSystemMessage(typeof message === 'string' ? message : fallbackText),
    ...overrides,
  };
}

function buildPhaseMessageId(requestId, phaseId) {
  return `phase-${requestId || 'request'}-${phaseId || 'phase'}`;
}

function buildPhaseSystemId(prefix, requestId, phaseId, turn) {
  return `${prefix}-${requestId || 'request'}-${phaseId || 'phase'}-${turn || Date.now()}`;
}

function removeStreamingPlaceholders(messages, requestId) {
  return messages.filter((message) => !(message.requestId === requestId && message.streaming));
}

function upsertPhaseAssistantMessage(messages, event) {
  const phaseId = event.phaseId || event.message?.phaseId || 'phase';
  const nextMessage = normalizeStreamMessage(event.message, '', {
    id: buildPhaseMessageId(event.requestId, phaseId),
    requestId: event.requestId,
    phaseId,
    phaseKind: event.phaseKind || event.message?.phaseKind || null,
    role: 'assistant',
    streaming: false,
  });

  const withoutStreaming = removeStreamingPlaceholders(messages, event.requestId);
  const existingIndex = withoutStreaming.findIndex((message) => message.id === nextMessage.id);
  if (existingIndex === -1) {
    return [...withoutStreaming, nextMessage];
  }

  return withoutStreaming.map((message, index) => (index === existingIndex ? nextMessage : message));
}

function createPhaseStatusMessage(event, textPrefix, idPrefix) {
  return {
    id: buildPhaseSystemId(idPrefix, event.requestId, event.phaseId, event.turn),
    requestId: event.requestId,
    phaseId: event.phaseId || null,
    phaseKind: event.phaseKind || null,
    role: 'system',
    text: textPrefix,
    ts: new Date().toISOString(),
  };
}

function createToolStatusMessage(event, text, idPrefix) {
  return {
    id: `${idPrefix}-${event.requestId}-${event.turn}`,
    requestId: event.requestId,
    role: 'system',
    text,
    ts: new Date().toISOString(),
  };
}

function appendStreamingDelta(messages, event) {
  const hasPlaceholder = messages.some((message) => message.requestId === event.requestId && message.streaming);
  if (!hasPlaceholder) {
    return [
      ...messages,
      {
        id: `stream-${event.requestId}`,
        requestId: event.requestId,
        role: 'assistant',
        text: event.text,
        streaming: true,
      },
    ];
  }

  return messages.map((message) => {
    if (message.requestId !== event.requestId || !message.streaming) return message;
    return {
      ...message,
      text: `${message.text}${event.text}`,
    };
  });
}

function completeStreamingMessage(messages, event) {
  const hasPlaceholder = messages.some((message) => message.requestId === event.requestId && message.streaming);
  const nextMessage = normalizeStreamMessage(event.message, 'Response completed.', {
    requestId: event.requestId,
    role: 'assistant',
    streaming: false,
  });

  if (!hasPlaceholder) {
    return [...messages, nextMessage];
  }

  return messages.map((message) => {
    if (message.requestId !== event.requestId || !message.streaming) return message;
    return nextMessage;
  });
}

function stopStreamingMessage(messages, event) {
  const updated = messages.map((message) => {
    if (message.requestId !== event.requestId || !message.streaming) return message;
    return {
      ...message,
      streaming: false,
      interrupted: true,
    };
  });

  return [...updated, normalizeStreamMessage(event.message, 'Request stopped.', { requestId: event.requestId })];
}

/**
 * Pure reducer: applies a stream event to produce the next messages state.
 * @param {ChatMessage[]} messages - Current messages array
 * @param {StreamEvent} event - Stream event to process
 * @returns {ChatMessage[]} New messages array
 */
export function applyChatStreamEvent(messages, event) {
  if (event.type === 'phase_message') {
    return upsertPhaseAssistantMessage(messages, event);
  }

  if (event.type === 'phase_status') {
    const statusMessage = normalizeStreamMessage(
      event.message,
      'Phase status update.',
      {
        id: buildPhaseSystemId('phase-status', event.requestId, event.phaseId, event.turn),
        requestId: event.requestId,
        phaseId: event.phaseId || null,
        phaseKind: event.phaseKind || null,
        role: 'system',
      },
    );
    return [...removeStreamingPlaceholders(messages, event.requestId), statusMessage];
  }

  if (event.type === 'phase_tool_start') {
    const toolText = `Sto eseguendo ${Array.isArray(event.tools) ? event.tools.join(', ') : 'gli strumenti richiesti'}.`;
    return [...removeStreamingPlaceholders(messages, event.requestId), createPhaseStatusMessage(event, toolText, 'phase-tool')];
  }

  if (event.type === 'phase_tool_complete') {
    const toolText = `I have completed ${Array.isArray(event.tools) ? event.tools.join(', ') : 'this step'}.`;
    return [...removeStreamingPlaceholders(messages, event.requestId), createPhaseStatusMessage(event, toolText, 'phase-tool-done')];
  }

  if (event.type === 'phase_tool_error') {
    return [
      ...removeStreamingPlaceholders(messages, event.requestId),
      createPhaseStatusMessage(event, `There was a tool error: ${event.errors || 'unknown error'}`, 'phase-tool-err'),
    ];
  }

  if (event.type === 'phase_completed' || event.type === 'phase_started') {
    return messages;
  }

  if (event.type === 'tool_start') {
    return [...messages, createToolStatusMessage(event, `Usando tool: ${event.tools.join(', ')} (turno ${event.turn})`, 'tool')];
  }

  if (event.type === 'tool_complete') {
    return [...messages, createToolStatusMessage(event, `Tool completati: ${event.tools.join(', ')}`, 'tool-done')];
  }

  if (event.type === 'tool_error') {
    return [...messages, createToolStatusMessage(event, `Tool error: ${event.errors}`, 'tool-err')];
  }

  if (event.type === 'message' || event.type === 'delta') {
    return appendStreamingDelta(messages, event);
  }

  if (event.type === 'complete' || event.type === 'completed') {
    return completeStreamingMessage(messages, event);
  }

  if (event.type === 'stopped') {
    return stopStreamingMessage(messages, event);
  }

  if (event.type === 'error') {
    const withoutStreaming = removeStreamingPlaceholders(messages, event.requestId);
    return [...withoutStreaming, normalizeStreamMessage(event.message, event.error || 'Request failed.', { requestId: event.requestId })];
  }

  if (event.type === 'system') {
    return [...messages, normalizeStreamMessage(event.message, 'System update.', { requestId: event.requestId })];
  }

  return messages;
}

