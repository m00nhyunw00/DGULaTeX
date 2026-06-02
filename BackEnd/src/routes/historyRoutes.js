/**
 * =================================================================
 * [Router] History API Router
 * 설명: API 엔드포인트와 컨트롤러 핸들러를 연결하고 요청 경로 우선순위를 정의함
 * =================================================================
 */
const express = require('express');
const router = express.Router();
const historyController = require('../controllers/historyController');


// 특정 프로젝트 내의 특정 파일을 과거 히스토리 버전으로 롤백하는 API
router.post('/projects/:projectId/entries/:entryId/rollback', historyController.rollbackFile);

// 특정 프로젝트 전체를 과거 특정 히스토리 버전으로 롤백하는 API 
router.post('/:historyId/:projectId/rollback', historyController.rollbackProject);

/** [GET] 특정 히스토리 버전 전체를 ZIP으로 다운로드 */
router.get('/:historyId/:projectId/download', historyController.downloadVersionZip);

/** 특정 히스토리 버전의 특정 파일 소스 코드 및 변경된 라인 조회 */
router.get('/:historyId/:projectId/versions/:entryId', historyController.getVersionFileContent);

// [PATCH] 실시간 코드 편집 내용 동기화 (5분 가드레일)
router.patch('/:projectId/sync/code/:entryId', historyController.syncLiveCodeEdit);

/** [READ] 특정 프로젝트의 버전 히스토리 목록 조회 */
router.get('/:projectId/versions', historyController.getProjectVersions);

/** [CREATE] 특정 프로젝트의 현재 상태를 버전(스냅숏)으로 저장 */
router.post('/:projectId/versions', historyController.saveProjectVersion);

/** [GET] 특정 히스토리의 파일 목록 조회 */
router.get('/:historyId/:projectId/versions', historyController.getVersionStructure);

// [POST] 실시간 구조(파일 트리) 변경 동기화 (5분 가드레일)
router.post('/:projectId/sync/structure', historyController.syncLiveStructureChange);

module.exports = router;