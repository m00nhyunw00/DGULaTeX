/**
 * =================================================================
 * [Router] Compiler API Router
 * 설명: API 엔드포인트와 컨트롤러 핸들러를 연결하고 요청 경로 우선순위를 정의함
 * =================================================================
 */
const express = require('express');
const router = express.Router();

const compilerController = require('../controllers/compilerController');


// 마지막 컴파일 PDF 조회
// GET /api/compile/:projectId/last-pdf?userId=...
router.get(
  '/:projectId/last-pdf',
  compilerController.getLastCompiledPdf
);

// 자동 컴파일
// POST /api/compile/:projectId/auto
router.post(
  '/:projectId/auto',
  compilerController.autoCompile
);

// 수동 컴파일
// POST /api/compile/:projectId
router.post(
  '/:projectId',
  compilerController.manualCompile
);

// pdf 다운로드 라우트
// POST /api/compile/:projectId/download/pdf
router.post(
  '/:projectId/download/pdf',
  compilerController.downloadCompiledPdf
);

module.exports = router;