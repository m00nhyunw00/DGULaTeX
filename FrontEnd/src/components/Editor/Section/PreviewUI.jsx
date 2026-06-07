/**
 * =================================================================
 * [Component] PDF Preview & Compile Log UI
 * 설명: PDF.js 기반 텍스트 선택 가능한 미리보기와 구조화된 컴파일 로그 패널을 렌더링함
 * =================================================================
 */
import React, { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

const CANVAS_RENDER_QUALITY = 2;

const SECTION_LABELS = {
    sanitize: 'Sanitize',
    result: 'Result',
    warnings: 'Warnings',
    errors: 'Errors',
    stderr: 'STDERR',
    pass: 'Compile pass',
    raw: 'Details'
};

const createLogSection = (kind, title) => ({
    kind,
    title: title || SECTION_LABELS[kind] || 'Details',
    lines: []
});

const parseCompileLog = (rawLog = '') => {
    const lines = String(rawLog || '').split(/\r?\n/);
    const meta = {
        status: 'neutral',
        engine: '',
        passes: '',
        timeText: ''
    };
    const sections = [];
    let current = null;
    let expectingCompileTime = false;

    const pushCurrent = () => {
        if (!current) return;
        current.lines = current.lines.filter(line => line.trim() !== '');
        if (current.lines.length > 0) sections.push(current);
        current = null;
    };

    const startSection = (kind, title) => {
        pushCurrent();
        current = createLogSection(kind, title);
    };

    const appendLine = (line) => {
        if (!current) current = createLogSection('raw', 'Details');
        current.lines.push(line);
    };

    lines.forEach((line) => {
        const trimmed = line.trim();
        if (!trimmed) {
            if (current?.lines.length) current.lines.push('');
            return;
        }

        if (expectingCompileTime) {
            meta.timeText = trimmed;
            meta.status = trimmed.includes('실패') ? 'failure' : trimmed.includes('성공') ? 'success' : meta.status;
            expectingCompileTime = false;
            return;
        }

        if (trimmed.startsWith('[COMPILE ENGINE]')) {
            meta.engine = trimmed.replace('[COMPILE ENGINE]', '').trim();
            return;
        }

        if (trimmed.startsWith('[COMPILE PASSES]')) {
            meta.passes = trimmed.replace('[COMPILE PASSES]', '').trim();
            return;
        }

        if (trimmed === '[COMPILE TIME]') {
            expectingCompileTime = true;
            return;
        }

        const passMatch = trimmed.match(/^\[COMPILE PASS\]\s*(.+)$/);
        if (passMatch) {
            startSection('pass', 'Pass ' + passMatch[1].trim());
            return;
        }

        if (trimmed === '[SANITIZE]') {
            startSection('sanitize', 'Sanitize');
            return;
        }

        if (trimmed === '[RESULT]') {
            startSection('result', 'Result');
            return;
        }

        if (trimmed === '[WARNINGS]') {
            startSection('warnings', 'Warnings');
            return;
        }

        if (trimmed === '[ERRORS]') {
            startSection('errors', 'Errors');
            meta.status = 'failure';
            return;
        }

        if (trimmed === '[STDERR]') {
            startSection('stderr', 'STDERR');
            meta.status = 'failure';
            return;
        }

        if (/^\[[A-Z_\s]+\]$/.test(trimmed)) {
            startSection('raw', trimmed.replace(/^\[|\]$/g, ''));
            return;
        }

        if (trimmed.includes('컴파일 실패') || trimmed.includes('Fatal error') || trimmed.startsWith('!')) {
            meta.status = 'failure';
        } else if (trimmed.includes('컴파일 성공') && meta.status !== 'failure') {
            meta.status = 'success';
        }

        appendLine(line);
    });

    pushCurrent();

    if (meta.status === 'neutral') {
        const text = String(rawLog || '');
        if (text.includes('컴파일 실패') || text.includes('[ERRORS]')) meta.status = 'failure';
        else if (text.includes('컴파일 성공') || text.includes('Output written on')) meta.status = 'success';
    }

    return { meta, sections };
};

const getStatusLabel = (status) => {
    if (status === 'success') return '성공';
    if (status === 'failure') return '실패';
    return '로그';
};

const getSectionIcon = (kind) => {
    if (kind === 'result') return '✓';
    if (kind === 'warnings') return '!';
    if (kind === 'errors' || kind === 'stderr') return '×';
    if (kind === 'sanitize') return 'S';
    if (kind === 'pass') return 'P';
    return 'i';
};

const getLogLineClass = (line) => {
    const trimmed = String(line || '').trim();
    if (!trimmed) return 'compile-log-line is-spacer';
    if (trimmed.startsWith('!') || trimmed.includes('Error') || trimmed.includes('Fatal') || trimmed.includes('실패')) {
        return 'compile-log-line is-error';
    }
    if (trimmed.includes('Warning') || trimmed.includes('Overfull') || trimmed.includes('Underfull')) {
        return 'compile-log-line is-warning';
    }
    if (trimmed.includes('컴파일 성공') || trimmed.includes('Output written on')) {
        return 'compile-log-line is-success';
    }
    if (/^l\.\d+/.test(trimmed) || /^[^:\s]+\.tex:\d+:/i.test(trimmed)) {
        return 'compile-log-line is-location';
    }
    return 'compile-log-line';
};

function CompileLogPanel({ compileLog }) {
    const { meta, sections } = parseCompileLog(compileLog);
    const hasDetails = sections.length > 0;

    return (
        <div className={'compile-log-panel status-' + meta.status}>
            <div className="compile-log-summary">
                <div className="compile-log-status-block">
                    <span className="compile-log-status-dot" aria-hidden="true"></span>
                    <div>
                        <div className="compile-log-status-title">
                            컴파일 {getStatusLabel(meta.status)}
                        </div>
                        {meta.timeText && (
                            <div className="compile-log-status-time">
                                {meta.timeText}
                            </div>
                        )}
                    </div>
                </div>

                <div className="compile-log-meta-grid">
                    {meta.engine && (
                        <div className="compile-log-meta-item">
                            <span>Engine</span>
                            <strong>{meta.engine}</strong>
                        </div>
                    )}
                    {meta.passes && (
                        <div className="compile-log-meta-item">
                            <span>Passes</span>
                            <strong>{meta.passes}</strong>
                        </div>
                    )}
                </div>
            </div>

            {hasDetails ? (
                <div className="compile-log-section-list">
                    {sections.map((section, sectionIndex) => (
                        <section
                            className={'compile-log-card log-kind-' + section.kind}
                            key={section.kind + '-' + section.title + '-' + sectionIndex}
                        >
                            <div className="compile-log-card-header">
                                <span className="compile-log-card-icon" aria-hidden="true">
                                    {getSectionIcon(section.kind)}
                                </span>
                                <h6>{section.title}</h6>
                            </div>

                            <div className="compile-log-lines">
                                {section.lines.map((line, lineIndex) => (
                                    <div
                                        className={getLogLineClass(line)}
                                        key={sectionIndex + '-' + lineIndex}
                                    >
                                        {line || '\u00a0'}
                                    </div>
                                ))}
                            </div>
                        </section>
                    ))}
                </div>
            ) : (
                <pre className="compile-log-raw-fallback">{compileLog}</pre>
            )}
        </div>
    );
}

function PreviewUI({ 
    pdfUrl,
    compileLog = '',
    isCompiling,
    compileEngine = 'pdflatex',
    setCompileEngine,
    handleManualCompile,
    isAutoCompile, 
    toggleAutoCompile, 
    onCompile,
    downloadFileName = 'compiled'
}) {
    const [hasCompiled, setHasCompiled] = useState(false);
    const [viewMode, setViewMode] = useState('pdf');
    const [isPdfRendering, setIsPdfRendering] = useState(false);
    const [renderError, setRenderError] = useState('');
    const [viewerWidth, setViewerWidth] = useState(0);
    const [zoomLevel, setZoomLevel] = useState(1);

    const visiblePdfRef = useRef(null);
    const hiddenPdfRef = useRef(null);
    const renderVersionRef = useRef(0);
    const resizeTimerRef = useRef(null);

    const buildFinalPdfUrl = (url) => {
        if (!url) return null;

        return url.startsWith('http')
            ? url
            : `${import.meta.env.VITE_API_URL}${url}`;
    };

    const finalPdfUrl = buildFinalPdfUrl(pdfUrl);

    const buildPdfDownloadName = (fileName) => {
        const rawName = String(fileName || 'compiled')
            .replace(/\\/g, '/')
            .split('/')
            .pop()
            .trim();
        const withoutExtension = rawName.replace(/\.[^.]*$/, '');
        const safeName = withoutExtension.replace(/[\\/:*?"<>|]/g, '_').trim();

        return `${safeName || 'compiled'}.pdf`;
    };

    const handleCompileClick = async () => {
        setHasCompiled(true);
        setViewMode('pdf');

        if (handleManualCompile) {
            await handleManualCompile();
        } else if (onCompile) {
            await onCompile();
        }
    };

    const handleShowLog = () => {
        setViewMode('log');
    };

    const handleZoomIn = () => {
        setZoomLevel(prev => Math.min(2.5, Number((prev + 0.1).toFixed(2))));
    };

    const handleZoomOut = () => {
        setZoomLevel(prev => Math.max(0.4, Number((prev - 0.1).toFixed(2))));
    };

    const handleResetZoom = () => {
        setZoomLevel(1);
    };

    const handleDownloadPdf = async () => {
        if (!finalPdfUrl) {
            alert('다운로드할 PDF가 없습니다.');
            return;
        }

        try {
            const response = await fetch(finalPdfUrl);

            if (!response.ok) {
                throw new Error('PDF 다운로드에 실패했습니다.');
            }

            const blob = await response.blob();
            const blobUrl = window.URL.createObjectURL(blob);

            const a = document.createElement('a');
            a.href = blobUrl;
            a.download = buildPdfDownloadName(downloadFileName);
            document.body.appendChild(a);
            a.click();
            a.remove();

            window.URL.revokeObjectURL(blobUrl);
        } catch (error) {
            alert(error.message || 'PDF 다운로드 중 오류가 발생했습니다.');
        }
    };

    const clearNode = (node) => {
        if (!node) return;

        while (node.firstChild) {
            node.removeChild(node.firstChild);
        }
    };

    const renderPdfToContainer = async (url, targetNode, visibleNode, version) => {
        clearNode(targetNode);

        const loadingTask = pdfjsLib.getDocument({
            url,
            disableAutoFetch: false,
            disableStream: false
        });

        const pdf = await loadingTask.promise;

        const containerWidth = Math.max(
            320,
            (visibleNode?.clientWidth || targetNode?.clientWidth || viewerWidth || 800) - 36
        );

        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
            if (version !== renderVersionRef.current) return;

            const page = await pdf.getPage(pageNumber);
            const originalViewport = page.getViewport({ scale: 1 });

            const fitWidthScale = containerWidth / originalViewport.width;
            const viewport = page.getViewport({ scale: fitWidthScale });
            const renderViewport = page.getViewport({
                scale: fitWidthScale * CANVAS_RENDER_QUALITY
            });

            const pageWrapper = document.createElement('div');
            pageWrapper.className = 'pdf-js-page-wrapper';
            pageWrapper.style.setProperty('--page-width', `${Math.floor(viewport.width)}px`);
            pageWrapper.style.setProperty('--page-height', `${Math.floor(viewport.height)}px`);

            const pageInner = document.createElement('div');
            pageInner.className = 'pdf-js-page-inner';
            pageInner.style.width = `${Math.floor(viewport.width)}px`;
            pageInner.style.height = `${Math.floor(viewport.height)}px`;

            const canvas = document.createElement('canvas');
            canvas.className = 'pdf-js-page-canvas';

            const context = canvas.getContext('2d');
            const outputScale = window.devicePixelRatio || 1;

            canvas.width = Math.floor(renderViewport.width * outputScale);
            canvas.height = Math.floor(renderViewport.height * outputScale);

            canvas.style.width = `${Math.floor(viewport.width)}px`;
            canvas.style.height = `${Math.floor(viewport.height)}px`;

            context.setTransform(outputScale, 0, 0, outputScale, 0, 0);

            pageInner.appendChild(canvas);

            const textLayer = document.createElement('div');
            textLayer.className = 'textLayer pdf-js-text-layer';
            pageInner.appendChild(textLayer);

            pageWrapper.appendChild(pageInner);
            targetNode.appendChild(pageWrapper);

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
                }).catch((error) => {
                })
                : Promise.resolve();

            await Promise.all([renderTask.promise, textLayerTask]);
        }
    };

    useEffect(() => {
        const node = visiblePdfRef.current;
        if (!node) return;

        const observer = new ResizeObserver((entries) => {
            const width = Math.floor(entries[0]?.contentRect?.width || 0);
            if (!width) return;

            if (resizeTimerRef.current) {
                clearTimeout(resizeTimerRef.current);
            }

            resizeTimerRef.current = setTimeout(() => {
                setViewerWidth(width);
            }, 180);
        });

        observer.observe(node);

        return () => {
            observer.disconnect();

            if (resizeTimerRef.current) {
                clearTimeout(resizeTimerRef.current);
                resizeTimerRef.current = null;
            }
        };
    }, []);

    useEffect(() => {
        if (!finalPdfUrl) return;

        let isCancelled = false;

        const startRender = async () => {
            await new Promise(resolve => requestAnimationFrame(resolve));

            const visibleNode = visiblePdfRef.current;
            const hiddenNode = hiddenPdfRef.current;

            if (!visibleNode || !hiddenNode) return;

            const currentVersion = renderVersionRef.current + 1;
            renderVersionRef.current = currentVersion;

            setHasCompiled(true);
            setIsPdfRendering(true);
            setRenderError('');

            const previousScrollTop = visibleNode.scrollTop;
            const previousScrollHeight = visibleNode.scrollHeight;
            const previousScrollRatio =
                previousScrollHeight > 0
                    ? previousScrollTop / previousScrollHeight
                    : 0;

            try {
                await renderPdfToContainer(
                    finalPdfUrl,
                    hiddenNode,
                    visibleNode,
                    currentVersion
                );

                if (isCancelled) return;
                if (currentVersion !== renderVersionRef.current) return;

                clearNode(visibleNode);

                while (hiddenNode.firstChild) {
                    visibleNode.appendChild(hiddenNode.firstChild);
                }

                requestAnimationFrame(() => {
                    const nextScrollHeight = visibleNode.scrollHeight;

                    if (previousScrollTop > 0 && nextScrollHeight > 0) {
                        visibleNode.scrollTop = Math.round(nextScrollHeight * previousScrollRatio);
                    }
                });
            } catch (error) {
                if (!isCancelled) {
                    setRenderError(
                        error?.message
                            ? `PDF를 렌더링하지 못했습니다: ${error.message}`
                            : 'PDF를 렌더링하지 못했습니다.'
                    );
                }
            } finally {
                if (!isCancelled) {
                    setIsPdfRendering(false);
                }
            }
        };

        startRender();

        return () => {
            isCancelled = true;
        };
    }, [finalPdfUrl, viewerWidth]);

    const hasCompileLog = Boolean(compileLog && compileLog.trim());

    return (
        <div className="preview-section border-start bg-light h-100">
            <div className="preview-toolbar border-bottom bg-white">
                <div className="preview-toolbar-left">
                    <button
                        className="btn btn-primary btn-sm fw-bold preview-action-btn compile-action-btn"
                        data-tooltip="Compile"
                        title="Compile"
                        onClick={handleCompileClick}
                        disabled={isCompiling}
                    >
                        {isCompiling ? (
                            <>
                                <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
                                <span className="preview-btn-label">Compiling...</span>
                            </>
                        ) : (
                            <>
                                <span className="preview-btn-icon" aria-hidden="true">▶</span>
                                <span className="preview-btn-label">Compile</span>
                            </>
                        )}
                    </button>

                    <div className="form-check form-switch preview-auto-toggle" data-tooltip="Auto compile" title="Auto compile">
                        <input
                            className="form-check-input"
                            type="checkbox"
                            checked={Boolean(isAutoCompile)}
                            onChange={toggleAutoCompile || (() => {})}
                        />
                        <label className="form-check-label preview-auto-label small">Auto</label>
                    </div>

                    <select
                        className="form-select form-select-sm compile-engine-select"
                        value={compileEngine}
                        onChange={(event) => setCompileEngine?.(event.target.value)}
                        title="컴파일 방식"
                        aria-label="컴파일 방식"
                        disabled={isCompiling}
                    >
                        <option value="pdflatex">pdflatex</option>
                        <option value="xelatex">xelatex</option>
                        <option value="lualatex">lualatex</option>
                    </select>
                </div>

                <div className="preview-toolbar-actions">
                    {viewMode === "pdf" && (
                        <>
                            <div className="pdf-zoom-controls" data-tooltip="Zoom" title="Zoom">
                                <button
                                    className="btn btn-sm pdf-zoom-btn"
                                    onClick={handleZoomOut}
                                    disabled={zoomLevel <= 0.4}
                                    title="축소"
                                >
                                    −
                                </button>

                                <button
                                    className="btn btn-sm pdf-zoom-reset-btn"
                                    onClick={handleResetZoom}
                                    title="화면 너비에 맞추기"
                                >
                                    {Math.round(zoomLevel * 100)}%
                                </button>

                                <button
                                    className="btn btn-sm pdf-zoom-btn"
                                    onClick={handleZoomIn}
                                    disabled={zoomLevel >= 2.5}
                                    title="확대"
                                >
                                    +
                                </button>
                            </div>

                            <button
                                className="btn btn-sm compile-log-btn preview-action-btn"
                                title="컴파일 로그 확인"
                                data-tooltip="컴파일 로그"
                                onClick={handleShowLog}
                            >
                                <span className="preview-btn-icon" aria-hidden="true">!</span>
                                <span className="preview-btn-label">컴파일 로그</span>
                            </button>

                            <button
                                className="btn btn-sm btn-outline-success pdf-download-btn preview-action-btn"
                                title="PDF 다운로드"
                                data-tooltip="PDF 다운로드"
                                onClick={handleDownloadPdf}
                                disabled={!finalPdfUrl}
                            >
                                <span className="preview-btn-icon" aria-hidden="true">↓</span>
                                <span className="preview-btn-label">PDF 다운로드</span>
                            </button>
                        </>
                    )}

                    {viewMode === "log" && (
                        <button
                            className="btn btn-sm back-to-pdf-btn preview-action-btn"
                            title="PDF로 돌아가기"
                            data-tooltip="PDF로 돌아가기"
                            onClick={() => setViewMode("pdf")}
                        >
                            <span className="preview-btn-icon" aria-hidden="true">↩</span>
                            <span className="preview-btn-label">PDF로 돌아가기</span>
                        </button>
                    )}
                </div>
            </div>

            <div className="pdf-viewer-container flex-grow-1 position-relative bg-secondary-subtle">
                <div className={`pdf-js-layer ${viewMode === 'pdf' ? 'active' : 'hidden'}`}>
                    <div
                        ref={visiblePdfRef}
                        className="pdf-js-scroll-viewer"
                        style={{ '--pdf-zoom': zoomLevel }}
                    />

                    <div
                        ref={hiddenPdfRef}
                        className="pdf-js-hidden-renderer"
                    />

                    {!hasCompiled && !finalPdfUrl && (
                        <div className="no-pdf-placeholder">
                            <div className="placeholder-icon">📄</div>
                        </div>
                    )}

                    {renderError && (
                        <div className="pdf-js-error-box">
                            {renderError}
                        </div>
                    )}

                    {(isCompiling || isPdfRendering) && hasCompiled && (
                        <div className="pdf-compile-overlay">
                            <span
                                className="spinner-border spinner-border-sm"
                                role="status"
                                aria-hidden="true"
                            ></span>

                            <span>
                                {isCompiling
                                    ? '컴파일 중...'
                                    : 'PDF 갱신 중...'}
                            </span>
                        </div>
                    )}
                </div>

                {viewMode === 'log' && (
                    <div className="compile-log-view">
                        <div className="compile-log-body">
                            {hasCompileLog ? (
                                <CompileLogPanel compileLog={compileLog} />
                            ) : (
                                <div className="compile-log-empty">
                                    아직 표시할 컴파일 로그가 없습니다.
                                    <br />
                                    먼저 Compile 버튼을 눌러 문서를 컴파일하세요.
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

export default PreviewUI;



