/**
 * =================================================================
 * [Router] Entry API Router
 * 설명: API 엔드포인트와 컨트롤러 핸들러를 연결하고 요청 경로 우선순위를 정의함
 * =================================================================
 */
const express = require('express');
const router = express.Router({ mergeParams: true }); 
const entryController = require('../controllers/entryController');

// 파일, 폴더 업로드를 위한 multer 패키지 설정
const multer = require('multer');
const upload = multer(); // 메모리에 임시 저장 설정



/* ---------------------------------------------------------
 * 🎯 SECTION 1: 위치 이동(MOVE) 라우터 체인 (최상위 우선순위 선언)
 * --------------------------------------------------------- */

// [다중 이동] PATCH /api/projects/:projectId/entries/move
// 와일드카드(:entryId) 파라미터가 없는 순수 명사 경로이므로, 
//Express가 다른 주소와 혼동하지 않도록 라우터 파일의 '맨 첫 줄'에 배치합니다.
router.patch('/move', entryController.moveEntry);

// [단일 이동] PATCH /api/projects/:projectId/entries/:entryId/move
router.patch('/:entryId/move', entryController.moveEntry);


/* ---------------------------------------------------------
 * 🎯 SECTION 2: 기본 CRUD 및 삭제 라우터 체인
 * --------------------------------------------------------- */

// [CREATE] 새로운 파일 또는 폴더 생성
router.post('/', entryController.createEntry);

// [READ] 해당 프로젝트 내의 모든 엔트리 목록 조회
router.get('/', entryController.getEntries);

// [DELETE] 엔트리 삭제 (다중 및 단일)
router.delete('/', entryController.deleteEntry);
router.delete('/:entryId', entryController.deleteEntry);

// [UPDATE] 특정 엔트리의 이름 변경 
router.patch('/:entryId', entryController.updateEntryTitle);


/* ---------------------------------------------------------
 * 🎯 SECTION 3: 업로드/다운로드 라우터
 * --------------------------------------------------------- */
// [UPLOAD]  로컬 파일 및 폴더 업로드 통합 API 
// 주소: POST /api/projects/:projectId/entries/upload
router.post('/upload', upload.array('files'), entryController.uploadEntry);


//  단일 파일 다운로드 API (텍스트 파일 및 이미지/PDF 에셋 공통)
// GET /api/entries/:entryId/download
router.get('/:entryId/download', entryController.downloadSingleFile);


/* ---------------------------------------------------------
 * 🎯 SECTION 4: 파일 코드(content) 라우터
 * --------------------------------------------------------- */
// [UPDATE] 특정 파일의 본문 내용 수정 (프론트 디바운스 실시간 저장용)
router.patch('/:entryId/content', entryController.updateFileContent);

// [READ] 특정 파일의 본문 내용 조회 (에디터 로딩 및 파일 전환용)
router.get('/:entryId/content', entryController.getFileContent);

// [POST] 에디터 내 사용자 편집 세션 저장 (마지막 편집 파일 및 커서 위치 저장) 
router.put('/session', entryController.saveEditSession);

// [GET] 에디터 내 사용자 편집 세션 조회 
router.get('/session', entryController.getEditSession);

module.exports = router;