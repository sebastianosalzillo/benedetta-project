/**
 * Quick smoke test for the new agent/tools modules.
 * Run: node electron/agent/smoke-test.js
 */

const path = require('path');

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    return true;
  } catch (err) {
    console.error(`  ✗ ${name}: ${err.message}`);
    return false;
  }
}

let passed = 0;
let failed = 0;

function check(name, fn) {
  if (test(name, fn)) passed++;
  else failed++;
}

console.log('\n=== Agent Module Smoke Tests ===\n');

// Test types.js
const { AgentEventType } = require('./types');
check('AgentEventType exported', () => {
  if (AgentEventType.AGENT_START !== 'agent_start') throw new Error('Wrong value');
});

// Test message-types.js
const msg = require('./message-types');
check('userMessage creates correct structure', () => {
  const m = msg.userMessage('Hello');
  if (m.role !== 'user') throw new Error('Wrong role');
  if (m.text !== 'Hello') throw new Error('Wrong text');
  if (!m.id) throw new Error('Missing id');
  if (!m.timestamp) throw new Error('Missing timestamp');
});

check('assistantMessage creates correct structure', () => {
  const m = msg.assistantMessage('Hi there', { stopReason: 'stop' });
  if (m.role !== 'assistant') throw new Error('Wrong role');
  if (m.text !== 'Hi there') throw new Error('Wrong text');
  if (m.stopReason !== 'stop') throw new Error('Wrong stopReason');
});

check('toolResultMessage creates correct structure', () => {
  const m = msg.toolResultMessage('tc-1', 'shell', 'Output here', { isError: false });
  if (m.role !== 'tool_result') throw new Error('Wrong role');
  if (m.toolCallId !== 'tc-1') throw new Error('Wrong toolCallId');
  if (m.toolName !== 'shell') throw new Error('Wrong toolName');
  if (m.content !== 'Output here') throw new Error('Wrong content');
});

check('errorToolResult creates error result', () => {
  const r = msg.errorToolResult('Something went wrong');
  if (!r.isError) throw new Error('Should be error');
  if (r.content !== 'Something went wrong') throw new Error('Wrong content');
});

check('isLlmVisible filters correctly', () => {
  if (!msg.isLlmVisible({ role: 'user' })) throw new Error('user should be visible');
  if (!msg.isLlmVisible({ role: 'assistant' })) throw new Error('assistant should be visible');
  if (!msg.isLlmVisible({ role: 'tool_result' })) throw new Error('tool_result should be visible');
  if (msg.isLlmVisible({ role: 'custom' })) throw new Error('custom should NOT be visible');
  if (msg.isLlmVisible({ role: 'system' })) throw new Error('system should NOT be visible');
});

check('filterLlmMessages filters correctly', () => {
  const msgs = [
    { role: 'user' },
    { role: 'custom' },
    { role: 'assistant' },
    { role: 'system' },
    { role: 'tool_result' },
  ];
  const filtered = msg.filterLlmMessages(msgs);
  if (filtered.length !== 3) throw new Error(`Expected 3, got ${filtered.length}`);
});

// Test tool-registry.js
const { ToolRegistry, validateToolDefinition } = require('./tool-registry');
check('ToolRegistry instantiation', () => {
  const reg = new ToolRegistry();
  if (reg.size !== 0) throw new Error('Should be empty');
});

check('ToolRegistry register and get', () => {
  const reg = new ToolRegistry();
  reg.register({
    name: 'test_tool',
    label: 'Test Tool',
    description: 'A test tool',
    parameters: { type: 'object', properties: {} },
    execute: async () => ({ content: 'ok' }),
  });
  if (reg.size !== 1) throw new Error('Should have 1 tool');
  if (!reg.get('test_tool')) throw new Error('Should find tool');
  if (!reg.has('TEST_TOOL')) throw new Error('Should be case-insensitive');
});

check('validateToolDefinition rejects bad tool', () => {
  const r = validateToolDefinition({ name: '' });
  if (r.valid) throw new Error('Should be invalid');
});

check('ToolRegistry execute with validation', async () => {
  const reg = new ToolRegistry();
  reg.register({
    name: 'echo',
    label: 'Echo',
    description: 'Echo back text',
    parameters: {
      type: 'object',
      properties: { text: { type: 'string' } },
      required: ['text'],
    },
    execute: async (_id, args) => ({ content: `Echo: ${args.text}` }),
  });
  const result = await reg.execute('echo', { text: 'hello' }, 'tc-1');
  if (result.content !== 'Echo: hello') throw new Error(`Wrong content: ${result.content}`);
  if (result.isError) throw new Error('Should not be error');
});

