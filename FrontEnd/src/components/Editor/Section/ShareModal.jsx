/**
 * =================================================================
 * [Component] Project Share Modal
 * 설명: 권한별 초대 코드를 조회, 재발급, 복사하는 프로젝트 공유 모달을 렌더링함
 * =================================================================
 */
import React, { useEffect, useState } from 'react';

function ShareModal({
    isOpen,
    onClose,
    projectName,
    onCreateInviteCode
}) {
    const [editorInviteCode, setEditorInviteCode] = useState('');
    const [viewerInviteCode, setViewerInviteCode] = useState('');
    const [isLoadingRole, setIsLoadingRole] = useState('');

    const loadInviteCode = async (role, { regenerate = false } = {}) => {
        if (!onCreateInviteCode) return;

        setIsLoadingRole(role);

        try {
            const result = await onCreateInviteCode(role, { regenerate });

            if (!result.success) {
                alert(result.message || '초대 코드 조회에 실패했습니다.');
                return;
            }

            if (role === 'editor') {
                setEditorInviteCode(result.inviteCode || '');
            }

            if (role === 'viewer') {
                setViewerInviteCode(result.inviteCode || '');
            }
        } finally {
            setIsLoadingRole('');
        }
    };

    useEffect(() => {
        if (!isOpen) return;

        loadInviteCode('editor');
        loadInviteCode('viewer');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen]);

    if (!isOpen) return null;

    const copyWithFallback = (text) => {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.top = '-9999px';
        textarea.style.left = '-9999px';

        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        textarea.setSelectionRange(0, textarea.value.length);

        try {
            return document.execCommand('copy');
        } finally {
            document.body.removeChild(textarea);
        }
    };

    const copyToClipboard = async (text) => {
        try {
            if (navigator.clipboard && window.isSecureContext) {
                await navigator.clipboard.writeText(text);
            } else if (!copyWithFallback(text)) {
                throw new Error('COPY_FAILED');
            }

            alert('초대 코드가 복사되었습니다.');
        } catch {
            alert('복사에 실패했습니다. 코드를 직접 복사해주세요.');
        }
    };

    return (
        <div className="custom-modal-overlay">
            <div className="share-modal-box shadow-lg animate__animated animate__zoomIn">
                <div className="share-modal-header">
                    <div>
                        <h5 className="share-modal-title">프로젝트 공유하기</h5>
                        <p className="share-modal-subtitle">
                            {projectName} 프로젝트에 초대할 코드를 확인하세요.
                        </p>
                    </div>

                    <button className="share-modal-close-btn" onClick={onClose}>
                        &times;
                    </button>
                </div>

                <div className="share-modal-content">
                    <div className="share-link-card editor">
                        <div className="share-link-info">
                            <div className="share-role-label">Editor 초대 코드</div>
                            <div className="share-role-desc">
                                문서를 함께 편집할 수 있는 권한입니다.
                            </div>
                        </div>

                        <div className="share-link-row">
                            <div className="share-link-input-group">
                                <input
                                    className="form-control share-link-input"
                                    value={editorInviteCode}
                                    readOnly
                                    placeholder="초대 코드 발급 중..."
                                />

                                <button
                                    type="button"
                                    className="share-refresh-btn"
                                    title="Editor 코드 재발급"
                                    disabled={isLoadingRole === 'editor'}
                                    onClick={() => loadInviteCode('editor', { regenerate: true })}
                                >
                                    ↻
                                </button>
                            </div>

                            <button
                                className="btn btn-primary share-copy-btn"
                                disabled={!editorInviteCode}
                                onClick={() => copyToClipboard(editorInviteCode)}
                            >
                                복사
                            </button>
                        </div>
                    </div>

                    <div className="share-link-card viewer">
                        <div className="share-link-info">
                            <div className="share-role-label">Viewer 초대 코드</div>
                            <div className="share-role-desc">
                                문서를 조회만 할 수 있는 권한입니다.
                            </div>
                        </div>

                        <div className="share-link-row">
                            <div className="share-link-input-group">
                                <input
                                    className="form-control share-link-input"
                                    value={viewerInviteCode}
                                    readOnly
                                    placeholder="초대 코드 발급 중..."
                                />

                                <button
                                    type="button"
                                    className="share-refresh-btn"
                                    title="Viewer 코드 재발급"
                                    disabled={isLoadingRole === 'viewer'}
                                    onClick={() => loadInviteCode('viewer', { regenerate: true })}
                                >
                                    ↻
                                </button>
                            </div>

                            <button
                                className="btn btn-success share-copy-btn"
                                disabled={!viewerInviteCode}
                                onClick={() => copyToClipboard(viewerInviteCode)}
                            >
                                복사
                            </button>
                        </div>
                    </div>
                </div>

                <div className="share-modal-footer">
                    <button className="btn btn-light px-4" onClick={onClose}>
                        닫기
                    </button>
                </div>
            </div>
        </div>
    );
}

export default ShareModal;
