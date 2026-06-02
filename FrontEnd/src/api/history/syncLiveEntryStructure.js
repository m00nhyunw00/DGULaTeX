/**
 * =================================================================
 * [API] Sync Live Entry Structure Request Module
 * 설명: 백엔드 API 호출, 요청 payload 구성, 응답 오류 처리를 담당함
 * =================================================================
 */
const API_BASE_URL = import.meta.env.VITE_API_URL;

export const syncLiveEntryStructureRequest = async (projectId) => {
    try {
        const response = await fetch(
            `${API_BASE_URL}/api/histories/${projectId}/sync/structure`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    // 백엔드 memberLogic.resolveRequesterId에서 인식할 수 있도록 헤더 추가
                    'x-user-id': localStorage.getItem('user_uuid') || ''
                }
            }
        );

        const data = await response.json();

        if (response.ok && data.status === 'success') {
            return data.data;
        }

        const error = new Error(data.message || '실시간 히스토리 구조 동기화에 실패했습니다.');
        error.statusCode = data.statusCode || response.status;
        throw error;
    } catch (error) {
        throw error;
    }
};