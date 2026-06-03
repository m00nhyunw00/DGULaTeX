/**
 * =================================================================
 * [Script] Development Process Orchestrator
 * 설명: 루트 명령 하나로 백엔드 API와 프론트엔드 개발 서버를 함께 실행함
 *       Yjs는 현재 백엔드 5000 포트의 /yjs 경로에서 통합 실행됨
 * =================================================================
 */
const fs = require('fs');
const path = require('path');
const net = require('net');
const { spawn } = require('child_process');

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const commands = [
  {
    name: 'backend',
    color: '\x1b[36m',
    args: ['--prefix', 'BackEnd', 'start'],
    port: 5000,
    envFiles: ['BackEnd/.env.example', 'BackEnd/.env']
  },
  {
    name: 'frontend',
    color: '\x1b[32m',
    args: ['--prefix', 'FrontEnd', 'run', 'dev'],
    port: 5173,
    envFiles: ['FrontEnd/.env.example', 'FrontEnd/.env']
  }
];

const reset = '\x1b[0m';
const parseEnvFile = (filePath) => {
  if (!fs.existsSync(filePath)) return {};

  const env = {};
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex === -1) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('\"') && value.endsWith('\"')) ||
      (value.startsWith(String.fromCharCode(39)) && value.endsWith(String.fromCharCode(39)))
    ) {
      value = value.slice(1, -1);
    }

    if (key) env[key] = value;
  }

  return env;
};

const loadCommandEnv = (command) => {
  const fileEnv = {};

  for (const envFile of command.envFiles || []) {
    Object.assign(fileEnv, parseEnvFile(path.resolve(process.cwd(), envFile)));
  }

  return {
    ...fileEnv,
    ...process.env
  };
};

const children = [];
const outputBuffers = new Map();
let shuttingDown = false;

const checkPortAvailable = (port) => new Promise((resolve) => {
  const server = net.createServer();

  server.once('error', () => resolve(false));
  server.once('listening', () => {
    server.close(() => resolve(true));
  });

  server.listen(port, '127.0.0.1');
});

const ensureRequiredPorts = async () => {
  const occupied = [];

  for (const command of commands) {
    const available = await checkPortAvailable(command.port);
    if (!available) occupied.push(command);
  }

  if (occupied.length === 0) return true;

  console.error('\n[dev] Required development port(s) are already in use.');
  for (const command of occupied) {
    console.error('  - ' + command.name + ': port ' + command.port);
  }
  console.error('\n[dev] Run npm run dev:fresh to stop old DguLaTeX dev processes and start again.');
  console.error('[dev] Or run npm run stop:dev first, then npm run dev.\n');
  return false;
};

const prefixOutput = (name, color, stream, chunk) => {
  const key = name + ':' + (stream === process.stderr ? 'stderr' : 'stdout');
  const text = (outputBuffers.get(key) || '') + String(chunk);
  const lines = text.split(/\r?\n/);
  outputBuffers.set(key, lines.pop() || '');

  for (const line of lines) {
    if (line.length > 0) stream.write(color + '[' + name + ']' + reset + ' ' + line + '\n');
  }
};

const flushOutput = (name, color, streamName) => {
  const key = name + ':' + streamName;
  const pending = outputBuffers.get(key);
  if (!pending) return;

  const stream = streamName === 'stderr' ? process.stderr : process.stdout;
  stream.write(color + '[' + name + ']' + reset + ' ' + pending + '\n');
  outputBuffers.delete(key);
};

const stopAll = (signal = 'SIGTERM') => {
  if (shuttingDown) return;
  shuttingDown = true;

  for (const child of children) {
    if (!child.killed) {
      try {
        if (process.platform === 'win32') {
          child.kill(signal);
        } else {
          process.kill(-child.pid, signal);
        }
      } catch {
        try { child.kill(signal); } catch {}
      }
    }
  }
};

const startAll = async () => {
  const portsAvailable = await ensureRequiredPorts();
  if (!portsAvailable) {
    process.exitCode = 1;
    return;
  }

  for (const command of commands) {
    const child = spawn(npmCommand, command.args, {
      cwd: process.cwd(),
      env: loadCommandEnv(command),
      detached: process.platform !== 'win32',
      stdio: ['inherit', 'pipe', 'pipe']
    });

    children.push(child);

    child.stdout.on('data', (chunk) => prefixOutput(command.name, command.color, process.stdout, chunk));
    child.stderr.on('data', (chunk) => prefixOutput(command.name, command.color, process.stderr, chunk));

    child.on('exit', (code, signal) => {
      flushOutput(command.name, command.color, 'stdout');
      flushOutput(command.name, command.color, 'stderr');

      if (shuttingDown) return;

      console.error('\n[' + command.name + '] exited with code ' + code + (signal ? ' signal ' + signal : ''));
      stopAll();
      process.exitCode = code || 1;
    });
  }
};

process.on('SIGINT', () => {
  stopAll('SIGINT');
  setTimeout(() => process.exit(130), 200);
});

process.on('SIGTERM', () => {
  stopAll('SIGTERM');
  setTimeout(() => process.exit(143), 200);
});

startAll();