check('ToolRegistry execute with invalid args', async () => {
  const reg = new ToolRegistry();
  reg.register({
    name: 'echo',
    label: 'Echo',
    description: 'Echo back text',
    parameters: {
      type: 'object',
      properties: { text: { type: 'string' } },
      required: ['text'],
    },
    execute: async () => ({ content: 'ok' }),
  });
  const result = await reg.execute('echo', {}, 'tc-1');
  if (!result.isError) throw new Error('Should be error for missing required arg');
});

// Test agent-loop.js
const { parseToolCallsFromResponse, extractResponseText } = require('./agent-loop');
check('parseToolCallsFromResponse parses agent segments', () => {
  const json = JSON.stringify({
    segments: [
      { type: 'tool', tool: 'shell', args: { command: 'ls' }, id: 'tc-1' },
      { type: 'text', text: 'Running ls...' },
    ],
  });
  const calls = parseToolCallsFromResponse(json);
  if (calls.length !== 1) throw new Error(`Expected 1 tool call, got ${calls.length}`);
  if (calls[0].toolName !== 'shell') throw new Error('Wrong tool name');
  if (calls[0].args.command !== 'ls') throw new Error('Wrong args');
});

check('extractResponseText extracts text from JSON', () => {
  const json = JSON.stringify({ text: 'Hello world', segments: [] });
  const text = extractResponseText(json);
  if (text !== 'Hello world') throw new Error(`Wrong text: ${text}`);
});

check('extractResponseText returns raw on non-JSON', () => {
  const text = extractResponseText('Plain text response');
  if (text !== 'Plain text response') throw new Error('Should return raw text');
});

// Test agent.js
const { Agent } = require('./agent');
check('Agent instantiation with defaults', () => {
  const agent = new Agent();
  if (agent.systemPrompt !== '') throw new Error('Default systemPrompt should be empty');
  if (agent.isStreaming) throw new Error('Should not be streaming');
  if (agent.messages.length !== 0) throw new Error('Messages should be empty');
});

check('Agent prompt input normalization', () => {
  const agent = new Agent();
  const msgs = agent._normalizeInput('Hello');
  if (msgs.length !== 1) throw new Error('Should be 1 message');
  if (msgs[0].role !== 'user') throw new Error('Should be user role');
  if (msgs[0].text !== 'Hello') throw new Error('Text mismatch');
});

check('Agent steer/followUp queueing', () => {
  const agent = new Agent();
  agent.steer(msg.userMessage('steer'));
  agent.followUp(msg.userMessage('follow'));
  if (!agent.hasQueuedMessages()) throw new Error('Should have queued messages');
  agent.clearAllQueues();
  if (agent.hasQueuedMessages()) throw new Error('Should be empty after clear');
});

check('Agent reset clears state', () => {
  const agent = new Agent({ systemPrompt: 'Test' });
  agent._messages = [msg.userMessage('test')];
  agent.reset();
  if (agent.messages.length !== 0) throw new Error('Messages should be empty after reset');
  if (agent.systemPrompt !== 'Test') throw new Error('SystemPrompt should be preserved');
});

// Test tools module
const tools = require('../tools');
check('tools.allTools has correct count', () => {
  if (!Array.isArray(tools.allTools)) throw new Error('allTools should be array');
  if (tools.allTools.length !== 14) throw new Error(`Expected 14 tools, got ${tools.allTools.length}`);
});

check('tools.each tool has required fields', () => {
  for (const tool of tools.allTools) {
    if (!tool.name) throw new Error(`Tool missing "name"`);
    if (!tool.label) throw new Error(`Tool "${tool.name}" missing "label"`);
    if (!tool.description) throw new Error(`Tool "${tool.name}" missing "description"`);
    if (!tool.parameters) throw new Error(`Tool "${tool.name}" missing "parameters"`);
    if (typeof tool.execute !== 'function') throw new Error(`Tool "${tool.name}" missing "execute" function`);
  }
});

check('tools.shellTool executes (sanity)', async () => {
  const result = await tools.shellTool.execute('tc-1', { command: 'echo hello' });
  if (result.isError) throw new Error(`Shell exec failed: ${result.content}`);
  if (!result.content.includes('hello')) throw new Error(`Wrong output: ${result.content}`);
});

check('tools.webSearchTool has correct params', () => {
  if (tools.webSearchTool.name !== 'web_search') throw new Error('Wrong name');
  if (!tools.webSearchTool.parameters.properties.query) throw new Error('Missing query param');
});

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);

if (failed > 0) {
  process.exit(1);
} else {
  console.log('All tests passed! ✓\n');
}
