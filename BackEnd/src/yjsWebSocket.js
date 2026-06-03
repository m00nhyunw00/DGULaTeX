/**
 * =================================================================
 * [Yjs] WebSocket Integration
 * 설명: Express HTTP 서버의 /yjs 경로에 y-websocket 협업 서버를 연결함
 * =================================================================
 */
const path = require('path');
const WebSocket = require('ws');

const yWebsocketUtilsPath = path.resolve(__dirname, '../node_modules/y-websocket/bin/utils.cjs');
const { setupWSConnection } = require(yWebsocketUtilsPath);

const YJS_PATH_PREFIX = '/yjs';

const isYjsRequest = (requestUrl = '') => {
  const pathname = new URL(requestUrl, 'http://localhost').pathname;
  return pathname === YJS_PATH_PREFIX || pathname.startsWith(`${YJS_PATH_PREFIX}/`);
};

const getYjsDocName = (requestUrl = '') => {
  const url = new URL(requestUrl, 'http://localhost');
  const pathname = url.pathname;

  if (pathname === YJS_PATH_PREFIX) {
    return '';
  }

  return decodeURIComponent(pathname.slice(YJS_PATH_PREFIX.length + 1));
};

function registerYjsWebSocket(httpServer) {
  const yjsServer = new WebSocket.Server({ noServer: true });

  httpServer.on('upgrade', (request, socket, head) => {
    if (!isYjsRequest(request.url)) return;

    yjsServer.handleUpgrade(request, socket, head, (ws) => {
      setupWSConnection(ws, request, {
        docName: getYjsDocName(request.url)
      });
    });
  });

  return yjsServer;
}

module.exports = registerYjsWebSocket;
