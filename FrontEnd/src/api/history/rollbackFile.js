/**
 * =================================================================
 * [API] Rollback File Request Module
 * 설명: 백엔드 API 호출, 요청 payload 구성, 응답 오류 처리를 담당함
 * =================================================================
 */
const API_BASE_URL = import.meta.env.VITE_API_URL;

export const rollbackFileRequest = async (
    projectId,
    entryId,
    {
        targetVersionId,
        requesterId
    }
) => {
    try {
        const response = await fetch(
            `${API_BASE_URL}/api/histories/projects/${projectId}/entries/${entryId}/rollback`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    targetVersionId,
                    requesterId
                })
            }
        );

        const data = await response.json();

        if (response.ok && data.status === 'success') {
            return data.data;
        }

        const error = new Error(data.message || '파일 롤백에 실패했습니다.');
        error.statusCode = data.statusCode || response.status;
        throw error;
    } catch (error) {
        throw error;
    }
};