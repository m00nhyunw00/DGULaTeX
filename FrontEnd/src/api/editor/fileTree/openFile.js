/**
 * =================================================================
 * [API] Open File Request Module
 * 설명: 백엔드 API 호출, 요청 payload 구성, 응답 오류 처리를 담당함
 * =================================================================
 */
const API_BASE_URL = import.meta.env.VITE_API_URL;

export const openFileRequest = async (projectId, entryId, sessionData) => {
    /* ---------------------------------------------------------
     * SECTION 1: Mock Response (Temporary)
     * --------------------------------------------------------- */
    return new Promise((resolve, reject) => {
        setTimeout(() => {
            const isMockSuccess = true;
            if (isMockSuccess) {
                resolve({ 
                    success: true, 
                    fileId: entryId, 
                    currentContent: "\\section{Introduction}\n\nHello LaTeX!", 
                    joinedRoomId: `room_${entryId}`,
                    updatedAt: new Date().toISOString()
                });
            } else {
                reject({
                    success: false,
                    statusCode: 403,
                    message: "ACCESS_DENIED",
                    errorLog: "You do not have permission to open this file"
                });
            }
        }, 500);
    });

    /* ---------------------------------------------------------
     * SECTION 2: Real Backend Implementation (Commented Out)
     * --------------------------------------------------------- */
    /*
    try {
        const response = await fetch(`${API_BASE_URL}/api/projects/${projectId}/entries/${entryId}`, {
            method: 'GET'
        });
        const data = await response.json();
        if (response.ok && data.success) return data;
        
        const serverError = new Error(data.errorLog || data.message || "요청 실패");
        serverError.statusCode = data.statusCode || response.status;
        serverError.errorCode = data.message;
        throw serverError;
    } catch (error) {
        if (error.statusCode) throw error;
        throw new Error("네트워크 에러: 서버 연결을 확인하세요.");
    }
    */
};