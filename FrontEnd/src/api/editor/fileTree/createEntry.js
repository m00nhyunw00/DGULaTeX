/**
 * =================================================================
 * [API] Create Entry Request Module
 * 설명: 백엔드 API 호출, 요청 payload 구성, 응답 오류 처리를 담당함
 * =================================================================
 */
const API_BASE_URL = import.meta.env.VITE_API_URL;

export const createEntryRequest = async (projectId, entryData) => {
    try {
        const response = await fetch(`${API_BASE_URL}/api/projects/${projectId}/entries`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            // entryData: { title, isFolder, parentId }
            body: JSON.stringify(entryData),
        });
        
        const data = await response.json();
        
        // 201 Created 응답과 status: "success" 확인
        if (response.ok && data.status === "success") {
            return data;
        }
        
        throw new Error(data.message || "생성 실패");
    } catch (error) {
        throw error;
    }
};
