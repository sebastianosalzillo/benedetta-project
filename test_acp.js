const { spawn } = require('child_process');

async function testAcp(command, args, brainName) {
  console.log(`\n=== Testing ${brainName} ACP ===`);
  
  return new Promise((resolve) => {
    // Use cmd.exe /c for .cmd files on Windows
    const proc = spawn('cmd.exe', ['/c', command, ...args], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';
    let initialized = false;
    let sessionId = null;
    let completed = false;

    const sendMessage = (msg) => {
      proc.stdin.write(JSON.stringify(msg) + '\n');
      console.log('>>> Sent:', msg.method);
    };

    proc.stdout.on('data', (data) => {
      const lines = data.toString().split('\n').filter(l => l.trim());
      for (const line of lines) {
        stdout += line + '\n';
        try {
          const msg = JSON.parse(line);
          console.log('<<< Received:', msg.method || `response to ${msg.id}`, msg.result ? 'OK' : msg.error ? 'ERROR' : '');
          
          if (msg.id === 1 && msg.result) {
            initialized = true;
            // Send session/new
            setTimeout(() => sendMessage({
              jsonrpc: '2.0',
              id: 2,
              method: 'session/new',
              params: { cwd: 'C:\\Users\\salzi\\Desktop\\Nuova cartella', mcpServers: [] }
            }), 100);
          }
          
          if (msg.id === 2 && msg.result?.sessionId) {
            sessionId = msg.result.sessionId;
            console.log('Session ID:', sessionId);
            // Send session/prompt
            setTimeout(() => sendMessage({
              jsonrpc: '2.0',
              id: 3,
              method: 'session/prompt',
              params: { 
                sessionId, 
                prompt: [{ type: 'text', text: 'Rispondi solo con "Ciao, sono ' + brainName + '" in una parola' }] 
              }
            }), 500);
          }
          
          if (msg.id === 3) {
            completed = true;
            console.log('Prompt completed!');
          }
          
          // Handle session/update messages
          if (msg.method === 'session/update') {
            console.log('  Update:', msg.params?.update?.sessionUpdate, msg.params?.update?.content?.[0]?.text || '');
          }
        } catch (e) {
          console.log('Raw output:', line.slice(0, 100));
        }
      }
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
      console.log('STDERR:', data.toString().slice(0, 200));
    });

    proc.on('error', (err) => {
      console.log('Process error:', err.message);
      resolve({ success: false, error: err.message });
    });

    proc.on('close', (code) => {
      console.log(`Process exited with code ${code}`);
      resolve({ success: completed, stdout, stderr });
    });

    // Send initialize
    setTimeout(() => {
      sendMessage({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: 1,
          clientInfo: { name: 'test', version: '1.0.0' },
          clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false }
        }
      });
    }, 100);

    // Timeout after 15 seconds
    setTimeout(() => {
      if (!completed) {
        console.log('Timeout - killing process');
        proc.kill();
        resolve({ success: false, timeout: true, stdout, stderr });
      }
    }, 15000);
  });
}

// Test each brain with full paths
(async () => {
  console.log('Starting ACP tests...\n');
  
  const brains = [
    { cmd: 'C:\\Users\\salzi\\AppData\\Roaming\\npm\\kilo.cmd', args: ['acp'], name: 'Kilo' },
    { cmd: 'C:\\Users\\salzi\\AppData\\Roaming\\npm\\opencode.cmd', args: ['acp'], name: 'OpenCode' },
    { cmd: 'C:\\Users\\salzi\\AppData\\Roaming\\npm\\gemini.cmd', args: ['acp'], name: 'Gemini' },
  ];
  
  for (const brain of brains) {
    await testAcp(brain.cmd, brain.args, brain.name);
    await new Promise(r => setTimeout(r, 2000));
  }
  
  process.exit(0);
})();
