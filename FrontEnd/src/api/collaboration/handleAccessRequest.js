/**
 * =================================================================
 * [API] Handle Access Request Module
 * 설명: 백엔드 API 호출, 요청 payload 구성, 응답 오류 처리를 담당함
 * =================================================================
 */
const API_BASE_URL = import.meta.env.VITE_API_URL;

export const handleAccessRequest = async (
    requestId,
    {
        adminId,
        action,
        reason = null,
        expiresAt = null
    }
) => {
    try {
        const response = await fetch(
            `${API_BASE_URL}/api/members/requests/${requestId}`,
            {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    adminId,
                    action,
                    reason,
                    expiresAt
                })
            }
        );

        const data = await response.json();

        if (response.ok && data.status === 'success') {
            return data.data;
        }

        throw new Error(data.message || '참여 요청 처리 실패');
    } catch (error) {
        throw error;
    }
};