/**
 * =================================================================
 * [Component] Image / PDF Viewer UI Component
 * 설명: 이미지와 PDF asset 파일을 Monaco 대신 미리보기로 렌더링함
 * =================================================================
 */
import React, { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

const CANVAS_RENDER_QUALITY = 2;

function ImageViewerUI({
    activeFileId,
    fileName,
    imageUrl,
    fileType = 'image',
    isFileContentLoaded = true
}) {
    const pdfContainerRef = useRef(null);
    const renderVersionRef = useRef(0);
    const [isPdfRendering, setIsPdfRendering] = useState(false);
    const [renderError, setRenderError] = useState('');

    const isPdf = fileType === 'pdf';

    useEffect(() => {
        if (!isPdf || !imageUrl || !activeFileId || !isFileContentLoaded) return undefined;

        const container = pdfContainerRef.current;
        if (!container) return undefined;

        let cancelled = false;
        const version = renderVersionRef.current + 1;
        renderVersionRef.current = version;

        const clearContainer = () => {
            while (container.firstChild) {
                container.removeChild(container.firstChild);
            }
        };

        const renderPdf = async () => {
            setIsPdfRendering(true);
            setRenderError('');
            clearContainer();

            try {
                const loadingTask = pdfjsLib.getDocument({
                    url: imageUrl,
                    disableAutoFetch: false,
                    disableStream: false
                });
                const pdf = await loadingTask.promise;

                const containerWidth = Math.max(320, (container.clientWidth || 800) - 36);

                for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
                    if (cancelled || version !== renderVersionRef.current) return;

                    const page = await pdf.getPage(pageNumber);
                    const originalViewport = page.getViewport({ scale: 1 });
                    const fitWidthScale = containerWidth / originalViewport.width;
                    const viewport = page.getViewport({ scale: fitWidthScale });
                    const renderViewport = page.getViewport({ scale: fitWidthScale * CANVAS_RENDER_QUALITY });

                    const pageWrapper = document.createElement('div');
                    pageWrapper.className = 'pdf-js-page-wrapper asset-pdf-page-wrapper';
                    pageWrapper.style.setProperty('--page-width', Math.floor(viewport.width) + 'px');
                    pageWrapper.style.setProperty('--page-height', Math.floor(viewport.height) + 'px');

                    const pageInner = document.createElement('div');
                    pageInner.className = 'pdf-js-page-inner';
                    pageInner.style.width = Math.floor(viewport.width) + 'px';
                    pageInner.style.height = Math.floor(viewport.height) + 'px';

                    const canvas = document.createElement('canvas');
                    canvas.className = 'pdf-js-page-canvas';

                    const context = canvas.getContext('2d');
                    const outputScale = window.devicePixelRatio || 1;

                    canvas.width = Math.floor(renderViewport.width * outputScale);
                    canvas.height = Math.floor(renderViewport.height * outputScale);
                    canvas.style.width = Math.floor(viewport.width) + 'px';
                    canvas.style.height = Math.floor(viewport.height) + 'px';

                    context.setTransform(outputScale, 0, 0, outputScale, 0, 0);

                    const textLayer = document.createElement('div');
                    textLayer.className = 'textLayer pdf-js-text-layer';

                    pageInner.appendChild(canvas);
                    pageInner.appendChild(textLayer);
                    pageWrapper.appendChild(pageInner);
                    container.appendChild(pageWrapper);

                    const renderTask = page.render({
                        canvasContext: context,
                        viewport: renderViewport
                    });

                    const textLayerTask = pdfjsLib.TextLayer
                        ? new pdfjsLib.TextLayer({
                            textContentSource: page.streamTextContent({
                                includeMarkedContent: true,
                                disableNormalization: true
                            }),
                            container: textLayer,
                            viewport
                        }).render().then(() => {
                            const endOfContent = document.createElement('div');
                            endOfContent.className = 'endOfContent';
                            textLayer.appendChild(endOfContent);
                        }).catch(() => {})
                        : Promise.resolve();

                    await Promise.all([renderTask.promise, textLayerTask]);
                }
            } catch (error) {
                if (!cancelled) {
                    setRenderError(error?.message || 'PDF를 불러오지 못했습니다.');
                }
            } finally {
                if (!cancelled && version === renderVersionRef.current) {
                    setIsPdfRendering(false);
                }
            }
        };

        renderPdf();

        return () => {
            cancelled = true;
        };
    }, [activeFileId, imageUrl, isFileContentLoaded, isPdf]);

    return (
        <main className="editor-section">
            <div className="editor-toolbar border-bottom p-2 d-flex align-items-center justify-content-between">
                <span className="small fw-bold text-muted">
                    {fileName || (isPdf ? 'PDF 파일' : '이미지 파일')}
                </span>
            </div>

            <div className={isPdf ? 'image-viewer-wrapper asset-pdf-viewer-wrapper' : 'image-viewer-wrapper'}>
                {!activeFileId ? (
                    <div className="image-viewer-placeholder">
                        파일을 선택해주세요.
                    </div>
                ) : !isFileContentLoaded ? (
                    <div className="image-viewer-placeholder">
                        파일을 불러오는 중입니다...
                    </div>
                ) : isPdf && imageUrl ? (
                    <div className="asset-pdf-viewer">
                        <div ref={pdfContainerRef} className="pdf-js-scroll-viewer asset-pdf-scroll-viewer" />
                        {isPdfRendering && (
                            <div className="pdf-compile-overlay">PDF 렌더링 중...</div>
                        )}
                        {renderError && (
                            <div className="pdf-js-error-box">{renderError}</div>
                        )}
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
                        <div className="image-viewer-icon">{isPdf ? 'PDF' : 'IMG'}</div>
                        <div className="image-viewer-title">
                            {isPdf ? 'PDF 미리보기' : '이미지 미리보기'}
                        </div>
                        <div className="image-viewer-desc">
                            파일 URL을 불러오지 못했습니다.
                        </div>
                    </div>
                )}
            </div>
        </main>
    );
}

export default ImageViewerUI;
