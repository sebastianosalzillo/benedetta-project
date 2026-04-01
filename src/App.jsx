import React, { useEffect, useMemo, useState } from 'react';
import NyxAvatar from './components/NyxAvatar';
import AvatarChat from './components/AvatarChat';
import CanvasWorkspace from './components/CanvasWorkspace';
import SettingsPanel from './components/SettingsPanel';

function getScreen() {
  const params = new URLSearchParams(window.location.search);
  return params.get('screen') || 'chat';
}

function createSystemMessage(text) {
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

const DEFAULT_APP_STATE = {
  status: 'idle',
  mode: 'booting',
  streamStatus: 'disconnected',
  activeRequestId: null,
  ttsProvider: 'Kokoro (if_sara)',
  ttsStatus: 'idle',
  ttsLatencyMs: null,
  ttsLastError: null,
  brain: {
    selectedId: 'qwen',
    selectedLabel: 'Qwen',
    options: [],
    sourcePath: '',
    modelsPath: '',
    ollama: {
      host: 'http://127.0.0.1:11434',
      model: 'llama3.1',
    },
  },
  windowPrefs: {
    avatarAlwaysOnTop: true,
    chatAlwaysOnTop: true,
  },
  browserAgent: {
    active: false,
    requestId: null,
    goal: '',
    phase: 'idle',
    stepIndex: 0,
    maxSteps: null,
    action: '',
    chosenRef: '',
    reason: '',
    lastMessage: '',
    currentUrl: '',
    pageTitle: '',
    pageStatus: 'idle',
    totalRefs: 0,
    updatedAt: null,
  },
  computer: {
    supported: false,
    active: false,
    phase: 'idle',
    requestId: null,
    currentAction: '',
    updatedAt: null,
    width: 0,
    height: 0,
    cursorX: 0,
    cursorY: 0,
    foregroundTitle: '',
    foregroundProcess: '',
    foregroundBounds: null,
    foregroundHandle: null,
    windows: [],
    interactiveElements: [],
    lastAction: '',
    lastResult: '',
    lastScreenshotPath: '',
    lastScreenshotText: '',
    lastReadSource: '',
    desktopBackend: 'native',
    ocrStatus: 'idle',
    error: '',
  },
  workspace: {
    path: '',
    dailyMemoryPath: '',
    memoryFile: '',
    bootstrapPending: false,
    bootstrapActive: false,
    bootstrapStepIndex: 0,
    bootstrapTotalSteps: 0,
    bootstrapQuestion: '',
    bootConfigured: false,
    startupBootPending: false,
    files: [],
    missingRequiredFiles: [],
    dailyNotes: [],
    updatedAt: null,
  },
};

function App() {
  const [activePanel, setActivePanel] = useState('chat');
  const [brainTest, setBrainTest] = useState(null);
  const [brainTestPending, setBrainTestPending] = useState(false);
  const [messages, setMessages] = useState([]);
  const [canvasState, setCanvasState] = useState({
    isOpen: false,
    layout: 'right-docked',
    content: { type: 'empty', title: 'Canvas', value: '' },
  });
  const [appState, setAppState] = useState(DEFAULT_APP_STATE);
  const screen = useMemo(() => getScreen(), []);

  useEffect(() => {
    let unsubscribeStatus;
    let unsubscribeStream;
    let unsubscribeCanvas;

    async function boot() {
      if (window.electronAPI?.getAppState) {
        const state = await window.electronAPI.getAppState();
        setAppState((current) => ({ ...current, ...state }));
      }

      if (window.electronAPI?.getChatHistory && screen === 'chat') {
        const history = await window.electronAPI.getChatHistory();
        if (history?.ok) {
          setMessages(history.messages || []);
        }
      }

      if (window.electronAPI?.getCanvasState && screen === 'canvas') {
        const state = await window.electronAPI.getCanvasState();
        if (state?.ok) {
          setCanvasState(state.state);
        }
      }
    }

    boot();

    if (window.electronAPI?.onAvatarStatus) {
      unsubscribeStatus = window.electronAPI.onAvatarStatus((payload) => {
        setAppState((current) => ({
          ...current,
          ...payload,
        }));
      });
    }

    if (window.electronAPI?.onChatStream && screen === 'chat') {
      unsubscribeStream = window.electronAPI.onChatStream((event) => {
        setMessages((current) => {
          if (event.type === 'tool_start') {
            const toolText = `\u{1F527} Usando tool: ${event.tools.join(', ')} (turno ${event.turn})`;
            return [...current, { id: `tool-${event.requestId}-${event.turn}`, requestId: event.requestId, role: 'system', text: toolText, ts: new Date().toISOString() }];
          }
          if (event.type === 'tool_complete') {
            const toolText = `\u{2705} Tool completati: ${event.tools.join(', ')}`;
            return [...current, { id: `tool-done-${event.requestId}-${event.turn}`, requestId: event.requestId, role: 'system', text: toolText, ts: new Date().toISOString() }];
          }
          if (event.type === 'tool_error') {
            return [...current, { id: `tool-err-${event.requestId}-${event.turn}`, requestId: event.requestId, role: 'system', text: `\u{274C} Errore tool: ${event.errors}`, ts: new Date().toISOString() }];
          }
          if (event.type === 'message' || event.type === 'delta') {
            const hasPlaceholder = current.some((message) => message.requestId === event.requestId && message.streaming);
            if (!hasPlaceholder) {
              return [
                ...current,
                {
                  id: `stream-${event.requestId}`,
                  requestId: event.requestId,
                  role: 'assistant',
                  text: event.text,
                  streaming: true,
                },
              ];
            }

            return current.map((message) => {
              if (message.requestId !== event.requestId || !message.streaming) return message;
              return {
                ...message,
                text: `${message.text}${event.text}`,
              };
            });
          }

          if (event.type === 'complete' || event.type === 'completed') {
            const hasPlaceholder = current.some((message) => message.requestId === event.requestId && message.streaming);
            const nextMessage = normalizeStreamMessage(event.message, 'Response completed.', {
              requestId: event.requestId,
              role: 'assistant',
              streaming: false,
            });
            if (!hasPlaceholder) {
              return [...current, nextMessage];
            }

            return current.map((message) => {
              if (message.requestId !== event.requestId || !message.streaming) return message;
              return nextMessage;
            });
          }

          if (event.type === 'stopped') {
            const updated = current.map((message) => {
              if (message.requestId !== event.requestId || !message.streaming) return message;
              return {
                ...message,
                streaming: false,
                interrupted: true,
              };
            });
            return [...updated, normalizeStreamMessage(event.message, 'Request stopped.', { requestId: event.requestId })];
          }

          if (event.type === 'error') {
            const withoutStreaming = current.filter((message) => !(message.requestId === event.requestId && message.streaming));
            return [...withoutStreaming, normalizeStreamMessage(event.message, event.error || 'Request failed.', { requestId: event.requestId })];
          }

          if (event.type === 'system') {
            return [...current, normalizeStreamMessage(event.message, 'System update.', { requestId: event.requestId })];
          }

          return current;
        });
      });
    }

    if (window.electronAPI?.onCanvasState && screen === 'canvas') {
      unsubscribeCanvas = window.electronAPI.onCanvasState((payload) => {
        setCanvasState(payload);
      });
    }

    return () => {
      if (typeof unsubscribeStatus === 'function') {
        unsubscribeStatus();
      }
      if (typeof unsubscribeStream === 'function') {
        unsubscribeStream();
      }
      if (typeof unsubscribeCanvas === 'function') {
        unsubscribeCanvas();
      }
    };
  }, [screen]);

  const statusLabel = useMemo(() => {
    if (appState.status === 'thinking') return 'Thinking';
    if (appState.status === 'tts-loading') return 'TTS loading';
    if (appState.status === 'speaking') return 'Speaking';
    if (appState.status === 'error') return 'Error';
    return 'Idle';
  }, [appState.status]);

  const streamLabel = useMemo(() => {
    if (appState.streamStatus === 'connected') return 'Stream connected';
    if (appState.streamStatus === 'wait') return 'Stream wait';
    if (appState.streamStatus === 'streaming') return 'Stream live';
    if (appState.streamStatus === 'speaking') return 'Stream speaking';
    if (appState.streamStatus === 'timeout') return 'Stream timeout';
    if (appState.streamStatus === 'error') return 'Stream error';
    return 'Stream disconnected';
  }, [appState.streamStatus]);

  async function handleSend(text) {
    const result = await window.electronAPI.sendChatMessage(text);
    if (!result?.ok) {
      setMessages((current) => [...current, createSystemMessage(result?.error || 'Request failed.')]);
      return;
    }

    const nextMessages = result.messages || (result.message ? [result.message] : []);

    setMessages((current) => {
      if (result.replaceHistory) {
        return nextMessages;
      }

      const updated = [...current, ...nextMessages];
      if (!result.requestId) {
        return updated;
      }

      return [
        ...updated,
        {
          id: `stream-${result.requestId}`,
          requestId: result.requestId,
          role: 'assistant',
          text: '',
          streaming: true,
        },
      ];
    });
  }

  async function handleStop() {
    const result = await window.electronAPI.stopChatMessage();
    if (!result?.ok) {
      setMessages((current) => [...current, createSystemMessage(result?.error || 'Nothing to stop.')]);
    }
  }

  async function handleToggleAlwaysOnTop(target) {
    const nextValue = !appState.windowPrefs[`${target}AlwaysOnTop`];
    const result = await window.electronAPI.setWindowAlwaysOnTop(target, nextValue);
    if (result?.ok) {
      setAppState((current) => ({
        ...current,
        windowPrefs: result.windowPrefs,
      }));
    }
  }

  async function handleCanvasClose() {
    await window.electronAPI?.closeCanvas?.();
  }

  async function handleOpenWorkspace() {
    const result = await window.electronAPI?.openWorkspaceFolder?.();
    if (!result?.ok) {
      setMessages((current) => [...current, createSystemMessage(result?.error || 'Unable to open workspace.')]);
      return;
    }

    setMessages((current) => [...current, createSystemMessage(result.message || 'Workspace opened.')]);
    if (result.workspace) {
      setAppState((current) => ({
        ...current,
        workspace: result.workspace,
      }));
    }
  }

  async function handleCompleteBootstrap() {
    const result = await window.electronAPI?.completeWorkspaceBootstrap?.();
    if (!result?.ok) {
      setMessages((current) => [...current, createSystemMessage(result?.error || 'Unable to complete bootstrap.')]);
      return;
    }

    setMessages((current) => [...current, createSystemMessage(result.message || 'Bootstrap completed.')]);
    if (result.workspace) {
      setAppState((current) => ({
        ...current,
        workspace: result.workspace,
      }));
    }
  }

  async function handleCanvasLayoutChange(layout) {
    await window.electronAPI?.setCanvasLayout?.(layout);
  }

  async function handleSelectBrain(brainId) {
    const result = await window.electronAPI?.setSelectedBrain?.(brainId);
    if (!result?.ok) {
      setMessages((current) => [...current, createSystemMessage(result?.error || 'Unable to switch brain.')]);
      return;
    }

    if (result.brain) {
      setAppState((current) => ({
        ...current,
        brain: {
          ...current.brain,
          ...result.brain,
          selectedLabel: (result.brain.options || []).find((item) => item.id === result.brain.selectedId)?.label || current.brain.selectedLabel,
        },
      }));
    }

    const selected = (result.brain?.options || []).find((item) => item.id === result.brain?.selectedId);
    setMessages((current) => [
      ...current,
      createSystemMessage(`Brain attivo: ${selected?.label || brainId}`),
    ]);
  }

  async function handleSaveOllama(config) {
    const result = await window.electronAPI?.setOllamaConfig?.(config);
    if (!result?.ok) {
      setMessages((current) => [...current, createSystemMessage(result?.error || 'Unable to save Ollama config.')]);
      return;
    }

    if (result.brain) {
      setAppState((current) => ({
        ...current,
        brain: {
          ...current.brain,
          ...result.brain,
        },
      }));
    }

    setMessages((current) => [
      ...current,
      createSystemMessage(`Config Ollama salvata: ${result.brain?.ollama?.model || config.model} @ ${result.brain?.ollama?.host || config.host}`),
    ]);
  }

  async function handleTestBrain(brainId) {
    setBrainTestPending(true);
    try {
      const result = await window.electronAPI?.testBrain?.(brainId);
      setBrainTest(result || { ok: false, brainId, message: 'Test brain fallito.' });
    } finally {
      setBrainTestPending(false);
    }
  }

  if (screen === 'avatar') {
    return (
      <div className="avatar-screen">
        <div className="avatar-drag-handle">
          <div className="avatar-drag-pill">drag avatar</div>
        </div>
        <NyxAvatar />
      </div>
    );
  }

  if (screen === 'canvas') {
    return (
      <div className="app-shell canvas-screen">
        <CanvasWorkspace
          canvasState={canvasState}
          onClose={handleCanvasClose}
          onLayoutChange={handleCanvasLayoutChange}
        />
      </div>
    );
  }

  return (
    <div className="app-shell chat-screen">
      <div className="app-backdrop" />

      <div className="hud-panel">
        <div className="hud-header">
          <div>
            <div className="eyebrow">Avatar ACP Desktop</div>
            <h1>NyxAvatar Runtime V1</h1>
          </div>
          <div className={`status-pill status-${appState.status}`}>{statusLabel}</div>
        </div>

        <div className="hud-meta">
          <span>Mode: {appState.mode}</span>
          <span>{streamLabel}</span>
          <span>Stack: NyxAvatar + {appState.ttsProvider}</span>
          <span>Brain: {appState.brain?.selectedLabel || 'ACP direct'}</span>
        </div>

        {activePanel === 'settings' ? (
          <SettingsPanel
            brain={appState.brain}
            onBack={() => setActivePanel('chat')}
            onSelectBrain={handleSelectBrain}
            onSaveOllama={handleSaveOllama}
            onTestBrain={handleTestBrain}
            testResult={brainTest}
            testPending={brainTestPending}
            isBusy={Boolean(appState.activeRequestId)}
          />
        ) : (
          <AvatarChat
            messages={messages}
            onSend={handleSend}
            onStop={handleStop}
            onOpenWorkspace={handleOpenWorkspace}
            onCompleteBootstrap={handleCompleteBootstrap}
            onOpenSettings={() => setActivePanel('settings')}
            canStop={Boolean(appState.activeRequestId)}
            isBusy={appState.status === 'thinking' || appState.streamStatus === 'wait' || appState.streamStatus === 'streaming'}
            streamStatus={appState.streamStatus}
            ttsStatus={appState.ttsStatus}
            ttsLatencyMs={appState.ttsLatencyMs}
            ttsLastError={appState.ttsLastError}
            workspace={appState.workspace}
            windowPrefs={appState.windowPrefs}
            onToggleAlwaysOnTop={handleToggleAlwaysOnTop}
          />
        )}
      </div>
    </div>
  );
}

export default App;
