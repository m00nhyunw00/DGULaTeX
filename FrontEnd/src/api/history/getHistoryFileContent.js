/**
 * =================================================================
 * [API] Get History File Content Request Module
 * 설명: 백엔드 API 호출, 요청 payload 구성, 응답 오류 처리를 담당함
 * =================================================================
 */
const API_BASE_URL = import.meta.env.VITE_API_URL;

export const getHistoryFileContentRequest = async (historyId, projectId, entryId) => {
    try {
        const response = await fetch(
            `${API_BASE_URL}/api/histories/${historyId}/${projectId}/versions/${entryId}`,
            {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'x-user-id': localStorage.getItem('user_uuid') || ''
                }
            }
        );

        const data = await response.json();

        if (response.ok && data.status === 'success') {
            return data.data;
        }

        const error = new Error(data.message || '히스토리 파일 내용을 불러오지 못했습니다.');
        error.statusCode = data.statusCode || response.status;
        throw error;
    } catch (error) {
        throw error;
    }
};