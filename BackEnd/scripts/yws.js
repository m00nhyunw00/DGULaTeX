/**
 * =================================================================
 * [Script] Yjs WebSocket Server Launcher
 * 설명: BackEnd/.env의 YJS_HOST/YJS_PORT 값을 읽어 y-websocket 서버를 실행함
 * =================================================================
 */
const path = require('path');
const { spawn } = require('child_process');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const host = process.env.YJS_HOST;
const port = process.env.YJS_PORT;

if (!host || !port) {
  throw new Error('YJS_HOST and YJS_PORT must be set in BackEnd/.env.');
}
const serverBin = path.resolve(__dirname, '../node_modules/y-websocket/bin/server.cjs');

const child = spawn(process.execPath, [serverBin], {
  stdio: 'inherit',
  env: {
    ...process.env,
    HOST: host,
    PORT: port
  }
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code || 0);
});
