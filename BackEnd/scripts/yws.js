/**
 * =================================================================
 * [Script] Yjs WebSocket Server Launcher
 * 설명: BackEnd/.env의 YJS_HOST/YJS_PORT 값을 읽어 y-websocket 서버를 실행함
 * =================================================================
 */
const path = require('path');
const { spawn } = require('child_process');
const dotenv = require('dotenv');
dotenv.config({ path: path.resolve(__dirname, '../.env') });

if (!process.env.YJS_HOST || !process.env.YJS_PORT) {
  dotenv.config({ path: path.resolve(__dirname, '../.env.example') });
}

const host = process.env.YJS_HOST;
const port = process.env.YJS_PORT;

if (!host || !port) {
  throw new Error('YJS_HOST and YJS_PORT must be set in BackEnd/.env or BackEnd/.env.example.');
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
