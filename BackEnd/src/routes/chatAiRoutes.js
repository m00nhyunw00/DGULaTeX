/**
 * =================================================================
 * [Router] Chat Ai API Router
 * 설명: API 엔드포인트와 컨트롤러 핸들러를 연결하고 요청 경로 우선순위를 정의함
 * =================================================================
 */
const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chatAiController');

/**
 * @route   POST /api/chat
 * @desc    사용자 메시지에 대한 AI 답변 생성
 * @access  Public (혹은 토큰 검증 미들웨어 추가 가능)
 */
router.post('/', chatController.processChat);

module.exports = router;