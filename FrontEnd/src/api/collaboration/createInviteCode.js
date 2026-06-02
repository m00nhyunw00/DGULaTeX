/**
 * =================================================================
 * [API] Create Invite Code Request Module
 * 설명: 백엔드 API 호출, 요청 payload 구성, 응답 오류 처리를 담당함
 * =================================================================
 */
const API_BASE_URL = import.meta.env.VITE_API_URL;

export const createInviteCodeRequest = async (
    projectId,
    { role, userId, regenerate = false }
) => {
    try {
        const response = await fetch(
            `${API_BASE_URL}/api/projects/${projectId}/invites`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    role,
                    userId,
                    regenerate
                })
            }
        );

        const data = await response.json();

        if (response.ok && data.status === 'success') {
            return data.data;
        }

        throw new Error(data.message || '초대 코드 생성 실패');
    } catch (error) {
        throw error;
    }
};