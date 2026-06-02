/**
 * =================================================================
 * [Router] Member API Router
 * 설명: API 엔드포인트와 컨트롤러 핸들러를 연결하고 요청 경로 우선순위를 정의함
 * =================================================================
 */
const express = require('express');
const router = express.Router();
const memberController = require('../controllers/memberController');

// [GET] 특정 프로젝트의 참여자 목록 조회
router.get('/project/:projectId', memberController.getProjectMembers);

// [PATCH] 프로젝트 소유권 이전
router.patch('/project/:projectId/owner', memberController.transferProjectOwner);

// [PATCH] 참여자 일반 권한 변경
router.patch('/project/:projectId/:memberId/role', memberController.updateMemberRole);

// [DELETE] 참여자 제거
router.delete('/project/:projectId/:memberId', memberController.removeProjectMember);

// [POST] 초대받은 유저: 링크(UUID)를 타고 와서 프로젝트 참여 신청 (PENDING 상태로 진입)
// 유저는 projectId를 모르고 inviteId(토큰)만 가진 상태로 요청하므로 projectId 없이 주소 구성
router.post('/invites/:inviteCode/join', memberController.acceptInvite);

// [GET] 프로젝트 오너: 본인 프로젝트에 신청된 승인 대기 중인(PENDING) 멤버 목록 조회
// 최종 주소: /api/members/projects/:projectId/pending
router.get('/projects/:projectId/join', memberController.getPendingMembers);

// [PATCH] 방장의 참여 신청 관리 (승인/거절/차단 통합 라우트)
router.patch('/requests/:requestId', memberController.manageJoinRequest);

module.exports = router;