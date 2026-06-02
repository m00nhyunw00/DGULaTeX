/**
 * =================================================================
 * [API] Update Project Title Request Module
 * 설명: 백엔드 API 호출, 요청 payload 구성, 응답 오류 처리를 담당함
 * =================================================================
 */
const API_BASE_URL = import.meta.env.VITE_API_URL;

export const updateProjectTitleRequest = async (projectId, title) => {
    try {
        const response = await fetch(`${API_BASE_URL}/api/projects/${projectId}`, {
            method: 'PATCH',
            headers: { 
                'Content-Type': 'application/json' 
            },
            body: JSON.stringify({ title: title.trim() }) // 백엔드 req.body.title 매핑 (안전하게 trim 추가)
        });
        
        const data = await response.json();
        
        // 백엔드 명세서에 맞춘 성공 처리 (status: "success")
        if (response.ok && data.status === "success") {
            return data; // 반환 형태: { status, statusCode, message }
        }
        
        throw new Error(data.message || "프로젝트 이름 변경에 실패했습니다.");
    } catch (error) {
        throw error;
    }
};