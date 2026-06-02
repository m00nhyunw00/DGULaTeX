/**
 * =================================================================
 * [API] Get Members Request Module
 * 설명: 백엔드 API 호출, 요청 payload 구성, 응답 오류 처리를 담당함
 * =================================================================
 */
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export const getMembersRequest = async (projectId) => {
    const response = await fetch(`${API_BASE_URL}/api/members/project/${projectId}`, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json'
        }
    });

    const data = await response.json().catch(() => ({}));

    if (response.ok && data.status === 'success') {
        return data.data;
    }

    const error = new Error(data.message || '프로젝트 멤버 조회에 실패했습니다.');
    error.statusCode = data.statusCode || response.status;
    throw error;
};