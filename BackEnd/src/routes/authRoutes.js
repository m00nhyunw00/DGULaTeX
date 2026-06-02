/**
 * =================================================================
 * [Router] Auth API Router
 * 설명: API 엔드포인트와 컨트롤러 핸들러를 연결하고 요청 경로 우선순위를 정의함
 * =================================================================
 */
const express = require('express');
const router = express.Router();

/* ---------------------------------------------------------
 * SECTION 1: Controller Dependency Injection
 * 기능: 비즈니스 로직이 구현된 authController 모듈을 참조함.
 * --------------------------------------------------------- */
const authController = require('../controllers/authController');

/* ---------------------------------------------------------
 * SECTION 2: Routing Definitions
 * 기능: 특정 경로(Path)와 HTTP Method를 컨트롤러 함수와 연결함.
 * --------------------------------------------------------- */

/**
 * @route   POST /api/auth/login
 * @desc    사용자 인증 시도 및 로그인 처리
 * @access  Public
 */
router.post('/login', authController.login);

/**
 * @route   POST /api/auth/register
 * @desc    새로운 사용자 회원가입 처리
 * @access  Public
 */
router.post('/register', authController.register);
router.post('/change-password', authController.changePassword);
router.post('/verify-withdrawal', authController.verifyWithdrawal);
router.get('/me', authController.me);
router.post('/logout', authController.logout);

/**
 * @route   DELETE /api/auth/withdraw/:userId
 * @desc    사용자 계정 탈퇴(삭제) 처리
 * @access  Private (Owner)
 */
router.delete('/withdraw/:userId', authController.deleteUser);

/* ---------------------------------------------------------
 * SECTION 3: Module Export
 * 기능: 정의된 라우터 객체를 외부 모듈(서버 메인 파일 등)에서 사용할 수 있도록 수출함.
 * --------------------------------------------------------- */
module.exports = router;