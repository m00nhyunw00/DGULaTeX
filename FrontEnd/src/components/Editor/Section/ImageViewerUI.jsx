/**
 * =================================================================
 * [Component] Image Viewer UI Component
 * 설명: 사용자 인터페이스 렌더링과 화면 상호작용을 담당함
 * =================================================================
 */
import React from 'react';

function ImageViewerUI({
    activeFileId,
    fileName,
    imageUrl,
    isFileContentLoaded = true
}) {
    return (
        <main className="editor-section">
            <div className="editor-toolbar border-bottom p-2 d-flex align-items-center justify-content-between">
                <span className="small fw-bold text-muted">
                    {fileName || '이미지 파일'}
                </span>
            </div>

            <div className="image-viewer-wrapper">
                {!activeFileId ? (
                    <div className="image-viewer-placeholder">
                        파일을 선택해주세요.
                    </div>
                ) : !isFileContentLoaded ? (
                    <div className="image-viewer-placeholder">
                        이미지를 불러오는 중입니다...
                    </div>
                ) : imageUrl ? (
                    <div className="image-viewer-canvas">
                        <img
                            src={imageUrl}
                            alt={fileName || 'preview'}
                            className="image-viewer-img"
                        />
                    </div>
                ) : (
                    <div className="image-viewer-placeholder">
                        <div className="image-viewer-icon">🖼️</div>
                        <div className="image-viewer-title">
                            이미지 미리보기
                        </div>
                        <div className="image-viewer-desc">
                            아직 이미지 조회 API가 연결되지 않았습니다.
                            <br />
                            UI 연결 후 실제 이미지 URL만 넣으면 됩니다.
                        </div>
                    </div>
                )}
            </div>
        </main>
    );
}

export default ImageViewerUI;