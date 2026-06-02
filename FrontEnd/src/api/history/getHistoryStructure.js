/**
 * =================================================================
 * [API] Get History Structure Request Module
 * 설명: 백엔드 API 호출, 요청 payload 구성, 응답 오류 처리를 담당함
 * =================================================================
 */
const API_BASE_URL = import.meta.env.VITE_API_URL;

export const getHistoryStructureRequest = async (historyId, projectId) => {
    try {
        const response = await fetch(
            `${API_BASE_URL}/api/histories/${historyId}/${projectId}/versions`,
            {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            }
        );

        const data = await response.json();

        if (response.ok && data.status === 'success') {
            return data.data;
        }

        const error = new Error(data.message || '히스토리 파일 구조 조회에 실패했습니다.');
        error.statusCode = data.statusCode || response.status;
        throw error;
    } catch (error) {
        throw error;
    }
};