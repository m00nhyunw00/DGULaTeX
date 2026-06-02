/**
 * =================================================================
 * [API] Update File Content Request Module
 * 설명: 백엔드 API 호출, 요청 payload 구성, 응답 오류 처리를 담당함
 * =================================================================
 */
const API_BASE_URL = import.meta.env.VITE_API_URL;

export const updateFileContentRequest = async (projectId, entryId, content) => {
    try {
        const response = await fetch(`${API_BASE_URL}/api/projects/${projectId}/entries/${entryId}/content`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content }) // 백엔드의 req.body.content와 매핑
        });
        
        const data = await response.json();
        
        // 백엔드 명세서에 맞춘 성공 처리
        if (response.ok && data.status === "success") {
            return data; // 반환 형태: { status, statusCode, message }
        }
        
        throw new Error(data.message || "파일 내용을 저장하는데 실패했습니다.");
    } catch (error) {
        throw error;
    }
};