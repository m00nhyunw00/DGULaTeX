/**
 * =================================================================
 * [API] Delete Entry Request Module
 * 설명: 백엔드 API 호출, 요청 payload 구성, 응답 오류 처리를 담당함
 * =================================================================
 */
const API_BASE_URL = import.meta.env.VITE_API_URL;

export const deleteEntryRequest = async (projectId, idOrIds) => {
    try {
        const isArray = Array.isArray(idOrIds);
        
        /**
         * [규격 보정]
         * 배열이면 URL 파라미터 없이 Body에 담아 라우터의 'router.delete('/', ...)' 매핑
         * 단일 ID면 URL 파라미터에 얹어서 'router.delete('/:entryId', ...)' 매핑
         */
        const url = isArray 
            ? `${API_BASE_URL}/api/projects/${projectId}/entries`
            : `${API_BASE_URL}/api/projects/${projectId}/entries/${idOrIds}`;

        const options = {
            method: 'DELETE',
            headers: { 
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            }
        };

        // 배열 규격일 때만 body에 entryIds 리스트를 탑재
        if (isArray) {
            options.body = JSON.stringify({ entryIds: idOrIds });
        }

        const response = await fetch(url, options);
        const data = await response.json();
        
        if (response.ok && data.status === "success") {
            return data;
        }
        
        const error = new Error(data.message || "삭제 요청 실패");
        error.statusCode = response.status;
        throw error;
    } catch (error) {
        throw error;
    }
};