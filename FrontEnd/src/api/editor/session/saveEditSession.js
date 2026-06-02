/**
 * =================================================================
 * [API] Save Edit Session Request Module
 * 설명: 백엔드 API 호출, 요청 payload 구성, 응답 오류 처리를 담당함
 * =================================================================
 */
const API_BASE_URL = import.meta.env.VITE_API_URL;

export const saveEditSessionRequest = async (projectId, sessionData) => {
    const response = await fetch(`${API_BASE_URL}/api/projects/${projectId}/entries/session`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sessionData)
    });

    const data = await response.json();

    if (response.ok && data.status === 'success') return data;

    throw new Error(data.message || '세션 저장 실패');
};
