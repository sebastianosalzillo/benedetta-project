import React, { useEffect, useMemo, useState } from 'react';
import NyxAvatar from './components/NyxAvatar';
import AvatarChat from './components/AvatarChat';
import CanvasWorkspace from './components/CanvasWorkspace';
import SettingsPanel from './components/SettingsPanel';
import { applyChatStreamEvent, createSystemMessage } from './chat-stream-state.js';

function getScreen() {
  const params = new URLSearchParams(window.location.search);
  return params.get('screen') || 'chat';
}

function formatRelativeDreamTime(value) {
  if (!value) return 'mai';
  const deltaMs = Math.max(0, Date.now() - new Date(value).getTime());
  const totalSeconds = Math.floor(deltaMs / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s fa`;
  const totalMinutes = Math.floor(totalSeconds / 60);
  if (totalMinutes < 60) return `${totalMinutes}m fa`;
  const totalHours = Math.floor(totalMinutes / 60);
  return `${totalHours}h fa`;
}

function formatCountdown(ms) {
  const safeMs = Math.max(0, Number(ms) || 0);
  const totalSeconds = Math.ceil(safeMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
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
  userSettings: {
    name: '',
    preferredName: '',
    timezone: 'Europe/Rome',
    privacy: '',
    avatarName: 'Nyx',
    toneStyle: 'pragmatic',
    voiceStyle: 'neutral',
    boundaries: '',
    role: '',
    focusContext: '',
  },
  brain: {
    selectedId: 'opencode',
    selectedLabel: 'OpenCode Zen',
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
  dream: {
    isActive: false,
    lastInteractionAt: null,
    lastDreamAt: null,
    dreamCount: 0,
    idleTimeoutMs: 0,
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

const STATUS_LABELS = {
  thinking: 'Thinking',
  'tts-loading': 'TTS loading',
  speaking: 'Speaking',
  error: 'Error',
};

const STREAM_LABELS = {
  connected: 'Stream connected',
  wait: 'Stream wait',
  streaming: 'Stream live',
  speaking: 'Stream speaking',
  timeout: 'Stream timeout',
  error: 'Stream error',
};

function App() {
  const [activePanel, setActivePanel] = useState('chat');
  const [brainTest, setBrainTest] = useState(null);
  const [brainTestPending, setBrainTestPending] = useState(false);
  const [debugLogs, setDebugLogs] = useState([]);
  const [messages, setMessages] = useState([]);
  const [canvasState, setCanvasState] = useState({
    isOpen: false,
    layout: 'right-docked',
    content: { type: 'empty', title: 'Canvas', value: '' },
  });
  const [appState, setAppState] = useState(DEFAULT_APP_STATE);
  const [dreamNow, setDreamNow] = useState(Date.now());
  const screen = useMemo(getScreen, []);

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
        setMessages((current) => applyChatStreamEvent(current, event));
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

  useEffect(() => {
    const timerId = window.setInterval(() => {
      setDreamNow(Date.now());
    }, 1000);
    return () => window.clearInterval(timerId);
  }, []);

  const statusLabel = useMemo(() => {
    return STATUS_LABELS[appState.status] || 'Idle';
  }, [appState.status]);

  const streamLabel = useMemo(() => {
    return STREAM_LABELS[appState.streamStatus] || 'Stream disconnected';
  }, [appState.streamStatus]);

  const dreamLabel = useMemo(() => {
    if (appState.dream?.isActive) return 'Dream attiva';
    if (appState.dream?.lastDreamAt) return `Dream ${appState.dream.dreamCount || 0}`;
    return 'Dream in attesa';
  }, [appState.dream]);

  const dreamCountdownLabel = useMemo(() => {
    if (appState.dream?.isActive) return 'ora';
    const idleTimeoutMs = Number(appState.dream?.idleTimeoutMs || 0);
    if (!idleTimeoutMs) return '--:--';
    const lastInteractionAt = appState.dream?.lastInteractionAt
      ? new Date(appState.dream.lastInteractionAt).getTime()
      : dreamNow;
    const remainingMs = Math.max(0, (lastInteractionAt + idleTimeoutMs) - dreamNow);
    return formatCountdown(remainingMs);
  }, [appState.dream, dreamNow]);

  const dreamLastRunLabel = useMemo(() => formatRelativeDreamTime(appState.dream?.lastDreamAt), [appState.dream?.lastDreamAt, dreamNow]);

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

  async function handleSaveUserSettings(settings) {
    const result = await window.electronAPI?.saveUserSettings?.(settings);
    if (!result?.ok) {
      setMessages((current) => [...current, createSystemMessage(result?.error || 'Unable to save user settings.')]);
      return;
    }
    setAppState((current) => ({
      ...current,
      userSettings: { ...current.userSettings, ...settings },
    }));
  }

  async function handleSaveSoulSettings(settings) {
    const result = await window.electronAPI?.saveSoulSettings?.(settings);
    if (!result?.ok) {
      setMessages((current) => [...current, createSystemMessage(result?.error || 'Unable to save soul settings.')]);
      return;
    }
    setAppState((current) => ({
      ...current,
      userSettings: { ...current.userSettings, ...settings },
    }));
  }

  async function handleSaveIdentitySettings(settings) {
    const result = await window.electronAPI?.saveIdentitySettings?.(settings);
    if (!result?.ok) {
      setMessages((current) => [...current, createSystemMessage(result?.error || 'Unable to save identity settings.')]);
      return;
    }
    setAppState((current) => ({
      ...current,
      userSettings: { ...current.userSettings, ...settings },
    }));
  }

  async function handleRefreshDebugLogs() {
    const logs = await window.electronAPI?.getDebugLogs?.();
    setDebugLogs(logs || []);
  }

  async function handleClearDebugLogs() {
    await window.electronAPI?.clearDebugLogs?.();
    setDebugLogs([]);
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
        <div className="avatar-drag-handle" title="Drag to move the window">
          <div className="avatar-drag-pill">{statusLabel}</div>
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

      <div className="hud-panel" aria-label="Nyx chat workspace">
        <div className="hud-header">
          <div>
            <div className="eyebrow">Nyx · Avatar Desktop</div>
            <h1>{appState.brain?.selectedLabel || 'Nyx'}</h1>
          </div>
          <div
            className={`status-pill status-${appState.status}`}
            role="status"
            aria-live="polite"
            aria-label={`Stato avatar: ${statusLabel}`}
          >
            {statusLabel}
          </div>
        </div>

        <div className="hud-meta" aria-label="Stato sessione">
          <span aria-label={`Modalità corrente ${appState.mode}`}>{appState.mode}</span>
          <span aria-label={`Stato stream ${streamLabel}`}>{streamLabel}</span>
          <span aria-label={dreamLabel}>{dreamLabel}</span>
          <span aria-label={`Prossimo dream tra ${dreamCountdownLabel}`}>Next dream {dreamCountdownLabel}</span>
          <span aria-label={`Ultimo dream ${dreamLastRunLabel}`}>Ultimo dream {dreamLastRunLabel}</span>
          <span aria-label={`Provider text to speech ${appState.ttsProvider || 'Kokoro'}`}>TTS {appState.ttsProvider || 'Kokoro'}</span>
          {appState.ttsLatencyMs != null && <span aria-label={`Latenza text to speech ${appState.ttsLatencyMs} millisecondi`}>{appState.ttsLatencyMs}ms</span>}
        </div>

        {activePanel === 'settings' ? (
          <div key="settings" className="settings-enter">
            <SettingsPanel
              brain={appState.brain}
              onBack={() => setActivePanel('chat')}
              onSelectBrain={handleSelectBrain}
              onSaveOllama={handleSaveOllama}
              onTestBrain={handleTestBrain}
              testResult={brainTest}
              testPending={brainTestPending}
              isBusy={Boolean(appState.activeRequestId)}
              userSettings={appState.userSettings}
              onSaveUserSettings={handleSaveUserSettings}
              onSaveSoulSettings={handleSaveSoulSettings}
              onSaveIdentitySettings={handleSaveIdentitySettings}
              debugLogs={debugLogs}
              onRefreshDebugLogs={handleRefreshDebugLogs}
              onClearDebugLogs={handleClearDebugLogs}
            />
          </div>
        ) : (
          <div key="chat" className="chat-enter" style={{ display: 'contents' }}>
            <AvatarChat
              messages={messages}
              onSend={handleSend}
              onStop={handleStop}
              onOpenWorkspace={handleOpenWorkspace}
              onCompleteBootstrap={handleCompleteBootstrap}
              onOpenSettings={() => setActivePanel('settings')}
              canStop={Boolean(appState.activeRequestId)}
              isBusy={appState.status === 'thinking' || appState.streamStatus === 'wait' || appState.streamStatus === 'streaming'}
              isThinking={appState.status === 'thinking'}
              streamStatus={appState.streamStatus}
              ttsStatus={appState.ttsStatus}
              ttsLatencyMs={appState.ttsLatencyMs}
              ttsLastError={appState.ttsLastError}
              workspace={appState.workspace}
              windowPrefs={appState.windowPrefs}
              onToggleAlwaysOnTop={handleToggleAlwaysOnTop}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
