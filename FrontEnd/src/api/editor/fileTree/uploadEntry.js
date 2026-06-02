/**
 * =================================================================
 * [API] Upload Entry Request Module
 * 설명: 백엔드 API 호출, 요청 payload 구성, 응답 오류 처리를 담당함
 * =================================================================
 */
const API_BASE_URL = import.meta.env.VITE_API_URL;

export const uploadEntryRequest = async (projectId, formData) => {
    try {
        const url = `${API_BASE_URL}/api/projects/${projectId}/entries/upload`;

        const response = await fetch(url, {
            method: "POST",
            body: formData
        });

        const data = await response.json().catch(() => ({}));

        if (response.ok && data.status === "success") {
            return data;
        }

        const error = new Error(data.message || "업로드 요청에 실패했습니다.");
        error.statusCode = data.statusCode || response.status;
        error.errorLog = data.errorLog || data.message || "";
        throw error;
    } catch (error) {
        throw error;
    }
};