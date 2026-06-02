/**
 * =================================================================
 * [Router] Project API Router
 * 설명: API 엔드포인트와 컨트롤러 핸들러를 연결하고 요청 경로 우선순위를 정의함
 * =================================================================
 */
const express = require('express');
const router = express.Router();
const projectController = require('../controllers/projectController');
const memberController = require('../controllers/memberController');
const entryRoutes = require('./entryRoutes'); 

/**에디터 항목 관련 라우트 연결 */
router.use('/:projectId/entries', entryRoutes);

// [UPDATE] 프로젝트 정보 수정 (이름)
router.patch('/:projectId', projectController.updateProjectTitle);

// [PATCH] 프로젝트 메인 파일(컴파일 대상) 변경
router.patch('/:projectId/main-entry', projectController.setMainEntry);

// [GET] 프로젝트 zip 파일로 다운로드
router.get('/:projectId/download', projectController.downloadProjectZip);

// [patch] 프로젝트에 들어온 참여 신청을 승인 또는 거절
//npm router.patch('/:projectId/requests/:requestId', projectController.handleJoinRequest);

/** [CREATE] 신규 프로젝트 생성 */
router.post('/', projectController.createProject);

/** [READ] 특정 사용자의 프로젝트 목록 조회 */
router.get('/', projectController.getProjects);

/** [READ] 특정 프로젝트 상세 조회 (에디터 입장 시 모든 파일 트리 포함) */
router.get('/:id', projectController.getProjectById);

/** [DELETE] 프로젝트 삭제 */
router.delete('/:id', projectController.deleteProject);

//  [POST] owner용: 특정 프로젝트의 초대 링크 생성 (에디터용 / 뷰어용 분리)
router.use('/:projectId/invites', memberController.createInviteCode);
router.post('/:projectId/invites', memberController.createInviteCode);

module.exports = router;