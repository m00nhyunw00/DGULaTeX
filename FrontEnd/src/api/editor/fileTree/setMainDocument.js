/**
 * =================================================================
 * [API] Set Main Document Request Module
 * 설명: 백엔드 API 호출, 요청 payload 구성, 응답 오류 처리를 담당함
 * =================================================================
 */
const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

export const setMainDocumentRequest = async (projectId, entryId) => {
    try {
        const response = await fetch(`${API_BASE_URL}/api/projects/${projectId}/main-entry`, {
            method: 'PATCH',
            headers: { 
                'Content-Type': 'application/json' 
            },
            body: JSON.stringify({ 
                mainEntryId: String(entryId) 
            }),
        });

        const data = await response.json();

        if (response.ok && (data.status === "success" || data.success)) {
            return {
                success: true,
                message: data.message || "메인 파일이 성공적으로 변경되었습니다.",
                mainEntryId: entryId 
            };
        }
        
        const serverError = new Error(data.errorLog || data.message || "메인 파일 변경 실패");
        serverError.statusCode = data.statusCode || response.status;
        serverError.errorCode = data.message || "NOT_FOUND";
        throw serverError;

    } catch (error) {
        if (error.statusCode) throw error;
        throw new Error(error.message || "네트워크 에러: 백엔드 서버 연결을 확인하세요.");
    }
};