/**
 * =================================================================
 * [Service] Collaboration Client Service
 * 설명: 멤버 목록, 권한 변경, 초대 코드, 참여 요청 API 응답을 UI 모델로 정규화함
 * =================================================================
 */
import { getMembersRequest } from '../api/collaboration/getMembers';
import { createInviteCodeRequest } from '../api/collaboration/createInviteCode';
import { requestAccessRequest } from '../api/collaboration/requestAccess';
import { handleAccessRequest } from '../api/collaboration/handleAccessRequest';
import { removeMemberRequest } from '../api/collaboration/removeMember';
import { updateMemberRoleRequest } from '../api/collaboration/updateMemberRole';
import { updateOwnerRequest } from '../api/collaboration/updateOwner';
import { getRequestRequest } from '../api/collaboration/getRequests';

const handleServiceError = (error) => ({
    success: false,
    message: error.message || '요청 중 오류가 발생했습니다.',
    errorCode: error.errorCode,
    statusCode: error.statusCode,
    errorLog: error.errorLog
});

export const CollaborationService = {
    async getMembers(projectId) {
        try {
            const res = await getMembersRequest(projectId);

            const members = (res.members || []).map(member => ({
                id: member.userId,
                studentId: member.studentId || member.student_id || '',
                name: member.userName || '사용자',
                email: member.email || '',
                role: String(member.role || 'viewer').toLowerCase(),
                status: member.status || null,
                lastSeenAt: member.lastSeenAt || null,
                currentFileId: member.currentFileId || null
            }));

            return {
                success: true,
                members
            };
        } catch (e) {
            return handleServiceError(e);
        }
    },

    /**
     * [CREATE INVITE CODE]
     * 프로젝트 초대 코드 생성
     *
     * @param {string} projectId
     * @param {object} data
     * {
     *   role: 'editor' | 'viewer',
     *   userId: string
     * }
     */
    async createInviteCode(projectId, { role = 'viewer', userId, regenerate = false }) {
        try {
            const res = await createInviteCodeRequest(projectId, {
                role: String(role || 'viewer').toLowerCase(),
                userId,
                regenerate
            });

            return {
                success: true,
                projectId: res.projectId,
                role: res.role,
                inviteCode: res.inviteCode
            };
        } catch (e) {
            return handleServiceError(e);
        }
    },

    /**
     * [REQUEST ACCESS]
     * 초대 코드를 사용하여 프로젝트 참여 신청
     *
     * @param {string} inviteCode
     * @param {object} data
     * {
     *   userId: string
     * }
     */
    async requestAccess(inviteCode, { userId }) {
        try {
            const res = await requestAccessRequest(inviteCode, {
                userId
            });

            return {
                success: true,
                requestId: res.requestId,
                projectId: res.projectId,
                status: res.status
            };
        } catch (e) {
            return handleServiceError(e);
        }
    },

    /**
     * [HANDLE REQUEST]
     * 대기 중인 참여 요청 승인/거절/차단
     *
     * @param {string} requestId
     * @param {object} data
     * {
     *   adminId: string,
     *   action: 'ACCEPT' | 'REJECT' | 'BLOCK',
     *   reason?: string,
     *   expiresAt?: string
     * }
     */
    async handleJoinRequest(requestId, {
        adminId,
        action,
        reason = null,
        expiresAt = null
    }) {
        try {
            const res = await handleAccessRequest(requestId, {
                adminId,
                action,
                reason,
                expiresAt
            });

            return {
                success: true,
                requestId: res.requestId,
                action: res.action
            };
        } catch (e) {
            return handleServiceError(e);
        }
    },

    /**
     * [REMOVE MEMBER]
     * 프로젝트에서 특정 멤버를 내보냄
     *
     * @param {string} projectId
     * @param {string} memberId
     * @param {object} data
     * {
     *   requesterId: string
     * }
     */
    async removeMember(projectId, memberId, { requesterId } = {}) {
        try {
            const res = await removeMemberRequest(projectId, memberId, {
                requesterId
            });

            return {
                success: true,
                memberId: res.memberId || memberId,
                removedRole: res.removedRole,
                lastEditSessionDeleted: res.lastEditSessionDeleted,
                socketForcedLeaveCount: res.socketForcedLeaveCount,
                updatedAt: res.updatedAt
            };
        } catch (e) {
            return handleServiceError(e);
        }
    },

    /**
     * [UPDATE ROLE]
     * 멤버 권한 변경 및 소유권 이전 처리
     *
     * VIEWER / EDITOR
     *   -> updateMemberRoleRequest 호출
     *
     * OWNER
     *   -> updateOwnerRequest 호출
     *
     * @param {string} projectId
     * @param {string} memberId
     * @param {object} data
     * {
     *   role: 'viewer' | 'editor' | 'owner',
     *   requesterId: string,
     *   confirmTransfer?: boolean
     * }
     */
    async updateRole(projectId, memberId, {
        role,
        requesterId,
        confirmTransfer = false
    }) {
        try {
            const normalizedRole = String(role || '').toLowerCase();

            if (normalizedRole === 'owner') {
                const res = await updateOwnerRequest(projectId, {
                    newOwnerId: memberId,
                    confirmOwnerTransfer: confirmTransfer,
                    requesterId
                });

                return {
                    success: true,
                    memberId: res.newOwnerId || memberId,
                    role: 'owner',
                    previousOwnerId: res.previousOwnerId,
                    ownerId: res.newOwnerId || memberId,
                    newOwnerPreviousRole: res.newOwnerPreviousRole,
                    updatedAt: res.updatedAt
                };
            }

            const res = await updateMemberRoleRequest(projectId, memberId, {
                role: normalizedRole,
                requesterId
            });

            return {
                success: true,
                memberId: res.memberId || memberId,
                role: res.role || normalizedRole,
                oldRole: res.oldRole,
                changed: res.changed,
                lastEditSessionDeleted: res.lastEditSessionDeleted,
                updatedAt: res.updatedAt
            };
        } catch (e) {
            return handleServiceError(e);
        }
    },

    /**
     * [HANDLE REQUEST]
     * 참가 요청 승인/거절 처리
     *
     * @param {string} requestId
     * @param {object} data
     * {
     *   adminId: string,
     *   action: 'ACCEPT' | 'REJECT'
     * }
     */
    async handleJoinRequest(requestId, {
        adminId,
        action
    }) {
        try {
            const res = await handleAccessRequest(requestId, {
                adminId,
                action
            });

            return {
                success: true,
                requestId: res.requestId || requestId,
                action: res.action || action
            };
        } catch (e) {
            return handleServiceError(e);
        }
    },

    async getJoinRequests(projectId) {
        try {
            const res = await getRequestRequest(projectId);

            const requests = (res.pendingMembers || []).map(request => ({
                id: request.requestId,
                userId: request.userId,
                name: request.userName || '사용자',
                email: request.email || '',
                requestedRole: String(request.requestRole || 'viewer').toLowerCase(),
                requestedAt: request.requestedAt || null
            }));

            return {
                success: true,
                requests
            };
        } catch (e) {
            return handleServiceError(e);
        }
    }
};
