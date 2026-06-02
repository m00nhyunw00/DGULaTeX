/**
 * =================================================================
 * [API] Download Pdf Request Module
 * 설명: 백엔드 API 호출, 요청 payload 구성, 응답 오류 처리를 담당함
 * =================================================================
 */
const API_BASE_URL =
    import.meta.env.VITE_API_URL || 'http://localhost:5000';

/**
 * 최신 컴파일 PDF 다운로드 요청
 *
 * POST /api/compile/:projectId/download/pdf
 */
export const downloadPdfRequest = async (
    projectId,
    {
        downloadTarget = 'latest',
        userId,
        fileName
    } = {}
) => {
    try {
        const response = await fetch(
            `${API_BASE_URL}/api/compile/${projectId}/download/pdf`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    downloadTarget,
                    userId,
                    fileName
                })
            }
        );

        if (!response.ok) {
            let errorMessage = 'PDF 다운로드에 실패했습니다.';

            try {
                const errorData = await response.json();
                errorMessage =
                    errorData.message || errorMessage;
            } catch {
                // ignore json parse fail
            }

            throw new Error(errorMessage);
        }

        const blob = await response.blob();

        const disposition =
            response.headers.get('Content-Disposition');

        let extractedFileName = `${fileName || 'compiled'}.pdf`;

        if (disposition) {
            const utf8Match = disposition.match(
                /filename\*=UTF-8''([^;]+)/
            );

            const asciiMatch = disposition.match(
                /filename="?([^"]+)"?/
            );

            if (utf8Match?.[1]) {
                extractedFileName = decodeURIComponent(
                    utf8Match[1]
                );
            } else if (asciiMatch?.[1]) {
                extractedFileName = asciiMatch[1];
            }
        }

        return {
            success: true,
            blob,
            fileName: extractedFileName
        };
    } catch (error) {
        return {
            success: false,
            message:
                error.message ||
                'PDF 다운로드 중 오류가 발생했습니다.'
        };
    }
};