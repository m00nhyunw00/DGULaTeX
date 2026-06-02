/**
 * =================================================================
 * [Socket] Socket.IO Client Factory
 * 설명: 브라우저에서 백엔드 협업 Socket.IO 서버 연결을 생성함
 * =================================================================
 */
import { io } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export const socket = io(SOCKET_URL, {
    autoConnect: false,
    transports: ['websocket']
});