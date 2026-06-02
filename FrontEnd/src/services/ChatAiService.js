/**
 * =================================================================
 * [Service] AI Chat Client Service
 * 설명: 에디터 AI 채팅 API 호출과 응답 메시지 정규화를 담당함
 * =================================================================
 */
import { chatRequest } from '../api/editor/chatAi';

export const ChatService = {
    async askAI(payloadOrMessages, latexContext) {
        try {
            const payload = Array.isArray(payloadOrMessages)
                ? { messages: payloadOrMessages, latexContext }
                : payloadOrMessages;

            const data = await chatRequest(payload);

            if (data && data.success) {
                return {
                    success: true,
                    reply: data.reply
                };
            }
            return { success: false, message: "잘못된 응답 형식입니다." };

        } catch (error) {
            throw error;
        }
    }
};
