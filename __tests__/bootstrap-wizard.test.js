'use strict';

const { createDefaultBootstrapState, getState, startWizard, updateStateFromAgent, completeWizard } = require('../electron/bootstrap-wizard');

// Mock functions
const mockWriteJsonFile = jest.fn();
const mockRefreshWorkspaceState = jest.fn();
const mockBroadcastStatus = jest.fn();

describe('bootstrap-wizard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createDefaultBootstrapState', () => {
    test('returns default state', () => {
      const state = createDefaultBootstrapState();
      expect(state.active).toBe(false);
      expect(state.stepIndex).toBe(0);
      expect(state.currentPrompt).toBe('');
      expect(state.answers).toEqual({});
    });
  });

  describe('startWizard', () => {
    test('starts wizard with initial prompt', () => {
      const initialPrompt = 'Hello';
      startWizard(initialPrompt, () => 'default', mockRefreshWorkspaceState, mockBroadcastStatus, mockWriteJsonFile, '/tmp');

      const state = getState();
      expect(state.active).toBe(true);
      expect(state.currentPrompt).toBe('Hello');
      expect(state.stepIndex).toBe(1);
      expect(mockWriteJsonFile).toHaveBeenCalled();
      expect(mockRefreshWorkspaceState).toHaveBeenCalled();
      expect(mockBroadcastStatus).toHaveBeenCalled();
    });
  });

  describe('updateStateFromAgent', () => {
    test('parses JSON reasoning with answers', () => {
      startWizard('test', () => 'default', jest.fn(), jest.fn(), jest.fn(), '/tmp');

      const AgentResponse = {
        reasoning: JSON.stringify({
          answers: { name: 'Alice' },
          nextPrompt: 'Next question',
          stepIndex: 2,
        }),
      };

      updateStateFromAgent(AgentResponse, {
        writeJsonFile: mockWriteJsonFile,
        userDataDir: '/tmp',
        refreshWorkspaceState: mockRefreshWorkspaceState,
        broadcastStatus: mockBroadcastStatus,
      });

      const state = getState();
      expect(state.answers.name).toBe('Alice');
      expect(state.currentPrompt).toBe('Next question');
      expect(state.stepIndex).toBe(2);
      expect(mockWriteJsonFile).toHaveBeenCalled();
    });

    test('parses text reasoning with answers', () => {
      startWizard('test', () => 'default', jest.fn(), jest.fn(), jest.fn(), '/tmp');

      const AgentResponse = {
        reasoning: 'Answer name: Bob',
      };

      updateStateFromAgent(AgentResponse);

      const state = getState();
      expect(state.answers.name).toBe('Bob');
    });
  });

  describe('completeWizard', () => {
    test('completes wizard', () => {
      startWizard('test', () => 'default', jest.fn(), jest.fn(), jest.fn(), '/tmp');

      completeWizard(() => '/tmp/state.json', mockWriteJsonFile, mockRefreshWorkspaceState, mockBroadcastStatus);

      const state = getState();
      expect(state.active).toBe(false);
      expect(state.currentPrompt).toBe('');
      expect(mockWriteJsonFile).toHaveBeenCalled();
    });
  });
});
