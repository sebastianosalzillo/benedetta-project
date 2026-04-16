const fs = require('fs');
const path = require('path');
const vm = require('vm');

function createEventTarget() {
  const listeners = new Map();

  return {
    addEventListener: jest.fn((type, handler) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(handler);
    }),
    removeEventListener: jest.fn((type, handler) => {
      if (listeners.has(type)) listeners.get(type).delete(handler);
    }),
    dispatchEvent: jest.fn((event) => {
      const handlers = listeners.get(event.type);
      if (!handlers) return true;
      handlers.forEach((handler) => handler(event));
      return true;
    }),
  };
}

function createSandbox(head) {
  const windowTarget = createEventTarget();
  const elementsById = new Map();

  function createElement(tagName = 'div') {
    const children = [];
    const classNames = new Set();
    const el = {
      _id: '',
      tagName: String(tagName).toUpperCase(),
      textContent: '',
      innerHTML: '',
      style: {},
      children,
      parentNode: null,
      appendChild: jest.fn((child) => {
        child.parentNode = el;
        children.push(child);
        if (child.id) elementsById.set(child.id, child);
        return child;
      }),
      removeChild: jest.fn((child) => {
        const index = children.indexOf(child);
        if (index !== -1) children.splice(index, 1);
        if (child.id) elementsById.delete(child.id);
        child.parentNode = null;
        return child;
      }),
      insertBefore: jest.fn((child) => {
        child.parentNode = el;
        children.unshift(child);
        if (child.id) elementsById.set(child.id, child);
        return child;
      }),
      querySelector: jest.fn((selector) => {
        const target = String(selector).toUpperCase();
        return children.find((child) => child.tagName === target) || null;
      }),
      classList: {
        add: jest.fn((name) => classNames.add(name)),
        remove: jest.fn((name) => classNames.delete(name)),
        contains: jest.fn((name) => classNames.has(name)),
      },
    };
    Object.defineProperty(el, 'id', {
      get: () => el._id,
      set: (value) => {
        if (el._id) elementsById.delete(el._id);
        el._id = value;
        if (value) elementsById.set(value, el);
      },
    });
    return el;
  }

  const documentElement = createElement('html');
  const documentHead = createElement('head');
  documentHead.firstChild = null;
  const documentBody = createElement('body');
  const setTimeout = jest.fn(() => 1);
  const clearTimeout = jest.fn();

  const window = {
    ...windowTarget,
    head,
    __nyxBridge: { notifyPlayback: jest.fn() },
    atob: (value) => Buffer.from(value, 'base64').toString('binary'),
  };

  const document = {
    head: documentHead,
    body: documentBody,
    documentElement,
    createElement: jest.fn(createElement),
    getElementById: jest.fn((id) => elementsById.get(id) || null),
  };

  const context = vm.createContext({
    window,
    document,
    console: { log: jest.fn(), error: jest.fn(), warn: jest.fn() },
    setTimeout,
    clearTimeout,
    requestAnimationFrame: (cb) => cb(),
    atob: (value) => Buffer.from(value, 'base64').toString('binary'),
    Uint8Array,
    Math,
    isFinite,
    CustomEvent: class CustomEvent {
      constructor(type, init = {}) {
        this.type = type;
        this.detail = init.detail;
      }
    },
  });

  window.window = window;
  window.document = document;

  return { context, window, document, setTimeout, clearTimeout, elementsById };
}

describe('avatar-page-handler', () => {
  const script = fs.readFileSync(path.join(__dirname, '..', 'electron', 'avatar-page-handler.js'), 'utf8');

  test('keeps retrying only until window.head exists', () => {
    const sandbox = createSandbox(null);

    vm.runInContext(script, sandbox.context);

    expect(sandbox.setTimeout).toHaveBeenCalledTimes(1);
    expect(sandbox.setTimeout.mock.calls[0][1]).toBe(200);
  });

  test('waits for avatar-ready event instead of polling while armature is loading', () => {
    const setScalar = jest.fn();
    const positionSet = jest.fn();
    const targetSet = jest.fn();
    const update = jest.fn();
    const head = {
      camera: { position: { set: positionSet } },
      controls: { target: { set: targetSet }, update, enabled: true },
      armature: null,
      avatarHeight: 10,
    };

    const sandbox = createSandbox(head);

    vm.runInContext(script, sandbox.context);

    expect(sandbox.setTimeout).not.toHaveBeenCalled();

    sandbox.window.head.armature = {
      scale: { x: 1, setScalar },
    };

    sandbox.window.dispatchEvent(new sandbox.context.CustomEvent('nyx:avatar-ready'));

    expect(setScalar).toHaveBeenCalledWith(0.8);
    expect(positionSet).toHaveBeenCalled();
    expect(targetSet).toHaveBeenCalled();
    expect(update).toHaveBeenCalled();
    expect(sandbox.window.head.avatarHeight).toBe(8);
    expect(sandbox.window.head.controls.enabled).toBe(false);
    expect(sandbox.window.removeEventListener).toHaveBeenCalledWith('nyx:avatar-ready', expect.any(Function));
  });

  test('renders speech bubble and response popup on speak commands', async () => {
    const decodedAudio = { duration: 0.1 };
    const head = {
      camera: { position: { set: jest.fn() } },
      controls: { target: { set: jest.fn() }, update: jest.fn(), enabled: true },
      armature: { scale: { x: 1, setScalar: jest.fn() } },
      audioCtx: {
        state: 'running',
        decodeAudioData: jest.fn(() => Promise.resolve(decodedAudio)),
      },
      avatarHeight: 10,
      stopSpeaking: jest.fn(),
      setMood: jest.fn(),
      speakAudio: jest.fn(),
    };

    const sandbox = createSandbox(head);
    vm.runInContext(script, sandbox.context);

    sandbox.window.dispatchEvent(new sandbox.context.CustomEvent('__nyx_cmd__', {
      detail: {
        cmd: 'speak',
        text: 'Ciao',
        audioBase64: Buffer.from('audio').toString('base64'),
        requestId: 'req-1',
        segmentId: 'seg-1',
        expectedDurationMs: 1200,
      },
    }));

    await Promise.resolve();

    // speak uses speech bubble (side, head height), not the status bubble
    const speechBubble = sandbox.document.getElementById('nyx-speech-bubble');
    const popup = sandbox.document.getElementById('nyx-response-popup');

    expect(speechBubble).toBeTruthy();
    expect(speechBubble.textContent).toBe('Ciao');
    expect(speechBubble.classList.add).toHaveBeenCalledWith('nyxb-visible');
    // status bubble must NOT appear on speak
    expect(sandbox.document.getElementById('nyx-status-bubble')).toBeNull();
    expect(popup).toBeTruthy();
    expect(popup.classList.add).toHaveBeenCalledWith('nyxb-visible');
    expect(popup.children[0].textContent).toBe('Ciao');
    expect(head.speakAudio).toHaveBeenCalled();
  });
});
