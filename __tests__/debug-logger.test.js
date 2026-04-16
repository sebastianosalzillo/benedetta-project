'use strict';

const fs = require('fs');
const { logModelOutput, getRecentDebugLogs, clearDebugLogs } = require('../electron/debug-logger');

describe('debug-logger', () => {
  beforeEach(() => {
    // Clear any existing logs
    clearDebugLogs();
  });

  test('logs model output', () => {
    logModelOutput('raw output', 'normalized', 'req-1');
    const logs = getRecentDebugLogs();
    expect(logs.length).toBe(1);
    expect(logs[0].eventType).toBe('model_output');
    expect(logs[0].data.raw).toBe('raw output');
    expect(logs[0].data.normalized).toBe('normalized');
  });

  test('returns recent logs', () => {
    logModelOutput('test1', 'norm1', 'req-1');
    logModelOutput('test2', 'norm2', 'req-2');
    const logs = getRecentDebugLogs(1);
    expect(logs.length).toBe(1);
    expect(logs[0].data.raw).toBe('test2');
  });

  test('clears logs', () => {
    logModelOutput('test', 'norm', 'req-1');
    clearDebugLogs();
    const logs = getRecentDebugLogs();
    expect(logs.length).toBe(0);
  });
});
