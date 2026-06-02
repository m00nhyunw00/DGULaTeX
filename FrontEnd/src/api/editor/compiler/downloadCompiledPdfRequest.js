/**
 * =================================================================
 * [API] Download Compiled Pdf Request Module
 * 설명: 백엔드 API 호출, 요청 payload 구성, 응답 오류 처리를 담당함
 * =================================================================
 */
const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

/**
 * PDF 다운로드 요청
 * downloadTarget:
 * - "mine"   : 현재 사용자가 수동 컴파일한 PDF
 * - "latest" : 프로젝트 내 모든 사용자 중 가장 최신 수동 컴파일 PDF
 */
export const downloadCompiledPdfRequest = async (projectId, {
    downloadTarget = "mine",
    userId,
    fileName = "compiled"
}) => {
    const response = await fetch(
        `${API_BASE_URL}/api/compile/${projectId}/pdf/download`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                downloadTarget,
                userId,
                fileName
            })
        }
    );

    if (!response.ok) {
        let message = "PDF 다운로드에 실패했습니다.";

        try {
            const errorData = await response.json();
            message = errorData.message || message;
        } catch (_) {}

        throw new Error(message);
    }

    const blob = await response.blob();

    const blobUrl = window.URL.createObjectURL(blob);
    const a = document.createElement("a");

    a.href = blobUrl;
    a.download = `${fileName}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();

    window.URL.revokeObjectURL(blobUrl);

    return true;
};