/**
 * =================================================================
 * [Component] AIChat UI Component
 * 설명: 사용자 인터페이스 렌더링과 화면 상호작용을 담당함
 * =================================================================
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';


const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const getChatSizeBounds = () => {
    if (typeof window === "undefined") {
        return { minWidth: 360, maxWidth: 760, minHeight: 360, maxHeight: 640 };
    }

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const minWidth = Math.min(360, Math.max(300, viewportWidth - 32));
    const maxWidth = Math.max(minWidth, Math.min(920, viewportWidth - 40));
    const minHeight = Math.min(360, Math.max(300, viewportHeight - 120));
    const maxHeight = Math.max(minHeight, viewportHeight - 120);

    return { minWidth, maxWidth, minHeight, maxHeight };
};

const getResponsiveChatSize = () => {
    if (typeof window === "undefined") {
        return { width: 700, height: 560 };
    }

    const bounds = getChatSizeBounds();
    const compactWidth = window.innerWidth < 900 ? window.innerWidth - 40 : window.innerWidth * 0.42;

    return {
        width: Math.round(clamp(compactWidth, bounds.minWidth, bounds.maxWidth)),
        height: Math.round(clamp(window.innerHeight * 0.72, bounds.minHeight, bounds.maxHeight))
    };
};

function AIChatUI({ 
    isOpen, 
    toggleChat, 
    input, 
    setInput, 
    chatLog, 
    handleSend, 
    isLoading 
}) {
    const messagesRef = useRef(null);
    const inputRef = useRef(null);
    const resizeStateRef = useRef(null);
    const hasOpenedRef = useRef(false);
    const [chatSize, setChatSize] = useState(getResponsiveChatSize);


    useEffect(() => {
        if (!isOpen || hasOpenedRef.current) return;

        hasOpenedRef.current = true;
        setChatSize(getResponsiveChatSize());
    }, [isOpen]);

    useEffect(() => {
        const handleViewportResize = () => {
            const bounds = getChatSizeBounds();

            setChatSize((prev) => ({
                width: Math.round(clamp(prev.width, bounds.minWidth, bounds.maxWidth)),
                height: Math.round(clamp(prev.height, bounds.minHeight, bounds.maxHeight))
            }));
        };

        window.addEventListener("resize", handleViewportResize);
        return () => window.removeEventListener("resize", handleViewportResize);
    }, []);

    useEffect(() => {
        const handlePointerMove = (event) => {
            const resizeState = resizeStateRef.current;
            if (!resizeState) return;

            const bounds = getChatSizeBounds();
            const nextWidth = resizeState.startWidth + resizeState.startX - event.clientX;
            const nextHeight = resizeState.startHeight + event.clientY - resizeState.startY;

            setChatSize({
                width: Math.round(clamp(nextWidth, bounds.minWidth, bounds.maxWidth)),
                height: Math.round(clamp(nextHeight, bounds.minHeight, bounds.maxHeight))
            });
        };

        const stopResize = () => {
            resizeStateRef.current = null;
            document.body.classList.remove("ai-chat-resizing");
        };

        window.addEventListener("pointermove", handlePointerMove);
        window.addEventListener("pointerup", stopResize);
        window.addEventListener("pointercancel", stopResize);

        return () => {
            window.removeEventListener("pointermove", handlePointerMove);
            window.removeEventListener("pointerup", stopResize);
            window.removeEventListener("pointercancel", stopResize);
            document.body.classList.remove("ai-chat-resizing");
        };
    }, []);

    const handleResizeStart = useCallback((event) => {
        event.preventDefault();
        resizeStateRef.current = {
            startX: event.clientX,
            startY: event.clientY,
            startWidth: chatSize.width,
            startHeight: chatSize.height
        };
        document.body.classList.add("ai-chat-resizing");
    }, [chatSize.height, chatSize.width]);

    useEffect(() => {
        const node = messagesRef.current;
        if (!node) return;

        const scrollToBottom = () => {
            node.scrollTo({ top: node.scrollHeight, behavior: 'smooth' });
        };

        scrollToBottom();
        const frameId = window.requestAnimationFrame(scrollToBottom);
        const timerId = window.setTimeout(scrollToBottom, 80);

        return () => {
            window.cancelAnimationFrame(frameId);
            window.clearTimeout(timerId);
        };
    }, [chatLog.length, chatLog, isLoading, isOpen]);

    useEffect(() => {
        const node = inputRef.current;
        if (!node) return;

        node.style.height = 'auto';
        node.style.height = `${Math.min(node.scrollHeight, 110)}px`;
    }, [input]);

    const handleInputKeyDown = (e) => {
        if (e.key !== 'Enter' || e.shiftKey) return;
        e.preventDefault();
        handleSend(e);
    };

    return (
        <div className={`ai-chat-overlay-wrapper ${isOpen ? 'active' : ''}`}>
            {/* 1. AI 채팅 팝업 (Overlay) */}
            <div
                className="ai-chat-popup shadow-lg"
                style={{ width: chatSize.width, height: chatSize.height }}
            >
                <button
                    type="button"
                    className="ai-chat-resize-handle"
                    onPointerDown={handleResizeStart}
                    aria-label="채팅창 크기 조절"
                    title="채팅창 크기 조절"
                />
                <div className="ai-chat-header d-flex justify-content-between align-items-center">
                    <div className="d-flex align-items-center gap-2">
                        <span className="ai-sparkle-icon">✨</span>
                        <strong className="chat-title-text">Chat DguLaTeX</strong>
                    </div>
                    <button className="btn-close-chat-ui" onClick={toggleChat}>&times;</button>
                </div>

                <div className="ai-chat-messages" ref={messagesRef}>
                    {chatLog.length === 0 && (
                        <div className="text-center text-muted mt-5 px-3">
                            <p className="empty-chat-msg">
                                LaTeX 문법 수정이나 수식 작성을 도와드릴까요?<br/>
                                아래에 질문을 입력해주세요.
                            </p>
                        </div>
                    )}
                    {chatLog.map((m, i) => (
                        <div key={i} className={`chat-bubble-wrapper ${m.role}`}>
                            <div className={`chat-bubble ${m.role}`}>
                                {m.content}
                            </div>
                        </div>
                    ))}
                    {isLoading && (
                        <div className="chat-bubble-wrapper assistant">
                            <div className="chat-bubble assistant loading-dots" aria-label="AI가 답변을 작성하는 중입니다">
                                <span></span><span></span><span></span>
                            </div>
                        </div>
                    )}
                </div>

                <div className="ai-chat-footer">
                    <form className="ai-chat-input-box" onSubmit={handleSend}>
                        <textarea
                            ref={inputRef}
                            className="chat-input-element"
                            rows={1}
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={handleInputKeyDown}
                            placeholder="무엇이든 물어보세요..."
                        />
                        <button type="submit" className="chat-submit-btn" disabled={isLoading || !input.trim()}>
                            전송
                        </button>
                    </form>
                </div>
            </div>

            {/* 2. 플로팅 버튼 (FAB) - 항상 최상단 우측 하단 */}
            <button 
                className={`ai-chat-fab-btn ${isOpen ? 'btn-active' : ''}`} 
                onClick={toggleChat}
                title="AI 비서 열기"
            >
                <span className="fab-icon-symbol">{isOpen ? '×' : '✨'}</span>
            </button>
        </div>
    );
}

export default AIChatUI;