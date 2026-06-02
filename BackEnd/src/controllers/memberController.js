/**
 * =================================================================
 * [Controller] Member Controller
 * 설명: 요청 값 검증, 도메인 로직 호출, HTTP 응답 생성을 담당함
 * =================================================================
 */
const db = require('../models/db');
const memberModel = require('../models/memberModel');
const projectModel = require('../models/projectModel');
const userModel = require('../models/userModel');
const projectLogic = require('../logics/projectLogic');
const memberLogic = require('../logics/memberLogic');
const localFileService = require('../compiler/services/localFileService');

const {
    emitToUserInProject,
    emitToUserDashboard,
    forceLeaveUserFromProject
} = require('../socket/socketEmitters');

const inviteController = {

    /** [CREATE/READ] 특정 프로젝트의 초대 코드 조회 또는 수동 재발급 */
    createInviteCode: async (req, res) => {
        const { projectId } = req.params;
        const { role, userId, regenerate = false } = req.body;
        const connection = await db.getConnection();

        try {
            if (!['editor', 'viewer'].includes(role)) {
                return res.status(400).json({ status: "error", message: "올바르지 않은 권한 설정입니다. (editor 또는 viewer 필요)" });
            }

            if (!userId) {
                return res.status(400).json({ status: "error", message: "요청자 정보가 필요합니다." });
            }

            const bProjectId = projectLogic.hexToBuffer(projectId);
            const bUserId = projectLogic.hexToBuffer(userId);

            // 방장 권한 체크
            const member = await memberModel.findMemberRole(connection, bProjectId, bUserId);
            if (!member || member.role !== 'owner') {
                return res.status(403).json({ status: "error", message: "초대 코드를 조회하거나 생성할 권한이 없습니다. (방장만 가능)" });
            }

            const existingInvite = await memberModel.findInviteCodeByProjectRole(connection, {
                projectId: bProjectId,
                role
            });

            if (existingInvite && !regenerate) {
                return res.status(200).json({
                    status: "success",
                    message: "기존 초대 코드를 조회했습니다.",
                    data: {
                        projectId,
                        role,
                        inviteCode: existingInvite.invite_code
                    }
                });
            }

            const inviteCode = projectLogic.generateAlphaNumericCode();

            await connection.beginTransaction();

            await memberModel.upsertInviteCode(connection, {
                projectId: bProjectId,
                role,
                inviteCode
            });

            await connection.commit();

            res.status(existingInvite ? 200 : 201).json({
                status: "success",
                message: existingInvite ? "초대 코드가 성공적으로 갱신되었습니다." : "초대 코드가 성공적으로 생성되었습니다.",
                data: {
                    projectId,
                    role,
                    inviteCode
                }
            });

        } catch (error) {
            if (connection) await connection.rollback();
            console.error("[INVITE CODE CREATE ERROR]", error.message);
            res.status(500).json({ status: "error", message: error.message || "초대 코드 처리 실패" });
        } finally {
            if (connection) connection.release();
        }
    },

    /**  [POST] 초대 코드를 통한 프로젝트 참여 요청 (멤버 조인) */
    acceptInvite: async (req, res) => {
        const { inviteCode } = req.params;
        const { userId } = req.body; 
        const connection = await db.getConnection();

        try {
            if (!userId) {
                return res.status(400).json({ status: "error", message: "초대를 수락할 유저 ID가 필요합니다." });
            }

            await connection.beginTransaction();

            const invite = await memberModel.findProjectByInviteCode(connection, inviteCode);

            // 존재하지 않는 코드 쳐내기
            if (!invite) {
                return res.status(404).json({ status: "error", message: "존재하지 않거나 유효하지 않은 초대 링크입니다." });
            }

            // 수락한 유저의 ID를 바이너리로 변환
            const bUserId = projectLogic.hexToBuffer(userId);

            // 이미 이 프로젝트의 멤버인지 확인
            const existingMember = await memberModel.findMemberRole(connection, invite.project_id, bUserId);
            if (existingMember) {
                return res.status(409).json({ status: "error", message: "이미 이 프로젝트에 참여 중인 구성원입니다." });
            }

            // 이미 신청해서 승인 대기 중(PENDING)인지 확인 (중복 신청 방지)
            const existingRequest = await memberModel.findExistingRequest(connection, invite.project_id, bUserId);
            if (existingRequest) {
                return res.status(409).json({ status: "error", message: "이미 참여 신청 후 방장의 승인을 기다리는 중입니다." });
            }

            // join_request 테이블에 넣을 새로운 고유 request_id(바이너리 UUID) 생성
            const crypto = require('crypto');
            const rawRequestId = crypto.randomUUID().replace(/-/g, ''); 
            const bRequestId = Buffer.from(rawRequestId, 'hex');       

            // memberModel을 통해 join_request 테이블에 PENDING 상태로 데이터 삽입
            await memberModel.insertJoinRequest(connection, {
                requestId: bRequestId,
                projectId: invite.project_id, // 테이블 컬럼명 매칭 (snake_case)
                userId: bUserId,
                requestRole: invite.role       // 초대장에 기획된 권한(editor/viewer 등) 그대로 상속
            });

            await connection.commit();

            // 성공 응답 (201 Created)
            res.status(201).json({
                status: "success",
                message: "프로젝트 참여 신청이 완료되었습니다. 방장의 승인을 기다려주세요!",
                data: {
                    requestId: rawRequestId,
                    projectId: invite.project_id.toString('hex'),
                    status: "PENDING"
                }
            });

        } catch (error) {
            if (connection) await connection.rollback();
            console.error("[INVITE ACCEPT ERROR]", error.message);
            res.status(500).json({ status: "error", message: error.message || "초대 신청 실패" });
        } finally {
            if (connection) connection.release();
        }
    },

    /** [READ] 오너 전용: 특정 프로젝트의 참여 대기자(PENDING) 목록 조회 */
    getPendingMembers: async (req, res) => {
        const { projectId } = req.params; 
        const connection = await db.getConnection();

        try {
            const bProjectId = typeof projectLogic !== 'undefined' ? projectLogic.hexToBuffer(projectId) : parseHexToBuffer(projectId);
            
            const [pendingRows] = await connection.execute(
                `SELECT jr.request_id, jr.user_id, u.user_name AS user_name, jr.request_role, jr.created_at
                 FROM join_request jr
                 JOIN users u ON jr.user_id = u.id
                 WHERE jr.project_id = ? AND jr.status = 'PENDING'
                 ORDER BY jr.created_at ASC`,
                [bProjectId]
            );

            // 응답 데이터 매핑 
            const pendingList = pendingRows.map(row => ({
                requestId: row.request_id.toString('hex'), // binary(16)을 Hex 문자열로 변환
                userId: row.user_id.toString('hex'),
                userName: row.user_name,
                requestRole: row.request_role, 
                requestedAt: row.created_at
            }));

            res.status(200).json({
                status: "success",
                data: {
                    pendingMembers: pendingList
                }
            });

        } catch (error) {
            res.status(500).json({ status: "error", message: error.message });
        } finally {
            if (connection) connection.release();
        }
    },

    /** 방장의 참여 신청 승인/거절/차단 처리 */
    manageJoinRequest: async (req, res) => {
        const { requestId } = req.params;
        const { adminId, action } = req.body; // action: 'ACCEPT' | 'REJECT' | 'BLOCK'
        const connection = await db.getConnection();

        try {
            if (!adminId || !action) {
                return res.status(400).json({ status: "error", message: "행동을 수행할 adminId와 action이 필요합니다." });
            }

            const validActions = ['ACCEPT', 'REJECT', 'BLOCK'];
            if (!validActions.includes(action.toUpperCase())) {
                return res.status(400).json({ status: "error", message: "올바르지 않은 액션입니다. (ACCEPT, REJECT, BLOCK 중 선택)" });
            }

            await connection.beginTransaction();

            // 참여 신청 ID로 신청서 데이터 뽑아오기
            const bRequestId = projectLogic.hexToBuffer(requestId);
            const request = await memberModel.findJoinRequest(connection, bRequestId);

            if (!request) {
                return res.status(404).json({ status: "error", message: "존재하지 않는 참여 신청입니다." });
            }

            // 이미 처리된 신청인지 방어 코드
            if (request.status !== 'PENDING') {
                return res.status(400).json({ status: "error", message: `이미 ${request.status} 처리 완료된 가입 요청입니다.` });
            }

            // 요청을 조작하려는 유저(adminId)가 진짜 이 프로젝트의 방장(owner)인가?
            const bAdminId = projectLogic.hexToBuffer(adminId);
            const adminMember = await memberModel.findMemberRole(connection, request.project_id, bAdminId);

            if (!adminMember || adminMember.role !== 'owner') {
                return res.status(403).json({ status: "error", message: "방장(Owner) 권한이 없어 이 요청을 처리할 수 없습니다." });
            }

            // 액션별 분기 처리 구역
            const upperAction = action.toUpperCase();
            
            if (upperAction === 'ACCEPT') {
                // 대기열 상태 ➡️ ACCEPTED 변경
                await memberModel.updateJoinRequestStatus(connection, bRequestId, 'ACCEPTED');

                // 정식 프로젝트 멤버 테이블(`project_member`)에 추가
                await memberModel.insertProjectMember(connection, {
                    projectId: request.project_id,
                    userId: request.user_id,
                    role: request.request_role // 초대장에 있던 그 권한 그대로 부여
                });

            } else if (upperAction === 'REJECT') {
                // 대기열 상태 ➡️ REJECTED 변경 (심플 거절)
                await memberModel.updateJoinRequestStatus(connection, bRequestId, 'REJECTED');

            } else if (upperAction === 'BLOCK') {
                // 대기열 상태는 REJECTED로 처리하되, 블랙리스트 테이블에 추가
                await memberModel.updateJoinRequestStatus(connection, bRequestId, 'REJECTED');
                
                const { reason, expiresAt } = req.body;

                // 블랙리스트 전용 고유 ID 생성 및 버퍼 변환
                const crypto = require('crypto');
                const blacklistHexId = crypto.randomUUID().replace(/-/g, ''); 
                const bBlacklistId = projectLogic.hexToBuffer(blacklistHexId);

                // 외래키 설정 조건에 맞춰 project_id와 target_id 삽입
                await memberModel.insertBlacklist(connection, {
                    id: bBlacklistId,
                    projectId: request.project_id, // 신청서에서 뽑아온 프로젝트 ID 
                    targetId: request.user_id,     // 신청서에서 뽑아온 유저 ID
                    reason: reason || null,
                    expiresAt: expiresAt || null
                });
            }

            await connection.commit();

            if (upperAction === 'ACCEPT') {
                const io = req.app.get('io');

                if (io) {
                    const projectMeta = await projectModel.findById(connection, request.project_id);
                    const cleanProjectId = memberLogic.bufferToHex(request.project_id);
                    const cleanUserId = memberLogic.bufferToHex(request.user_id);
                    const cleanOwnerId = memberLogic.bufferToHex(projectMeta?.owner_id);

                    await emitToUserDashboard(
                        io,
                        cleanUserId,
                        'dashboard:invite-approved',
                        {
                            projectId: cleanProjectId,
                            projectTitle: projectMeta?.title || '프로젝트',
                            ownerId: cleanOwnerId,
                            ownerName: projectMeta?.owner_name || '사용자',
                            role: request.request_role,
                            updatedAt: new Date().toISOString()
                        }
                    );
                }
            }

            const actionStatusMap = { ACCEPT: "승인", REJECT: "거절", BLOCK: "거절 및 차단" };
            res.status(200).json({
                status: "success",
                message: `해당 유저의 가입 신청을 성공적으로 ${actionStatusMap[upperAction]} 처리했습니다.`,
                data: {
                    requestId,
                    action: upperAction
                }
            });

        } catch (error) {
            if (connection) await connection.rollback();
            console.error("[MANAGE REQUEST ERROR]", error.message);
            res.status(500).json({ status: "error", message: error.message || "신청 처리 실패" });
        } finally {
            if (connection) connection.release();
        }
    },

    /** [GET] 특정 프로젝트의 참여자 목록 조회 */
    getProjectMembers: async (req, res) => {
        const { projectId } = req.params;
        const connection = await db.getConnection();

        try {
            // 프로젝트 ID를 바이너리 버퍼로 변환
            const bProjectId = projectLogic.hexToBuffer(projectId);

            // DB에서 멤버 목록 조회
            const rows = await memberModel.findMembersByProjectId(connection, bProjectId);

            // 프론트엔드가 사용할 수 있도록 바이너리 ID들을 Hex 문자열로 포맷팅
            const formattedMembers = rows.map(member => ({
                userId: member.user_id.toString('hex'),
                studentId: member.student_id,
                userName: member.user_name,
                role: member.role,
                status: member.status,
                lastSeenAt: member.last_seen_at,
                currentFileId: member.current_file_id ? member.current_file_id.toString('hex') : null
            }));

            // 표준 규격으로 응답 반환
            res.status(200).json({
                status: "success",
                data: {
                    members: formattedMembers
                }
            });

        } catch (error) {
            console.error("[FETCH MEMBERS ERROR]", error.message);
            res.status(500).json({ status: "error", message: error.message || "참여 구성원 조회 실패" });
        } finally {
            if (connection) connection.release();
        }
    },

    /** [PATCH] 참여자 일반 권한 변경 */
    updateMemberRole: async (req, res) => {
        const { projectId, memberId } = req.params;
        const { role } = req.body;

        const requesterId = memberLogic.resolveRequesterId(req);
        const newRole = memberLogic.normalizeRole(role);

        let connection;

        let oldRole = null;
        let ownerId = null;
        let lastPdfUrl = null;
        let resultPayload = null;

        try {
            if (!projectId || !memberId || !requesterId) {
                return res.status(400).json({ success: false, message: 'MISSING_IDS' });
            }

            if (newRole === 'owner') {
                return res.status(409).json({
                    success: false,
                    message: 'OWNER_TRANSFER_REQUIRES_DEDICATED_API'
                });
            }

            if (!['editor', 'viewer'].includes(newRole)) {
                return res.status(400).json({ success: false, message: 'INVALID_ROLE' });
            }

            const bProjectId = memberLogic.hexToBuffer(projectId);
            const bRequesterId = memberLogic.hexToBuffer(requesterId);
            const bMemberId = memberLogic.hexToBuffer(memberId);

            if (!bProjectId || !bRequesterId || !bMemberId) {
                return res.status(400).json({ success: false, message: 'INVALID_IDS' });
            }

            connection = await db.getConnection();
            await connection.beginTransaction();

            const project = await projectModel.findProjectOwnerForUpdate(connection, bProjectId);

            if (!project) {
                await connection.rollback();
                return res.status(404).json({ success: false, message: 'PROJECT_NOT_FOUND' });
            }

            ownerId = memberLogic.bufferToHex(project.owner_id);

            if (memberLogic.normalizeId(ownerId) !== memberLogic.normalizeId(requesterId)) {
                await connection.rollback();
                return res.status(403).json({ success: false, message: 'ONLY_OWNER_CAN_CHANGE_ROLE' });
            }

            const targetMember = await memberModel.findMemberForUpdate(connection, {
                projectId: bProjectId,
                userId: bMemberId
            });

            if (!targetMember) {
                await connection.rollback();
                return res.status(404).json({ success: false, message: 'MEMBER_NOT_FOUND' });
            }

            oldRole = targetMember.role;

            if (oldRole === 'owner') {
                await connection.rollback();
                return res.status(409).json({ success: false, message: 'CANNOT_CHANGE_OWNER_ROLE_HERE' });
            }

            if (oldRole === newRole) {
                await connection.commit();

                resultPayload = memberLogic.formatRoleUpdateResponse({
                    memberId: memberLogic.bufferToHex(bMemberId),
                    oldRole,
                    role: newRole,
                    ownerId,
                    changed: false
                });

                return res.status(200).json(resultPayload);
            }

            if (newRole === 'viewer') {
                const session = await memberModel.findLastEditSessionForUpdate(connection, {
                    projectId: bProjectId,
                    userId: bMemberId
                });

                lastPdfUrl = session?.last_pdf_url || null;
            }

            await memberModel.updateMemberRole(connection, {
                projectId: bProjectId,
                userId: bMemberId,
                role: newRole,
                clearCurrentFile: newRole === 'viewer'
            });

            if (newRole === 'editor') {
                await memberModel.upsertLastEditSession(connection, {
                    sessionId: memberLogic.generateBinaryId(),
                    projectId: bProjectId,
                    userId: bMemberId
                });
            }

            if (newRole === 'viewer') {
                await memberModel.deleteLastEditSession(connection, {
                    projectId: bProjectId,
                    userId: bMemberId
                });
            }

            await connection.commit();

            let pdfDeleteResult = null;
            let compiledDirDeleteResult = null;

            if (newRole === 'viewer') {
                if (lastPdfUrl) {
                    pdfDeleteResult = await localFileService
                        .deleteCompiledPdfByUrl(lastPdfUrl)
                        .catch((err) => ({
                            deleted: false,
                            reason: err.message
                        }));
                }

                compiledDirDeleteResult = await localFileService
                    .deleteProjectUserCompiledDir({
                        projectId,
                        userId: memberId
                    })
                    .catch((err) => ({
                        deleted: false,
                        reason: err.message
                    }));
            }

            resultPayload = memberLogic.formatRoleUpdateResponse({
                memberId: memberLogic.bufferToHex(bMemberId),
                oldRole,
                role: newRole,
                ownerId,
                lastEditSessionDeleted: newRole === 'viewer',
                pdfDeleteRequested: newRole === 'viewer',
                pdfDeleteResult,
                compiledDirDeleteResult
            });

            const io = req.app.get('io');

            if (io) {
                const cleanProjectId = memberLogic.normalizeId(projectId);
                const cleanMemberId = memberLogic.normalizeId(memberId);

                io.to(`project:${cleanProjectId}`).emit('member:role-updated', {
                    projectId: cleanProjectId,
                    memberId: cleanMemberId,
                    oldRole,
                    role: newRole,
                    changed: true,
                    updatedAt: resultPayload.updatedAt
                });

                await emitToUserInProject(
                    io,
                    cleanProjectId,
                    cleanMemberId,
                    'member:my-role-updated',
                    {
                        projectId: cleanProjectId,
                        oldRole,
                        role: newRole,
                        canEdit: newRole === 'editor',
                        lastEditSessionDeleted: newRole === 'viewer',
                        updatedAt: resultPayload.updatedAt
                    }
                );

                if (newRole === 'viewer') {
                    await emitToUserInProject(
                        io,
                        cleanProjectId,
                        cleanMemberId,
                        'member:edit-permission-revoked',
                        {
                            projectId: cleanProjectId,
                            reason: 'ROLE_CHANGED_TO_VIEWER',
                            lastEditSessionDeleted: true,
                            updatedAt: resultPayload.updatedAt
                        }
                    );
                }
            }

            return res.status(200).json(resultPayload);
        } catch (error) {
            if (connection) await connection.rollback();
            console.error('[UPDATE MEMBER ROLE ERROR]', error.message);
            return res.status(500).json({
                success: false,
                message: error.message || 'ROLE_UPDATE_FAILED'
            });
        } finally {
            if (connection) connection.release();
        }
    },

    /** [PATCH] 프로젝트 소유권 이전 */
    transferProjectOwner: async (req, res) => {
        const { projectId } = req.params;
        const { newOwnerId, confirmOwnerTransfer } = req.body;

        const requesterId = memberLogic.resolveRequesterId(req);

        let connection;
        let resultPayload = null;

        try {
            if (!projectId || !requesterId || !newOwnerId) {
                return res.status(400).json({ success: false, message: 'MISSING_IDS' });
            }

            if (confirmOwnerTransfer !== true) {
                return res.status(409).json({
                    success: false,
                    message: 'OWNER_TRANSFER_CONFIRM_REQUIRED'
                });
            }

            if (memberLogic.normalizeId(requesterId) === memberLogic.normalizeId(newOwnerId)) {
                return res.status(409).json({
                    success: false,
                    message: 'CANNOT_TRANSFER_OWNER_TO_SELF'
                });
            }

            const bProjectId = memberLogic.hexToBuffer(projectId);
            const bRequesterId = memberLogic.hexToBuffer(requesterId);
            const bNewOwnerId = memberLogic.hexToBuffer(newOwnerId);

            if (!bProjectId || !bRequesterId || !bNewOwnerId) {
                return res.status(400).json({ success: false, message: 'INVALID_IDS' });
            }

            connection = await db.getConnection();
            await connection.beginTransaction();

            const project = await projectModel.findProjectOwnerForUpdate(connection, bProjectId);

            if (!project) {
                await connection.rollback();
                return res.status(404).json({ success: false, message: 'PROJECT_NOT_FOUND' });
            }

            const previousOwnerId = memberLogic.bufferToHex(project.owner_id);

            if (memberLogic.normalizeId(previousOwnerId) !== memberLogic.normalizeId(requesterId)) {
                await connection.rollback();
                return res.status(403).json({
                    success: false,
                    message: 'ONLY_OWNER_CAN_TRANSFER_OWNERSHIP'
                });
            }

            const currentOwnerMember = await memberModel.findMemberForUpdate(connection, {
                projectId: bProjectId,
                userId: bRequesterId
            });

            if (!currentOwnerMember || currentOwnerMember.role !== 'owner') {
                await connection.rollback();
                return res.status(409).json({
                    success: false,
                    message: 'CURRENT_OWNER_ROLE_INVALID'
                });
            }

            const newOwnerMember = await memberModel.findMemberForUpdate(connection, {
                projectId: bProjectId,
                userId: bNewOwnerId
            });

            if (!newOwnerMember) {
                await connection.rollback();
                return res.status(404).json({
                    success: false,
                    message: 'NEW_OWNER_MEMBER_NOT_FOUND'
                });
            }

            const newOwnerOldRole = newOwnerMember.role;

            if (newOwnerOldRole === 'owner') {
                await connection.rollback();
                return res.status(409).json({
                    success: false,
                    message: 'TARGET_ALREADY_OWNER'
                });
            }

            if (!['editor', 'viewer'].includes(newOwnerOldRole)) {
                await connection.rollback();
                return res.status(409).json({
                    success: false,
                    message: 'INVALID_TARGET_ROLE'
                });
            }

            await projectModel.updateProjectOwner(connection, {
                projectId: bProjectId,
                ownerId: bNewOwnerId
            });

            await memberModel.updateMemberRole(connection, {
                projectId: bProjectId,
                userId: bRequesterId,
                role: 'editor'
            });

            await memberModel.updateMemberRole(connection, {
                projectId: bProjectId,
                userId: bNewOwnerId,
                role: 'owner'
            });

            await memberModel.upsertLastEditSession(connection, {
                sessionId: memberLogic.generateBinaryId(),
                projectId: bProjectId,
                userId: bNewOwnerId
            });

            await memberModel.upsertLastEditSession(connection, {
                sessionId: memberLogic.generateBinaryId(),
                projectId: bProjectId,
                userId: bRequesterId
            });

            await connection.commit();

            resultPayload = memberLogic.formatOwnerTransferResponse({
                projectId: memberLogic.bufferToHex(bProjectId),
                previousOwnerId: memberLogic.bufferToHex(bRequesterId),
                newOwnerId: memberLogic.bufferToHex(bNewOwnerId),
                newOwnerPreviousRole: newOwnerOldRole
            });

            const io = req.app.get('io');

            if (io) {
                const cleanProjectId = memberLogic.normalizeId(projectId);
                const cleanPreviousOwnerId = memberLogic.normalizeId(resultPayload.previousOwnerId);
                const cleanNewOwnerId = memberLogic.normalizeId(resultPayload.newOwnerId);

                io.to(`project:${cleanProjectId}`).emit('project:owner-transferred', {
                    projectId: cleanProjectId,
                    previousOwnerId: cleanPreviousOwnerId,
                    previousOwnerRole: 'editor',
                    newOwnerId: cleanNewOwnerId,
                    newOwnerPreviousRole: newOwnerOldRole,
                    newOwnerRole: 'owner',
                    ownerId: cleanNewOwnerId,
                    updatedAt: resultPayload.updatedAt
                });

                io.to(`project:${cleanProjectId}`).emit('member:role-updated', {
                    projectId: cleanProjectId,
                    memberId: cleanPreviousOwnerId,
                    oldRole: 'owner',
                    role: 'editor',
                    changed: true,
                    updatedAt: resultPayload.updatedAt
                });

                io.to(`project:${cleanProjectId}`).emit('member:role-updated', {
                    projectId: cleanProjectId,
                    memberId: cleanNewOwnerId,
                    oldRole: newOwnerOldRole,
                    role: 'owner',
                    changed: true,
                    updatedAt: resultPayload.updatedAt
                });

                await emitToUserInProject(
                    io,
                    cleanProjectId,
                    cleanPreviousOwnerId,
                    'member:my-role-updated',
                    {
                        projectId: cleanProjectId,
                        oldRole: 'owner',
                        role: 'editor',
                        canEdit: true,
                        isOwner: false,
                        ownershipTransferred: true,
                        updatedAt: resultPayload.updatedAt
                    }
                );

                await emitToUserInProject(
                    io,
                    cleanProjectId,
                    cleanNewOwnerId,
                    'member:my-role-updated',
                    {
                        projectId: cleanProjectId,
                        oldRole: newOwnerOldRole,
                        role: 'owner',
                        canEdit: true,
                        isOwner: true,
                        ownershipTransferred: true,
                        updatedAt: resultPayload.updatedAt
                    }
                );

                const dashboardProjectMeta = await projectModel.findById(connection, bProjectId);
                const previousOwnerUser = await userModel.findById(connection, bRequesterId);

                await emitToUserDashboard(
                    io,
                    cleanNewOwnerId,
                    'dashboard:ownership-transferred',
                    {
                        projectId: cleanProjectId,
                        projectTitle: dashboardProjectMeta?.title || '프로젝트',
                        previousOwnerId: cleanPreviousOwnerId,
                        previousOwnerName: previousOwnerUser?.user_name || '사용자',
                        newOwnerId: cleanNewOwnerId,
                        updatedAt: resultPayload.updatedAt
                    }
                );
            }

            return res.status(200).json(resultPayload);
        } catch (error) {
            if (connection) await connection.rollback();
            console.error('[TRANSFER PROJECT OWNER ERROR]', error.message);
            return res.status(500).json({
                success: false,
                message: error.message || 'OWNER_TRANSFER_FAILED'
            });
        } finally {
            if (connection) connection.release();
        }
    },

    /** [DELETE] 프로젝트 참여자 제거 */
    removeProjectMember: async (req, res) => {
        const { projectId, memberId } = req.params;
        const requesterId = memberLogic.resolveRequesterId(req);

        let connection;
        let lastPdfUrl = null;
        let removedRole = null;
        let ownerId = null;

        try {
            if (!projectId || !memberId || !requesterId) {
                return res.status(400).json({ success: false, message: 'MISSING_IDS' });
            }

            if (memberLogic.normalizeId(requesterId) === memberLogic.normalizeId(memberId)) {
                return res.status(409).json({
                    success: false,
                    message: 'OWNER_CANNOT_REMOVE_SELF'
                });
            }

            const bProjectId = memberLogic.hexToBuffer(projectId);
            const bRequesterId = memberLogic.hexToBuffer(requesterId);
            const bMemberId = memberLogic.hexToBuffer(memberId);

            if (!bProjectId || !bRequesterId || !bMemberId) {
                return res.status(400).json({ success: false, message: 'INVALID_IDS' });
            }

            connection = await db.getConnection();
            await connection.beginTransaction();

            const project = await projectModel.findProjectOwnerForUpdate(connection, bProjectId);

            if (!project) {
                await connection.rollback();
                return res.status(404).json({ success: false, message: 'PROJECT_NOT_FOUND' });
            }

            ownerId = memberLogic.bufferToHex(project.owner_id);

            if (memberLogic.normalizeId(ownerId) !== memberLogic.normalizeId(requesterId)) {
                await connection.rollback();
                return res.status(403).json({
                    success: false,
                    message: 'DELETE_FORBIDDEN'
                });
            }

            const targetMember = await memberModel.findMemberForUpdate(connection, {
                projectId: bProjectId,
                userId: bMemberId
            });

            if (!targetMember) {
                await connection.rollback();
                return res.status(404).json({
                    success: false,
                    message: 'MEMBER_NOT_FOUND'
                });
            }

            removedRole = targetMember.role;

            if (removedRole === 'owner') {
                await connection.rollback();
                return res.status(409).json({
                    success: false,
                    message: 'CANNOT_REMOVE_OWNER'
                });
            }

            const session = await memberModel.findLastEditSessionForUpdate(connection, {
                projectId: bProjectId,
                userId: bMemberId
            });

            lastPdfUrl = session?.last_pdf_url || null;

            await memberModel.deleteLastEditSession(connection, {
                projectId: bProjectId,
                userId: bMemberId
            });

            await memberModel.deleteJoinRequestByProjectAndUser(connection, {
                projectId: bProjectId,
                userId: bMemberId
            });

            const deleteResult = await memberModel.deleteProjectMember(connection, {
                projectId: bProjectId,
                userId: bMemberId
            });

            if (deleteResult.affectedRows === 0) {
                await connection.rollback();
                return res.status(500).json({
                    success: false,
                    message: 'MEMBER_REMOVE_FAILED'
                });
            }

            await connection.commit();

            let pdfDeleteResult = null;
            let compiledDirDeleteResult = null;

            if (lastPdfUrl) {
                pdfDeleteResult = await localFileService
                    .deleteCompiledPdfByUrl(lastPdfUrl)
                    .catch((err) => ({
                        deleted: false,
                        reason: err.message
                    }));
            }

            compiledDirDeleteResult = await localFileService
                .deleteProjectUserCompiledDir({
                    projectId,
                    userId: memberId
                })
                .catch((err) => ({
                    deleted: false,
                    reason: err.message
                }));

            const resultPayload = memberLogic.formatRemoveMemberResponse({
                projectId: memberLogic.bufferToHex(bProjectId),
                memberId: memberLogic.bufferToHex(bMemberId),
                removedRole,
                ownerId,
                pdfDeleteResult,
                compiledDirDeleteResult
            });

            const io = req.app.get('io');

            if (io) {
                const cleanProjectId = memberLogic.normalizeId(projectId);
                const cleanMemberId = memberLogic.normalizeId(memberId);

                const dashboardProjectMeta = await projectModel.findById(connection, bProjectId);

                await emitToUserDashboard(
                    io,
                    cleanMemberId,
                    'dashboard:project-removed',
                    {
                        projectId: cleanProjectId,
                        projectTitle: dashboardProjectMeta?.title || '프로젝트',
                        ownerId: memberLogic.normalizeId(ownerId),
                        ownerName: dashboardProjectMeta?.owner_name || '사용자',
                        removedRole,
                        updatedAt: resultPayload.updatedAt
                    }
                );

                await emitToUserInProject(
                    io,
                    cleanProjectId,
                    cleanMemberId,
                    'member:removed-from-project',
                    {
                        projectId: cleanProjectId,
                        memberId: cleanMemberId,
                        reason: 'REMOVED_BY_OWNER',
                        lastEditSessionDeleted: true,
                        updatedAt: resultPayload.updatedAt
                    }
                );

                io.to(`project:${cleanProjectId}`).emit('member:removed', {
                    projectId: cleanProjectId,
                    memberId: cleanMemberId,
                    removedRole,
                    updatedAt: resultPayload.updatedAt
                });

                const forcedLeaveCount = await forceLeaveUserFromProject(
                    io,
                    cleanProjectId,
                    cleanMemberId
                );

                resultPayload.socketForcedLeaveCount = forcedLeaveCount;
            }

            return res.status(200).json(resultPayload);
        } catch (error) {
            if (connection) await connection.rollback();
            console.error('[REMOVE PROJECT MEMBER ERROR]', error.message);
            return res.status(500).json({
                success: false,
                message: error.message || 'MEMBER_REMOVE_FAILED'
            });
        } finally {
            if (connection) connection.release();
        }
    }
};

module.exports = inviteController;