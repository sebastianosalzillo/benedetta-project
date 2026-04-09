const {
  applyChatStreamEvent,
  removeStreamingPlaceholders,
  upsertPhaseAssistantMessage,
} = require('../src/chat-stream-state.cjs');

describe('chat-stream-state', () => {
  test('removeStreamingPlaceholders removes only matching streaming request messages', () => {
    const messages = [
      { id: '1', requestId: 'req-1', streaming: true },
      { id: '2', requestId: 'req-1', streaming: false },
      { id: '3', requestId: 'req-2', streaming: true },
    ];

    expect(removeStreamingPlaceholders(messages, 'req-1')).toEqual([
      { id: '2', requestId: 'req-1', streaming: false },
      { id: '3', requestId: 'req-2', streaming: true },
    ]);
  });

  test('upsertPhaseAssistantMessage replaces existing phase message and clears placeholder', () => {
    const messages = [
      { id: 'stream-req-1', requestId: 'req-1', streaming: true, text: 'partial' },
      { id: 'phase-req-1-plan', requestId: 'req-1', phaseId: 'plan', role: 'assistant', text: 'old' },
    ];

    const updated = upsertPhaseAssistantMessage(messages, {
      type: 'phase_message',
      requestId: 'req-1',
      phaseId: 'plan',
      phaseKind: 'planning',
      message: { text: 'new' },
    });

    expect(updated).toEqual([
      {
        id: 'phase-req-1-plan',
        requestId: 'req-1',
        phaseId: 'plan',
        phaseKind: 'planning',
        role: 'assistant',
        streaming: false,
        text: 'new',
      },
    ]);
  });

  test('applyChatStreamEvent appends and completes streaming assistant messages', () => {
    const withDelta = applyChatStreamEvent([], {
      type: 'delta',
      requestId: 'req-2',
      text: 'ciao',
    });

    expect(withDelta).toEqual([
      {
        id: 'stream-req-2',
        requestId: 'req-2',
        role: 'assistant',
        text: 'ciao',
        streaming: true,
      },
    ]);

    const completed = applyChatStreamEvent(withDelta, {
      type: 'completed',
      requestId: 'req-2',
      message: { id: 'final-req-2', text: 'ciao mondo' },
    });

    expect(completed).toEqual([
      {
        id: 'final-req-2',
        requestId: 'req-2',
        role: 'assistant',
        text: 'ciao mondo',
        streaming: false,
      },
    ]);
  });
});
