/**
 * =================================================================
 * [API] Apply Snippet Request Module
 * 설명: 백엔드 API 호출, 요청 payload 구성, 응답 오류 처리를 담당함
 * =================================================================
 */
const API_BASE_URL = import.meta.env.VITE_API_URL;

/**
 * 서버에 스니펫 템플릿 요청
 * @param {string} projectId - 프로젝트 고유 ID
 * @param {string} fileId - 현재 편집 중인 파일 ID
 * @param {object} snippetData - { snippetType, cursorLine, cursorColumn }
 */
export const applySnippetRequest = async (projectId, fileId, snippetData) => {
    /* ---------------------------------------------------------
     * SECTION 1: Mock Response (Temporary)
     * --------------------------------------------------------- */
    return new Promise((resolve, reject) => {
        setTimeout(() => {
            const isMockSuccess = true;

            if (isMockSuccess) {
                // 타입에 따른 가짜 템플릿 생성 로직
                let text = "";
                if (snippetData.snippetType === 'equation') {
                    text = "\\begin{equation}\n\n\\end{equation}";
                } else if (snippetData.snippetType === 'table') {
                    text = "\\begin{table}\n  \\centering\n  \\begin{tabular}{cc}\n  \\end{tabular}\n\\end{table}";
                }

                resolve({
                    success: true,
                    fileId: fileId,
                    snippetType: snippetData.snippetType,
                    insertedText: text,
                    updatedAt: new Date().toISOString()
                });
            } else {
                // [실패 명세 반영]
                reject({
                    success: false,
                    statusCode: 404,
                    message: "NOT_FOUND",
                    errorLog: "No snippet template matched the requested snippetType"
                });
            }
        }, 300);
    });

    /* ---------------------------------------------------------
     * SECTION 2: Real Backend Implementation (Commented Out)
     * --------------------------------------------------------- */
    /*
    try {
        const response = await fetch(`${API_BASE_URL}/api/projects/${projectId}/files/${fileId}/snippets`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(snippetData),
        });

        const data = await response.json();

        if (response.ok && data.success) {
            return data;
        } else {
            const serverError = new Error(data.errorLog || data.message || "스니펫 적용 실패");
            serverError.statusCode = data.statusCode || response.status;
            serverError.errorCode = data.message;
            throw serverError;
        }
    } catch (error) {
        if (error.statusCode) throw error;
        throw new Error("네트워크 에러: 서버 연결을 확인하세요.");
    }
    */
};