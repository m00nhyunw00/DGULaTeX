/**
 * =================================================================
 * [Controller] Chat Ai Controller
 * 설명: 요청 값 검증, 도메인 로직 호출, HTTP 응답 생성을 담당함
 * =================================================================
 */
const chatLogic = require('../logics/chatAiLogic');

const chatController = {
    /**
     * AI 답변 처리 (POST /api/chat)
     */
    processChat: async (req, res) => {

        try {
            const {
                messages = [],
                latexContext = '',
                memorySummary = ''
            } = req.body || {};

            const reply = await chatLogic.generateAIReply(messages, latexContext, {
                memorySummary
            });

            return res.status(200).json({
                success: true,
                reply
            });

        } catch (error) {
            console.error("[CHAT ERROR]", error.message);
            const statusCode = error.statusCode || error.status || 500;
            
            return res.status(statusCode).json({
                success: false,
                message: "AI 비서와 연결하는 중 문제가 발생했습니다.",
                detail: error.statusCode ? error.message : '',
                debugCode: error.debugCode || error.name
            });
        }
    }
};

module.exports = chatController;
