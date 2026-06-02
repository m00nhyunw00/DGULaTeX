/**
 * =================================================================
 * [API] Request Access Request Module
 * 설명: 백엔드 API 호출, 요청 payload 구성, 응답 오류 처리를 담당함
 * =================================================================
 */
const API_BASE_URL = import.meta.env.VITE_API_URL;

export const requestAccessRequest = async (
    inviteCode,
    { userId }
) => {
    try {
        const response = await fetch(
            `${API_BASE_URL}/api/members/invites/${inviteCode}/join`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    userId
                })
            }
        );

        const data = await response.json();

        if (response.ok && data.status === 'success') {
            return data.data;
        }

        throw new Error(data.message || '프로젝트 참여 신청 실패');
    } catch (error) {
        throw error;
    }
};