/**
 * =================================================================
 * [API] Get Last Compiled Pdf Request Module
 * 설명: 백엔드 API 호출, 요청 payload 구성, 응답 오류 처리를 담당함
 * =================================================================
 */
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export const getLastCompiledPdfRequest = async (projectId, userId) => {
    const response = await fetch(
        `${API_BASE_URL}/api/compile/${projectId}/last-pdf?userId=${encodeURIComponent(userId)}`
    );

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        return {
            success: false,
            message: data.message || '마지막 컴파일 PDF 조회 실패',
            data
        };
    }

    return data;
};