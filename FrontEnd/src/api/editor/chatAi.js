/**
 * =================================================================
 * [API] Chat Ai Request Module
 * 설명: 백엔드 API 호출, 요청 payload 구성, 응답 오류 처리를 담당함
 * =================================================================
 */
const API_BASE_URL = import.meta.env.VITE_API_URL;

export const chatRequest = async (payloadOrMessages, latexContext) => {
    try {
        const body = Array.isArray(payloadOrMessages)
            ? { messages: payloadOrMessages, latexContext }
            : payloadOrMessages;

        const response = await fetch(`${API_BASE_URL}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body || {}),
        });

        const data = await response.json();

        if (response.ok && data.success) {
            return data;
        } else {
            const serverError = new Error(data.detail || data.message || "답변 생성 실패");
            serverError.debugCode = data.debugCode;
            throw serverError;
        }
    } catch (error) {
        if (error.debugCode) throw error;
        throw new Error("네트워크 에러: AI 서버 연결을 확인하세요.");
    }
};
