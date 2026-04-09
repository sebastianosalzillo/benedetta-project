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
  const documentElement = { appendChild: jest.fn(), insertBefore: jest.fn() };
  const documentHead = { appendChild: jest.fn(), insertBefore: jest.fn(), firstChild: null };
  const documentBody = { appendChild: jest.fn() };
  const setTimeout = jest.fn(() => 1);
  const clearTimeout = jest.fn();

  const window = {
    ...windowTarget,
    head,
    __nyxBridge: { notifyPlayback: jest.fn() },
  };

  const document = {
    head: documentHead,
    body: documentBody,
    documentElement,
    createElement: jest.fn(() => ({
      id: '',
      textContent: '',
      style: {},
      appendChild: jest.fn(),
      parentNode: null,
    })),
  };

  const context = vm.createContext({
    window,
    document,
    console: { log: jest.fn(), error: jest.fn() },
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

  return { context, window, document, setTimeout, clearTimeout };
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
});
