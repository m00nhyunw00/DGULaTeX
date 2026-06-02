/**
 * =================================================================
 * [API] Move Entry Request Module
 * 설명: 백엔드 API 호출, 요청 payload 구성, 응답 오류 처리를 담당함
 * =================================================================
 */
const API_BASE_URL = import.meta.env.VITE_API_URL;

export const moveEntryRequest = async (projectId, idOrIds, moveData) => {
    try {
        const isArray = Array.isArray(idOrIds);
        
        const url = isArray 
            ? `${API_BASE_URL}/api/projects/${projectId}/entries/move`
            : `${API_BASE_URL}/api/projects/${projectId}/entries/${idOrIds}/move`;

        const options = {
            method: 'PATCH',
            headers: { 
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            }
        };

        if (isArray) {
            options.body = JSON.stringify({ 
                entryIds: idOrIds,
                parentId: moveData.parentId 
            });
        } else {
            options.body = JSON.stringify({ 
                parentId: moveData.parentId 
            });
        }

        const response = await fetch(url, options);
        
        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            const error = new Error(errData.message || "이동 요청 실패");
            error.statusCode = response.status;
            throw error;
        }

        const data = await response.json();
        
        if (data.status === "success") {
            return data;
        }
        
        const error = new Error(data.message || "이동 요청 실패");
        throw error;
    } catch (error) {
        throw error;
    }
};