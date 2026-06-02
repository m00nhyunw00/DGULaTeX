/**
 * =================================================================
 * [API] Download Project Request Module
 * 설명: 백엔드 API 호출, 요청 payload 구성, 응답 오류 처리를 담당함
 * =================================================================
 */
const API_BASE_URL = import.meta.env.VITE_API_URL;

const getFileNameFromDisposition = (contentDisposition) => {
    if (!contentDisposition) return null;

    const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
    if (utf8Match?.[1]) return decodeURIComponent(utf8Match[1]);

    const normalMatch = contentDisposition.match(/filename="?([^"]+)"?/i);
    if (normalMatch?.[1]) return normalMatch[1];

    return null;
};

export const downloadProjectRequest = async (projectId, fallbackFileName = "project.zip") => {
    const url = `${API_BASE_URL}/api/projects/${projectId}/download`;

    const response = await fetch(url, {
        method: "GET"
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const error = new Error(errorData.message || "프로젝트 다운로드에 실패했습니다.");
        error.statusCode = response.status;
        throw error;
    }

    const blob = await response.blob();
    const contentDisposition = response.headers.get("Content-Disposition");

    const fileName =
        getFileNameFromDisposition(contentDisposition) ||
        fallbackFileName;

    return {
        status: "success",
        blob,
        fileName
    };
};