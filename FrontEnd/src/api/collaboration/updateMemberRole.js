/**
 * =================================================================
 * [API] Update Member Role Request Module
 * 설명: 백엔드 API 호출, 요청 payload 구성, 응답 오류 처리를 담당함
 * =================================================================
 */
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export const updateMemberRoleRequest = async (projectId, memberId, data = {}) => {
    const response = await fetch(
        `${API_BASE_URL}/api/members/project/${projectId}/${memberId}/role`,
        {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                role: data.role,
                requesterId: data.requesterId || data.userId
            })
        }
    );

    const result = await response.json().catch(() => ({}));

    if (response.ok) {
        return result;
    }

    const error = new Error(
        result.message ||
        result.errorLog ||
        '멤버 권한 변경에 실패했습니다.'
    );

    error.statusCode = result.statusCode || response.status;
    error.errorCode = result.errorCode;
    error.errorLog = result.errorLog;

    throw error;
};