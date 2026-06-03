/**
 * =================================================================
 * [Script] Development Process Cleanup
 * 설명: DguLaTeX 개발 서버가 사용하는 포트를 점유한 이전 프로세스를 종료함
 * =================================================================
 */
const { execFileSync } = require('child_process');

const ports = [5000, 5173, 3000, 3001, 3002];
const currentPid = process.pid;

const run = (command, args) => {
  try {
    return execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return '';
  }
};

const collectPortPids = () => {
  const output = run('ss', ['-ltnp']);
  const pids = new Set();

  for (const line of output.split(/\r?\n/)) {
    const matchesPort = ports.some((port) => line.includes(':' + port));
    if (!matchesPort) continue;

    const pidMatches = [...line.matchAll(/pid=(\d+)/g)];
    for (const match of pidMatches) pids.add(Number(match[1]));
  }

  return pids;
};

const collectProjectDevPids = () => {
  const output = run('ps', ['-eo', 'pid=,cmd=']);
  const pids = new Set();

  for (const line of output.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const firstSpace = trimmed.indexOf(' ');
    if (firstSpace === -1) continue;

    const pid = Number(trimmed.slice(0, firstSpace));
    const command = trimmed.slice(firstSpace + 1);
    const isDguLatexProcess = command.includes('/DguLaTex/');
    const isDevProcess =
      command.includes('scripts/dev-all.js') ||
      command.includes('y-websocket') ||
      command.includes('vite') ||
      command.includes('src/server.js');

    if (isDguLatexProcess && isDevProcess) pids.add(pid);
  }

  return pids;
};

const pids = new Set([...collectPortPids(), ...collectProjectDevPids()]);
pids.delete(currentPid);

if (pids.size === 0) {
  console.log('[stop:dev] No DguLaTeX dev processes found.');
  process.exit(0);
}

for (const pid of pids) {
  try {
    process.kill(pid, 'SIGTERM');
    console.log('[stop:dev] terminated pid ' + pid);
  } catch (error) {
    console.warn('[stop:dev] failed to terminate pid ' + pid + ': ' + error.message);
  }
}
