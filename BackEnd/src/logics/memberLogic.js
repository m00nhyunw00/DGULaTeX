/**
 * =================================================================
 * [Logic] Member Collaboration Logic
 * 설명: 프로젝트 멤버 권한, 초대 코드, 참여 요청 및 소유권 이전 규칙을 처리함
 * =================================================================
 */
const entryLogic = require('./entryLogic');

const memberLogic = {
    normalizeId: (id) => {
        return entryLogic.normalizeId
            ? entryLogic.normalizeId(id)
            : String(id || '')
                .replace(/^0x/i, '')
                .replace(/-/g, '')
                .trim()
                .toLowerCase();
    },

    normalizeRole: (role) => {
        return String(role || '').trim().toLowerCase();
    },

    bufferToHex: (value) => {
        if (!value) return null;
        if (Buffer.isBuffer(value)) return value.toString('hex');

        return String(value)
            .replace(/^0x/i, '')
            .replace(/-/g, '')
            .trim()
            .toLowerCase();
    },

    hexToBuffer: (id) => {
        return entryLogic.hexToBuffer(id);
    },

    generateBinaryId: () => {
        return entryLogic.generateBinaryId();
    },

    resolveRequesterId: (req) => {
        const candidates = [
            req.headers?.['x-user-id'],
            req.headers?.['x-requester-id'],
            req.user?.uuid,
            req.user?.userUuid,
            req.body?.requesterId,
            req.body?.userId,
            req.user?.id
        ];

        for (const value of candidates) {
            if (!value) continue;
            // [CORE FIX] 먼저 0x를 제거한 뒤 정규화 진행
            const stripped = String(value).replace(/^0x/i, '').trim();
            const clean = memberLogic.normalizeId(stripped);

            // 32자리 Hex UUID만 유효한 것으로 간주
            if (clean && clean.length === 32) {
                return clean;
            }
        }

        return null;
    },

    formatRoleUpdateResponse: ({
        memberId,
        oldRole,
        role,
        ownerId,
        lastEditSessionDeleted = false,
        pdfDeleteRequested = false,
        pdfDeleteResult = null,
        compiledDirDeleteResult = null,
        changed = true
    }) => {
        return {
            success: true,
            changed,
            memberId,
            oldRole,
            role,
            ownerId,
            lastEditSessionDeleted,
            pdfDeleteRequested,
            pdfDeleteResult,
            compiledDirDeleteResult,
            updatedAt: new Date().toISOString()
        };
    },

    formatOwnerTransferResponse: ({
        projectId,
        previousOwnerId,
        newOwnerId,
        newOwnerPreviousRole
    }) => {
        return {
            success: true,
            projectId,
            previousOwnerId,
            previousOwnerRole: 'editor',
            newOwnerId,
            newOwnerPreviousRole,
            newOwnerRole: 'owner',
            ownerId: newOwnerId,
            updatedAt: new Date().toISOString()
        };
    },

    formatRemoveMemberResponse: ({
        projectId,
        memberId,
        removedRole,
        ownerId,
        pdfDeleteResult = null,
        compiledDirDeleteResult = null
    }) => {
        return {
            success: true,
            projectId,
            memberId,
            removedRole,
            ownerId,
            lastEditSessionDeleted: true,
            joinRequestDeleted: true,
            pdfDeleteRequested: true,
            pdfDeleteResult,
            compiledDirDeleteResult,
            updatedAt: new Date().toISOString()
        };
    }
};

module.exports = memberLogic;