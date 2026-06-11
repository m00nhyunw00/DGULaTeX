/**
 * =================================================================
 * [Hook] Editor State & Workflow
 * 설명: 파일 트리, 편집기, 컴파일, PDF 미리보기, 협업 상태와 마지막 커서 복원을 관리함
 * =================================================================
 */
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { buildFileTree } from '../utils/buildTree';
import { buildAssetUrl } from '../utils/assetUrl';
import { EditorService } from '../services/EditorService';
import { CompilerService } from '../services/CompilerService';
import { CollaborationService } from '../services/CollaborationService';
import { HistoryService } from '../services/HistoryService';
import { getUserColor as getProjectUserColor, getUserColorFromMap, getUserColors, hexToRgba } from '../utils/userColor';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { MonacoBinding } from 'y-monaco';

const PROJECT_DELETED_NOTICE_KEY = 'dgu-latex:project-deleted-notice';

const getDefaultYjsUrl = () => {
    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000';

    try {
        const url = new URL(apiUrl, globalThis.location?.href || 'http://localhost:5173');
        url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
        url.pathname = url.pathname.replace(/\/$/, '') + '/yjs';
        url.search = '';
        url.hash = '';
        return url.toString().replace(/\/$/, '');
    } catch {
        return 'ws://localhost:5000/yjs';
    }
};

const normalizeYjsUrl = (rawUrl = '') => {
    const trimmedUrl = String(rawUrl || '').trim();
    if (!trimmedUrl) return '';

    try {
        const url = new URL(trimmedUrl, globalThis.location?.href || 'http://localhost:5173');

        if (globalThis.location?.protocol === 'https:' && url.protocol === 'ws:') {
            url.protocol = 'wss:';
        }

        return url.toString().replace(/\/$/, '');
    } catch {
        return trimmedUrl.replace(/\/$/, '');
    }
};

const HISTORY_STATE = {
    EDITED: 'EDITED',
    RESTORED: 'RESTORED',
    STRUCTURE: 'STRUCTURE'
};

export const useEditor = (selectedProject, currentUser, restoreNavigationState = null, onProjectPatch = null) => {
    const [files, setFiles] = useState([]);
    const [activeFileId, setActiveFileId] = useState('');
    const [fileContent, setFileContent] = useState('');
    const [selectedIds, setSelectedIds] = useState([]);
    const [mainFileId, setMainFileId] = useState('');

    const [pdfUrl, setPdfUrl] = useState('');
    const [compileLog, setCompileLog] = useState('');
    const [dismissedCompileErrorFileIds, setDismissedCompileErrorFileIds] = useState([]);
    const [isCompiling, setIsCompiling] = useState(false);
    const [compileEngine, setCompileEngine] = useState('pdflatex');

    // 자동 컴파일 상태
    const [isAutoCompile, setIsAutoCompile] = useState(false);

    const [isFileContentLoaded, setIsFileContentLoaded] = useState(false);

    const [projectMembers, setProjectMembers] = useState([]);
    const [isMembersLoading, setIsMembersLoading] = useState(false);
    const [membersError, setMembersError] = useState('');

    const activeFileIdRef = useRef(activeFileId);
    const saveTimerRef = useRef(null);
    const initialContentRef = useRef('');

    const editorRef = useRef(null);
    const monacoRef = useRef(null);
    const ydocRef = useRef(null);
    const ytextRef = useRef(null);
    const providerRef = useRef(null);
    const bindingRef = useRef(null);

    const isYjsReadyRef = useRef(false);
    const editorChangeDisposableRef = useRef(null);
    const dismissTouchedCompileErrorsRef = useRef(() => {});
    const yjsSessionRef = useRef(0);
    const contributorsMapRef = useRef(null);
    const historyOperationsArrayRef = useRef(null);
    const ytextObserverRef = useRef(null);
    const remoteCursorStyleRef = useRef(null);
    const awarenessChangeHandlerRef = useRef(null);

    const isApplyingHistoryRestoreRef = useRef(false);
    const pendingRestoredEntryIdsRef = useRef(new Set());
    const forceDbOnNextOpenRef = useRef(false);
    const historyRestoreSuppressUntilRef = useRef(0);

    // 자동 컴파일용 ref
    const isAutoCompileRef = useRef(false);
    const isAutoCompilingRef = useRef(false);
    const isCompileRunningRef = useRef(false);
    const handleAutoCompileRef = useRef(null);

    const isHistoryTriggerRunningRef = useRef(false);
    const isHistorySavingRef = useRef(false);

    const [activeFileKind, setActiveFileKind] = useState('text');
    const [activeFileMeta, setActiveFileMeta] = useState(null);
    const [activeImageUrl, setActiveImageUrl] = useState('');

    const [compileErrorModal, setCompileErrorModal] = useState({
        isOpen: false,
        title: '',
        message: ''
    });

    const [joinRequests, setJoinRequests] = useState([]);
    const [isJoinRequestsLoading, setIsJoinRequestsLoading] = useState(false);
    const [joinRequestsError, setJoinRequestsError] = useState('');
    const [myProjectRole, setMyProjectRole] = useState('');
    const canEditProject = myProjectRole === 'owner' || myProjectRole === 'editor';

    const isViewerMode = myProjectRole === 'viewer';

    const canEditProjectRef = useRef(false);
    const filesRef = useRef(files);
    const activeFileKindRef = useRef('text');
    const cursorSaveTimerRef = useRef(null);
    const cursorChangeDisposableRef = useRef(null);
    const pendingRestoreCursorRef = useRef(null);
    const suppressCursorSaveRef = useRef(false);

    useEffect(() => {
        canEditProjectRef.current = myProjectRole === 'owner' || myProjectRole === 'editor';
    }, [myProjectRole]);

    useEffect(() => {
        activeFileIdRef.current = activeFileId;
    }, [activeFileId]);

    useEffect(() => {
        filesRef.current = files;
    }, [files]);

    useEffect(() => {
        activeFileKindRef.current = activeFileKind;
    }, [activeFileKind]);

    useEffect(() => {
        if (!restoreNavigationState?.forceDbOnOpen) return;

        const restoredEntryId = String(restoreNavigationState.openEntryId || '')
            .replace(/^0x/i, '')
            .replace(/-/g, '')
            .toLowerCase()
            .trim();

        forceDbOnNextOpenRef.current = true;
        historyRestoreSuppressUntilRef.current = Date.now() + 1500;

        if (restoredEntryId) {
            pendingRestoredEntryIdsRef.current.add(restoredEntryId);
        }
    }, [
        restoreNavigationState?.forceDbOnOpen,
        restoreNavigationState?.openEntryId,
        restoreNavigationState?.restoreToken
    ]);

    useEffect(() => {
        isAutoCompileRef.current = isAutoCompile;
    }, [isAutoCompile]);

    const toggleAutoCompile = useCallback((e) => {
        const checked = typeof e?.target?.checked === 'boolean'
            ? e.target.checked
            : null;

        setIsAutoCompile(prev => checked ?? !prev);
    }, []);

    const toUuid = useCallback((id) => {
        const clean = String(id || '').replace(/-/g, '').toLowerCase().trim();

        if (clean.length !== 32) return id;

        return [
            clean.substring(0, 8),
            clean.substring(8, 12),
            clean.substring(12, 16),
            clean.substring(16, 20),
            clean.substring(20)
        ].join('-');
    }, []);

    const normalizeEntryId = useCallback((id) => {
        return String(id || '')
            .replace(/^0x/i, '')
            .replace(/-/g, '')
            .toLowerCase()
            .trim();
    }, []);

    const persistCompiledPdfUrl = useCallback(async ({
        projectId,
        userId,
        fileId,
        pdfUrl: nextPdfUrl
    }) => {
        const cleanProjectId = normalizeEntryId(projectId);
        const cleanUserId = normalizeEntryId(userId);
        const cleanFileId = normalizeEntryId(fileId);
        const cleanPdfUrl = String(nextPdfUrl || '').trim().split('?')[0];

        if (
            !cleanProjectId ||
            !/^[0-9a-f]{32}$/.test(cleanUserId) ||
            !cleanFileId ||
            !cleanPdfUrl
        ) {
            return;
        }

        const cursor = editorRef.current?.getPosition?.() || { lineNumber: 1, column: 1 };
        const cursorLine = Math.max(Number.parseInt(cursor?.lineNumber ?? 1, 10) || 1, 1);
        const cursorColumn = Math.max(Number.parseInt(cursor?.column ?? 1, 10) || 1, 1);

        const result = await EditorService.saveEditSession(cleanProjectId, {
            userId: cleanUserId,
            fileId: cleanFileId,
            cursorLine,
            cursorColumn,
            lastPdfUrl: cleanPdfUrl
        });

        if (!result.success) {
            console.warn('[COMPILED PDF SESSION SAVE FAILED]');
        }
    }, [normalizeEntryId]);

    const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    const refreshTree = useCallback(async () => {
        const pId = selectedProject?.id || selectedProject?._id || selectedProject?.projectId;
        if (!pId) return;

        const result = await EditorService.getEntries(pId);

        if (result.success) {
            const freshTree = buildFileTree(result.data);
            filesRef.current = freshTree;
            setFiles([...freshTree]);
            return freshTree;
        }

        return null;
    }, [selectedProject]);

    const saveFileContent = useCallback(async (fileId, content) => {
        const pId = selectedProject?.id || selectedProject?._id || selectedProject?.projectId;

        if (!pId || !fileId || content === null || content === undefined) return;

        if (!canEditProjectRef.current) {
            console.warn('[VIEWER MODE] save blocked');
            return;
        }
        try {
            await EditorService.updateFileContent(pId, fileId, content);
        } catch (error) {
            console.error('파일 저장 실패');

        }
    }, [selectedProject]);

    const getCurrentEditorText = useCallback(() => {
        /*
        if (isYjsReadyRef.current && ytextRef.current) {
            return ytextRef.current.toString();
        }
        */
        if (ydocRef.current || ytextRef.current || providerRef.current) {
            if (!isYjsReadyRef.current) {
                console.warn('[YJS SAVE BLOCKED] Yjs sync 전이라 저장용 내용을 반환하지 않습니다.');
                return null;
            }

            return ytextRef.current?.toString() ?? null;
        }

        // Yjs가 없는 경우에만 Monaco 값을 fallback으로 사용
        if (editorRef.current) {
            return editorRef.current.getValue();
        }

        return null;
    }, []);

    const flushSaveCurrentFile = useCallback(async () => {
        if (activeFileKind !== 'text') {
            if (saveTimerRef.current) {
                clearTimeout(saveTimerRef.current);
                saveTimerRef.current = null;
            }
            return;
        }
        const currentId = activeFileIdRef.current;
        const currentContent = getCurrentEditorText();

        if (saveTimerRef.current) {
            clearTimeout(saveTimerRef.current);
            saveTimerRef.current = null;
        }

        if (currentId && currentContent !== null) {
            await saveFileContent(currentId, currentContent);
        }
    }, [activeFileKind, getCurrentEditorText, saveFileContent]);

    const getSnapshotText = useCallback(() => {
        if (ydocRef.current || ytextRef.current || providerRef.current) {
            if (!isYjsReadyRef.current) {
                console.warn('[YJS SNAPSHOT BLOCKED] Yjs sync 전이라 snapshot을 만들지 않습니다.');
                return null;
            }

            return ytextRef.current?.toString() ?? null;
        }

        if (editorRef.current) return editorRef.current.getValue();

        return fileContent ?? '';
    }, [fileContent]);

    const applyPdfUrl = useCallback((rawUrl) => {
        if (!rawUrl) {
            setPdfUrl('');
            return;
        }

        const url = String(rawUrl).trim();

        if (!url) {
            setPdfUrl('');
            return;
        }

        const separator = url.includes('?') ? '&' : '?';
        setPdfUrl(`${url}${separator}t=${Date.now()}`);
    }, []);

    const loadLastCompiledPdf = useCallback(async () => {
        const pId = selectedProject?.id || selectedProject?._id || selectedProject?.projectId;
        const userId = currentUser?.uuid || currentUser?.id;

        if (!pId || !userId) {
            setPdfUrl('');
            return;
        }

        try {
            const result = await CompilerService.getLastCompiledPdf(pId, userId);

            if (result?.success && result.pdfUrl) {
                applyPdfUrl(result.pdfUrl);
            } else {
                setPdfUrl('');
            }
        } catch (error) {
            console.error('[LOAD LAST PDF ERROR]');

            setPdfUrl('');
        }
    }, [selectedProject, currentUser, applyPdfUrl]);

    const handleAutoCompile = useCallback(async (snapshotTextOverride = null) => {
        const pId = selectedProject?.id || selectedProject?._id || selectedProject?.projectId;

        if (!pId || !mainFileId || !activeFileIdRef.current) return;

        if (isAutoCompilingRef.current) return;

        const finalCompilerFileId = toUuid(mainFileId);
        const finalEditingFileId = toUuid(activeFileIdRef.current);
        const finalRealUserId = currentUser?.uuid || currentUser?.id || "2019112014";

        isAutoCompilingRef.current = true;
        isCompileRunningRef.current = true;
        setIsCompiling(true);

        try {
            const snapshotText =
                typeof snapshotTextOverride === 'string'
                    ? snapshotTextOverride
                    : getSnapshotText();

            if (snapshotText === null) {
                console.warn('[AUTO COMPILE BLOCKED] Yjs sync 전이라 자동 컴파일을 건너뜁니다.');
                setIsCompiling(false);
                return;
            }

            const result = await CompilerService.autoCompile(pId, {
                userId: finalRealUserId,
                fileId: finalCompilerFileId,
                editingFileId: finalEditingFileId,
                snapshotText,
                snapshotVersion: Date.now(),
                compileEngine,
                updateLastPdfUrl: false
            });

            if (result && result.success) {
                const url = result.pdfUrl || result.pdf_url || result.data?.pdfUrl || result.data?.pdf_url;

                if (url) {
                    const separator = url.includes('?') ? '&' : '?';
                    setPdfUrl(`${url}${separator}t=${Date.now()}`);
                }

                setCompileLog(result.compileLog || "자동 컴파일 성공");
                setDismissedCompileErrorFileIds([]);
            } else {
                setCompileLog(result?.compileLog || result?.message || "자동 컴파일 실패");
                setDismissedCompileErrorFileIds([]);
            }
        } catch (error) {
            console.error('[AUTO COMPILE ERROR]');

            setCompileLog(error.compileLog || error.message || "자동 컴파일 중 오류가 발생했습니다.");
            setDismissedCompileErrorFileIds([]);
        } finally {
            isAutoCompilingRef.current = false;
            isCompileRunningRef.current = false;
            setIsCompiling(false);
        }
    }, [selectedProject, mainFileId, currentUser, getSnapshotText, toUuid, compileEngine]);

    useEffect(() => {
        handleAutoCompileRef.current = handleAutoCompile;
    }, [handleAutoCompile]);

    const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'];
    const PDF_EXTENSIONS = ['pdf'];

    const getFileExtension = (fileName = '') => {
        const parts = String(fileName).toLowerCase().split('.');
        return parts.length > 1 ? parts.pop() : '';
    };

    const isImageFileName = (fileName = '') => {
        return IMAGE_EXTENSIONS.includes(getFileExtension(fileName));
    };

    const isPdfFileName = (fileName = '') => {
        return PDF_EXTENSIONS.includes(getFileExtension(fileName));
    };

    const findEntryById = useCallback((nodes, targetId) => {
        const cleanTargetId = String(targetId || '').replace(/-/g, '').toLowerCase();

        for (const node of nodes || []) {
            const nodeId = String(node.id || node.fileId || '').replace(/-/g, '').toLowerCase();

            if (nodeId === cleanTargetId) return node;

            const found = findEntryById(node.children, cleanTargetId);
            if (found) return found;
        }

        return null;
    }, []);

    const getEntryDisplayName = useCallback((entry) => (
        entry?.fileName ||
        entry?.title ||
        entry?.name ||
        ''
    ), []);

    const normalizeCompileLogPath = useCallback((value = '') => (
        String(value || '')
            .replace(/\\/g, '/')
            .replace(/^\.\//, '')
            .replace(/^\/+/, '')
            .toLowerCase()
            .trim()
    ), []);

    const findEntryPathById = useCallback((nodes, targetId, parentParts = []) => {
        const cleanTargetId = normalizeEntryId(targetId);

        for (const node of nodes || []) {
            const nodeId = normalizeEntryId(node.id || node.fileId);
            const nodeName = getEntryDisplayName(node);
            const nextParts = nodeName ? [...parentParts, nodeName] : parentParts;

            if (nodeId === cleanTargetId) {
                return nextParts.join('/');
            }

            const found = findEntryPathById(node.children, cleanTargetId, nextParts);
            if (found) return found;
        }

        return '';
    }, [getEntryDisplayName, normalizeEntryId]);

    const getActiveFileCompilePath = useCallback(() => {
        const tree = filesRef.current || files;
        const activePath = findEntryPathById(tree, activeFileIdRef.current);

        if (activePath) return activePath;

        return activeFileMeta?.name || '';
    }, [activeFileMeta, files, findEntryPathById]);

    const isSameCompileLogPath = useCallback((logPath = '', activePath = '') => {
        const normalizedLogPath = normalizeCompileLogPath(logPath);
        const normalizedActivePath = normalizeCompileLogPath(activePath);

        if (!normalizedLogPath || !normalizedActivePath) return false;
        if (normalizedLogPath === normalizedActivePath) return true;

        return normalizedActivePath.endsWith('/' + normalizedLogPath) ||
            normalizedLogPath.endsWith('/' + normalizedActivePath);
    }, [normalizeCompileLogPath]);

    const extractCompileErrorMarkers = useCallback((rawLog = '') => {
        const lines = String(rawLog || '').split(/\r?\n/);
        const markers = [];
        let currentFilePath = '';
        let pendingFileLineError = null;
        let inErrorsSection = false;

        const pushMarker = (marker) => {
            if (!marker?.lineNumber || marker.lineNumber < 1) return;

            markers.push({
                filePath: marker.filePath || currentFilePath || '',
                lineNumber: marker.lineNumber,
                message: marker.message || 'LaTeX compile error'
            });
        };

        lines.forEach((line) => {
            const text = String(line || '');
            const trimmed = text.trim();

            if (trimmed === '[ERRORS]') {
                inErrorsSection = true;
                return;
            }

            if (/^\[[A-Z_\s]+\]$/.test(trimmed) && trimmed !== '[ERRORS]') {
                inErrorsSection = false;
                return;
            }

            if (!inErrorsSection && !trimmed.startsWith('!') && !/[^:\s]+\.tex:\d+:/i.test(trimmed) && !/^l\.\d+/.test(trimmed)) {
                return;
            }

            const fileLineMatch = trimmed.match(/([^:\s()\[\]"]+\.tex):(\d+):(.*)$/i);
            if (fileLineMatch) {
                const [, filePath, lineNumber, message] = fileLineMatch;
                currentFilePath = filePath;
                pendingFileLineError = {
                    filePath,
                    lineNumber: Number.parseInt(lineNumber, 10),
                    message: (message || '').trim()
                };
                pushMarker(pendingFileLineError);
                return;
            }

            const linePointerMatch = trimmed.match(/^l\.(\d+)\s*(.*)$/);
            if (linePointerMatch) {
                const [, lineNumber, sourcePreview] = linePointerMatch;
                const lineMessage = pendingFileLineError?.message || sourcePreview || 'LaTeX compile error';

                pushMarker({
                    filePath: currentFilePath || pendingFileLineError?.filePath || '',
                    lineNumber: Number.parseInt(lineNumber, 10),
                    message: lineMessage
                });
                return;
            }

            if (trimmed.startsWith('!') && pendingFileLineError) {
                pendingFileLineError.message = trimmed.replace(/^!\s*/, '') || pendingFileLineError.message;
            }
        });

        const deduped = new Map();
        markers.forEach((marker) => {
            const key = normalizeCompileLogPath(marker.filePath) + ':' + marker.lineNumber + ':' + marker.message;
            if (!deduped.has(key)) deduped.set(key, marker);
        });

        return Array.from(deduped.values());
    }, [normalizeCompileLogPath]);

    const isCompileErrorFileDismissed = useCallback((fileId) => {
        const cleanFileId = normalizeEntryId(fileId);
        if (!cleanFileId) return false;

        return dismissedCompileErrorFileIds.some((dismissedId) => (
            normalizeEntryId(dismissedId) === cleanFileId
        ));
    }, [dismissedCompileErrorFileIds, normalizeEntryId]);

    const dismissTouchedCompileErrors = useCallback((changes = []) => {
        if (isCompileRunningRef.current || isAutoCompilingRef.current) return;

        const activeId = normalizeEntryId(activeFileIdRef.current);
        if (!activeId || isCompileErrorFileDismissed(activeId)) return;

        const activePath = getActiveFileCompilePath();
        const activeName = activeFileMeta?.name || '';
        const activeErrors = extractCompileErrorMarkers(compileLog)
            .filter((error) => {
                if (!error.filePath) return true;

                return isSameCompileLogPath(error.filePath, activePath) ||
                    isSameCompileLogPath(error.filePath, activeName);
            });

        if (activeErrors.length === 0) return;

        const touched = changes.some((change) => {
            const changedStart = change?.range?.startLineNumber || 1;
            const changedEnd = Math.max(
                change?.range?.endLineNumber || changedStart,
                changedStart
            );

            return activeErrors.some((error) => {
                const errorLine = Number.parseInt(error.lineNumber, 10);
                if (!Number.isFinite(errorLine) || errorLine < 1) return false;

                const touchStart = Math.max(1, errorLine - 1);
                const touchEnd = errorLine + 1;

                return changedStart <= touchEnd && changedEnd >= touchStart;
            });
        });

        if (!touched) return;

        setDismissedCompileErrorFileIds((prev) => {
            if (prev.some((id) => normalizeEntryId(id) === activeId)) return prev;
            return [...prev, activeId];
        });
    }, [
        activeFileMeta,
        compileLog,
        extractCompileErrorMarkers,
        getActiveFileCompilePath,
        isCompileErrorFileDismissed,
        isSameCompileLogPath,
        normalizeEntryId
    ]);

    useEffect(() => {
        dismissTouchedCompileErrorsRef.current = dismissTouchedCompileErrors;
    }, [dismissTouchedCompileErrors]);

    const applyCompileErrorMarkers = useCallback(() => {
        const editor = editorRef.current;
        const monaco = monacoRef.current;
        const model = editor?.getModel?.();

        if (!monaco?.editor || !model) return;

        const activePath = getActiveFileCompilePath();
        const activeName = activeFileMeta?.name || '';
        const lineCount = model.getLineCount?.() || 1;

        if (isCompileErrorFileDismissed(activeFileIdRef.current)) {
            monaco.editor.setModelMarkers(model, 'latex-compile', []);
            return;
        }

        const markers = extractCompileErrorMarkers(compileLog)
            .filter((error) => {
                if (!error.filePath) return Boolean(activePath || activeName);
                return isSameCompileLogPath(error.filePath, activePath) ||
                    isSameCompileLogPath(error.filePath, activeName);
            })
            .map((error) => {
                const startLineNumber = Math.min(Math.max(error.lineNumber, 1), lineCount);
                const lineContent = model.getLineContent?.(startLineNumber) || '';

                if (lineContent.trim() === '') return null;

                return {
                    severity: monaco.MarkerSeverity.Error,
                    message: error.message || 'LaTeX compile error',
                    startLineNumber,
                    startColumn: 1,
                    endLineNumber: startLineNumber,
                    endColumn: model.getLineMaxColumn?.(startLineNumber) || 1
                };
            })
            .filter(Boolean);

        monaco.editor.setModelMarkers(model, 'latex-compile', markers);
    }, [
        activeFileMeta,
        compileLog,
        extractCompileErrorMarkers,
        getActiveFileCompilePath,
        isCompileErrorFileDismissed,
        isSameCompileLogPath
    ]);

    useEffect(() => {
        applyCompileErrorMarkers();
    }, [applyCompileErrorMarkers, activeFileId, files]);

    const compileErrorEntryIds = useMemo(() => {
        const errorIds = new Set();
        const errors = extractCompileErrorMarkers(compileLog);
        if (errors.length === 0) return [];

        const visit = (nodes, parentIds = [], parentParts = []) => {
            for (const node of nodes || []) {
                const nodeId = normalizeEntryId(node.id || node.fileId);
                if (!nodeId) continue;

                const nodeName = getEntryDisplayName(node);
                const nextParts = nodeName ? [...parentParts, nodeName] : parentParts;
                const nodePath = nextParts.join('/');
                const isFolder = node.type === 'folder';

                if (!isFolder && !isCompileErrorFileDismissed(nodeId)) {
                    const hasError = errors.some((error) => {
                        if (!error.filePath) {
                            return nodeId === normalizeEntryId(activeFileIdRef.current);
                        }

                        return isSameCompileLogPath(error.filePath, nodePath) ||
                            isSameCompileLogPath(error.filePath, nodeName);
                    });

                    if (hasError) {
                        errorIds.add(nodeId);
                        parentIds.forEach((parentId) => errorIds.add(parentId));
                    }
                }

                if (node.children?.length) {
                    visit(node.children, [...parentIds, nodeId], nextParts);
                }
            }
        };

        visit(filesRef.current || files);

        return Array.from(errorIds);
    }, [
        compileLog,
        extractCompileErrorMarkers,
        files,
        getEntryDisplayName,
        isCompileErrorFileDismissed,
        isSameCompileLogPath,
        normalizeEntryId
    ]);

    /* ---------------------------------------------------------
    * SECTION: History Editor Capture
    * 기능:
    * - 현재 파일 room의 historyContributors에 쌓인 편집자 목록을 배열로 전환
    * --------------------------------------------------------- */

    const captureHistoryContributors = useCallback(() => {
        const contributorsMap = contributorsMapRef.current;
        const historyOperationsArray = historyOperationsArrayRef.current;
        const capturedAt = Date.now();

        const contributors = contributorsMap
            ? Array.from(contributorsMap.entries())
                .map(([id, value]) => ({
                    id,
                    name: value?.name || 'User',
                    editedAt: value?.editedAt || 0
                }))
                .filter(user => user.editedAt <= capturedAt)
            : [];

        const changeOperations = historyOperationsArray
            ? historyOperationsArray.toArray()
                .filter(operation => (operation?.editedAt || 0) <= capturedAt)
            : [];

        return {
            capturedAt,
            contributors,
            changeOperations
        };
    }, []);

    /* ---------------------------------------------------------
    * SECTION: Clear History Editor List
    * 기능:
    * - 캡처한 편집자 목록 삭제
    * --------------------------------------------------------- */

    const clearCapturedHistoryContributors = useCallback((capturedAt) => {
        const ydoc = ydocRef.current;
        const contributorsMap = contributorsMapRef.current;
        const historyOperationsArray = historyOperationsArrayRef.current;

        if (!ydoc || !capturedAt) return;

        ydoc.transact(() => {
            if (contributorsMap) {
                for (const [id, value] of contributorsMap.entries()) {
                    if ((value?.editedAt || 0) <= capturedAt) {
                        contributorsMap.delete(id);
                    }
                }
            }

            if (historyOperationsArray) {
                for (let index = historyOperationsArray.length - 1; index >= 0; index -= 1) {
                    const operation = historyOperationsArray.get(index);
                    if ((operation?.editedAt || 0) <= capturedAt) {
                        historyOperationsArray.delete(index, 1);
                    }
                }
            }
        }, 'history-contributors-clear');
    }, []);

    /* ---------------------------------------------------------
    * SECTION: Force Replace YText From History Restore
    * 기능:
    * - 복구용 Y.Text DB 내용으로 강제 덮어쓰기
    * --------------------------------------------------------- */

    const forceReplaceYTextFromHistoryRestore = useCallback((content) => {
        historyRestoreSuppressUntilRef.current = Date.now() + 1500;

        const ydoc = ydocRef.current;
        const ytext = ytextRef.current;
        const contributorsMap = contributorsMapRef.current;
        const historyOperationsArray = historyOperationsArrayRef.current;

        const nextContent = content || '';

        // 복구 중 발생하는 Monaco 변경 이벤트가 저장/히스토리/자동컴파일로 이어지지 않도록 차단
        isApplyingHistoryRestoreRef.current = true;

        if (saveTimerRef.current) {
            clearTimeout(saveTimerRef.current);
            saveTimerRef.current = null;
        }

        try {
            if (ydoc && ytext) {
                ydoc.transact(() => {
                    ytext.delete(0, ytext.length);

                    if (nextContent.length > 0) {
                        ytext.insert(0, nextContent);
                    }

                    // 복구 전 편집자 목록은 더 이상 유효하지 않으므로 제거
                    if (contributorsMap) {
                        for (const key of Array.from(contributorsMap.keys())) {
                            contributorsMap.delete(key);
                        }
                    }

                    if (historyOperationsArray) {
                        historyOperationsArray.delete(0, historyOperationsArray.length);
                    }
                }, 'history-restore');
            }

            setFileContent(nextContent);
            initialContentRef.current = nextContent;
        } finally {
            // MonacoBinding 반영 이벤트가 바로 이어질 수 있으므로 한 tick 뒤 해제
            setTimeout(() => {
                isApplyingHistoryRestoreRef.current = false;
            }, 0);
        }
    }, []);

    /* ---------------------------------------------------------
    * SECTION: Restore Current Active YText Before Project Move
    * 기능:
    * - 현재 파일 room에 대해서 먼저 DB로 복구 후 Y.Text 강제 replace
    * --------------------------------------------------------- */

    const restoreCurrentActiveYTextBeforeProjectMove = useCallback(async () => {
        const pId = selectedProject?.id || selectedProject?._id || selectedProject?.projectId;
        const currentId = normalizeEntryId(activeFileIdRef.current);

        if (!pId || !currentId) return false;

        // 이미지 파일은 Y.Text room이 없으므로 처리하지 않음
        if (activeFileKind !== 'text') return false;

        try {
            const result = await EditorService.getFileContent(pId, currentId);

            if (!result.success) {

                return false;
            }

            const restoredContent = result.data?.content || '';

            forceReplaceYTextFromHistoryRestore(restoredContent);

            // Yjs provider가 history-restore update를 전송할 짧은 시간 확보
            await wait(80);

            return true;
        } catch (error) {
            console.warn('[PROJECT RESTORE] 현재 파일 Y.Text 복구 실패');

            return false;
        }
    }, [
    selectedProject,
    activeFileKind,
    normalizeEntryId,
    forceReplaceYTextFromHistoryRestore
]);

    /* ---------------------------------------------------------
    * SECTION: History State Trigger
    * 기능:
    * - EDITED / STRUCTURE 작업 종류에 맞는 동기화 API 호출
    * - 새 히스토리 생성/최신 히스토리 업데이트 여부는 백엔드에서 판단
    * --------------------------------------------------------- */

    const runHistoryTrigger = useCallback(async (nextState, options = {}) => {
        const pId = selectedProject?.id || selectedProject?._id || selectedProject?.projectId;

        if (!pId) return;

        if (!canEditProjectRef.current) {
            return;
        }

        if (isHistoryTriggerRunningRef.current) {
            return;
        }

        isHistoryTriggerRunningRef.current = true;

        try {

            if (nextState === HISTORY_STATE.EDITED) {
                const entryId = options.entryId;
                const content = options.content;

                if (!entryId || content === null || content === undefined) {
                    console.warn("[HISTORY EDITED SYNC BLOCKED] missing entryId or content");
                    return;
                }

                const { capturedAt, contributors, changeOperations } = captureHistoryContributors();

                const result = await HistoryService.updateLiveFileContent(
                    pId,
                    entryId,
                    content,
                    {
                        contributors,
                        changeOperations
                    }
                );

                if (!result.success) {
                    console.warn("[HISTORY LIVE CONTENT SYNC FAILED]");
                    return;
                }

                clearCapturedHistoryContributors(capturedAt);


                return;
            }

            if (nextState === HISTORY_STATE.STRUCTURE) {
                const result = await HistoryService.syncLiveEntryStructure(pId);

                if (!result.success) {
                    console.warn("[HISTORY STRUCTURE SYNC FAILED]");
                    return;
                }

            }
        } catch (error) {
        } finally {
            isHistoryTriggerRunningRef.current = false;
        }
    }, [
        selectedProject,
        captureHistoryContributors,
        clearCapturedHistoryContributors
    ]);
    
    const isHexId = useCallback((value) => {
        const clean = normalizeEntryId(value);
        return /^[0-9a-f]{32}$/.test(clean) ? clean : '';
    }, [normalizeEntryId]);

    const getCurrentUserId = useCallback(() => (
        isHexId(currentUser?.uuid) ||
        isHexId(currentUser?.userId) ||
        isHexId(currentUser?.id) ||
        isHexId(typeof window !== 'undefined' ? window.localStorage.getItem('user_uuid') : '') ||
        ''
    ), [currentUser, isHexId]);

    // 서버 세션 저장이 실패해도 같은 브라우저에서는 마지막 편집 위치를 복구할 수 있도록 localStorage 백업을 둡니다.
    const getEditSessionStorageKey = useCallback((projectId, userId) => {
        const cleanProjectId = normalizeEntryId(projectId);
        const cleanUserId = normalizeEntryId(userId);

        if (!cleanProjectId || !cleanUserId) return '';

        return `dgu-latex:last-edit-session:${cleanProjectId}:${cleanUserId}`;
    }, [normalizeEntryId]);

    const saveLocalEditSession = useCallback((projectId, userId, sessionData) => {
        if (typeof window === 'undefined') return;

        const key = getEditSessionStorageKey(projectId, userId);
        if (!key) return;

        try {
            window.localStorage.setItem(key, JSON.stringify({
                ...sessionData,
                projectId: normalizeEntryId(projectId),
                userId: normalizeEntryId(userId),
                updatedAt: new Date().toISOString()
            }));
        } catch (error) {
            console.warn('[EDIT SESSION LOCAL SAVE FAILED]');
        }
    }, [getEditSessionStorageKey, normalizeEntryId]);

    const readLocalEditSession = useCallback((projectId, userId) => {
        if (typeof window === 'undefined') return null;

        const key = getEditSessionStorageKey(projectId, userId);
        if (!key) return null;

        try {
            const raw = window.localStorage.getItem(key);
            if (!raw) return null;

            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== 'object') return null;

            return parsed;
        } catch (error) {
            console.warn('[EDIT SESSION LOCAL READ FAILED]');
            return null;
        }
    }, [getEditSessionStorageKey]);

    // 협업 중 다른 사용자의 편집으로 줄/컬럼이 바뀌어도 현재 모델 범위 안으로 커서를 보정합니다.
    const normalizeEditorCursor = useCallback((cursor, editor = editorRef.current) => {
        const model = editor?.getModel?.();
        const lineCount = model?.getLineCount?.() || 1;
        const rawLine = cursor?.lineNumber ?? cursor?.cursorLine ?? cursor?.line ?? 1;
        const rawColumn = cursor?.column ?? cursor?.cursorColumn ?? 1;
        const parsedLine = Number.parseInt(rawLine, 10);
        const parsedColumn = Number.parseInt(rawColumn, 10);
        const lineNumber = Math.min(Math.max(Number.isFinite(parsedLine) ? parsedLine : 1, 1), lineCount);
        const maxColumn = model?.getLineMaxColumn?.(lineNumber) || 1;
        const column = Math.min(Math.max(Number.isFinite(parsedColumn) ? parsedColumn : 1, 1), maxColumn);

        return { lineNumber, column };
    }, []);

    const saveEditSessionForFile = useCallback(async ({ fileId: targetFileId, cursor = null, shouldNormalize = true } = {}) => {
        const pId = selectedProject?.id || selectedProject?._id || selectedProject?.projectId;
        const userId = normalizeEntryId(getCurrentUserId());
        const fileId = normalizeEntryId(targetFileId || activeFileIdRef.current);

        if (!pId || !userId || !fileId) return;

        const rawCursor = cursor || editorRef.current?.getPosition?.() || { lineNumber: 1, column: 1 };
        const position = shouldNormalize
            ? normalizeEditorCursor(rawCursor)
            : {
                lineNumber: Math.max(Number.parseInt(rawCursor?.lineNumber ?? rawCursor?.cursorLine ?? 1, 10) || 1, 1),
                column: Math.max(Number.parseInt(rawCursor?.column ?? rawCursor?.cursorColumn ?? 1, 10) || 1, 1)
            };

        const sessionData = {
            userId,
            fileId,
            cursorLine: position.lineNumber,
            cursorColumn: position.column,
            lastPdfUrl: pdfUrl || null
        };

        saveLocalEditSession(pId, userId, sessionData);

        const result = await EditorService.saveEditSession(pId, sessionData);

        if (!result.success) {
            console.warn('[EDIT SESSION SAVE FAILED]');
        }
    }, [
        selectedProject,
        getCurrentUserId,
        normalizeEntryId,
        normalizeEditorCursor,
        pdfUrl,
        saveLocalEditSession
    ]);

    const saveCurrentEditSessionNow = useCallback(async (cursorOverride = null) => {
        if (activeFileKindRef.current !== 'text') return;

        await saveEditSessionForFile({
            cursor: cursorOverride || editorRef.current?.getPosition?.() || { lineNumber: 1, column: 1 },
            shouldNormalize: true
        });
    }, [saveEditSessionForFile]);

    const scheduleCursorSessionSave = useCallback((position) => {
        if (suppressCursorSaveRef.current) return;
        if (activeFileKindRef.current !== 'text') return;

        if (cursorSaveTimerRef.current) {
            clearTimeout(cursorSaveTimerRef.current);
        }

        cursorSaveTimerRef.current = setTimeout(() => {
            cursorSaveTimerRef.current = null;
            saveCurrentEditSessionNow(position);
        }, 800);
    }, [saveCurrentEditSessionNow]);

    const applyPendingRestoreCursor = useCallback(() => {
        const editor = editorRef.current;
        const pendingCursor = pendingRestoreCursorRef.current;

        if (!editor || !pendingCursor) return;

        const position = normalizeEditorCursor(pendingCursor, editor);
        pendingRestoreCursorRef.current = null;
        suppressCursorSaveRef.current = true;

        editor.setPosition(position);
        editor.revealPositionInCenterIfOutsideViewport(position);
        editor.focus();
        saveCurrentEditSessionNow(position);

        setTimeout(() => {
            suppressCursorSaveRef.current = false;
        }, 0);
    }, [normalizeEditorCursor, saveCurrentEditSessionNow]);

    const flushCurrentFileBeforeLeave = useCallback(async () => {
        const hadPendingDebounce = Boolean(saveTimerRef.current);

        if (cursorSaveTimerRef.current) {
            clearTimeout(cursorSaveTimerRef.current);
            cursorSaveTimerRef.current = null;
        }

        await saveCurrentEditSessionNow();

        if (!hadPendingDebounce) {
            return;
        }

        const currentId = activeFileIdRef.current;
        const currentContent = getCurrentEditorText();

        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;

        if (!canEditProjectRef.current || !currentId || currentContent === null) {
            return;
        }

        await saveFileContent(currentId, currentContent);

        await runHistoryTrigger(HISTORY_STATE.EDITED, {
            entryId: currentId,
            content: currentContent
        });

        if (isAutoCompileRef.current) {
            await handleAutoCompileRef.current?.(currentContent);
        }
    }, [
        getCurrentEditorText,
        saveFileContent,
        runHistoryTrigger,
        saveCurrentEditSessionNow
    ]);

    const handleOpenFile = async (entryId, options = {}) => {
        const pId = selectedProject?.id || selectedProject?._id || selectedProject?.projectId;
        const cleanId = normalizeEntryId(entryId);

        if (!pId || !cleanId) return;

        if (cleanId === activeFileIdRef.current) {
            if (options.cursor) {
                pendingRestoreCursorRef.current = options.cursor;
                applyPendingRestoreCursor();
            }
            return;
        }

        if (!options.skipFlush) {
            await flushCurrentFileBeforeLeave();
        }

        const treeForLookup = options.tree || filesRef.current || files;
        const targetEntry = findEntryById(treeForLookup, cleanId);
        const targetFileName =
            targetEntry?.fileName ||
            targetEntry?.title ||
            targetEntry?.name ||
            '';

        const isImage = isImageFileName(targetFileName);
        const isPdf = isPdfFileName(targetFileName);

        if (isImage || isPdf) {
            cleanupYjs();

            activeFileKindRef.current = isPdf ? 'pdf' : 'image';
            setActiveFileKind(isPdf ? 'pdf' : 'image');
            setActiveFileMeta({
                id: cleanId,
                name: targetFileName
            });

            setActiveImageUrl(
                buildAssetUrl(
                    targetEntry?.assetUrl ||
                    targetEntry?.asset_url ||
                    targetEntry?.imageUrl ||
                    targetEntry?.url ||
                    targetEntry?.src ||
                    ''
                )
            );

            setFileContent('');
            initialContentRef.current = '';
            activeFileIdRef.current = cleanId;
            setActiveFileId(cleanId);
            setSelectedIds([cleanId]);
            setIsFileContentLoaded(true);
            return;
        }

        activeFileKindRef.current = 'text';
        activeFileIdRef.current = cleanId;
        setActiveFileKind('text');
        setActiveFileMeta({
            id: cleanId,
            name: targetFileName
        });
        setActiveImageUrl('');

        setIsFileContentLoaded(false);
        setFileContent('');
        initialContentRef.current = '';
        pendingRestoreCursorRef.current = options.cursor || null;

        try {
            const result = await EditorService.getFileContent(pId, cleanId);

            if (result.success) {
                const loadedContent = result.data?.content || '';

                initialContentRef.current = loadedContent;
                setFileContent(loadedContent);
                activeFileIdRef.current = cleanId;
                setActiveFileId(cleanId);
                setSelectedIds([cleanId]);
                setIsFileContentLoaded(true);
                await saveEditSessionForFile({
                    fileId: cleanId,
                    cursor: options.cursor || { lineNumber: 1, column: 1 },
                    shouldNormalize: false
                });
            } else {
                setIsFileContentLoaded(true);
                alert("파일 내용을 불러오지 못했습니다.");
            }
        } catch (error) {
            console.error('[OPEN FILE ERROR]');

            setIsFileContentLoaded(true);
            alert("파일 내용을 불러오지 못했습니다.");
        }
    };

    const cleanupYjs = useCallback(() => {
        yjsSessionRef.current += 1;
        isYjsReadyRef.current = false;

        if (saveTimerRef.current) {
            clearTimeout(saveTimerRef.current);
            saveTimerRef.current = null;
        }

        if (cursorSaveTimerRef.current) {
            clearTimeout(cursorSaveTimerRef.current);
            cursorSaveTimerRef.current = null;
        }

        const editorChangeDisposable = editorChangeDisposableRef.current;
        const cursorChangeDisposable = cursorChangeDisposableRef.current;
        const binding = bindingRef.current;
        const provider = providerRef.current;
        const ydoc = ydocRef.current;
        const ytext = ytextRef.current;
        const ytextObserver = ytextObserverRef.current;
        const awarenessChangeHandler = awarenessChangeHandlerRef.current;
        const remoteCursorStyle = remoteCursorStyleRef.current;

        try {
            if (ytext && ytextObserver) {
                ytext.unobserve(ytextObserver);
            }
        } catch (error) {
            console.warn('[YJS CLEANUP] ytext observer unobserve skipped');
        }
        // 먼저 ref를 비워서 중복 cleanup 방지
        editorChangeDisposableRef.current = null;
        cursorChangeDisposableRef.current = null;
        bindingRef.current = null;
        providerRef.current = null;
        ydocRef.current = null;
        ytextRef.current = null;
        editorRef.current = null;
        contributorsMapRef.current = null;
        historyOperationsArrayRef.current = null;
        ytextObserverRef.current = null;
        awarenessChangeHandlerRef.current = null;
        remoteCursorStyleRef.current = null;

        try {
            editorChangeDisposable?.dispose();
            cursorChangeDisposable?.dispose();
        } catch (error) {
            console.warn('[EDITOR CLEANUP] listener dispose skipped');
        }

        try {
            if (provider?.awareness && awarenessChangeHandler) {
                provider.awareness.off('change', awarenessChangeHandler);
                provider.awareness.off('update', awarenessChangeHandler);
            }
        } catch (error) {
            console.warn('[YJS CLEANUP] awareness style handler cleanup skipped');
        }

        try {
            remoteCursorStyle?.remove();
        } catch (error) {
            console.warn('[YJS CLEANUP] remote cursor style cleanup skipped');
        }

        try {
            provider?.destroy();
        } catch (error) {
            console.warn('[YJS CLEANUP] provider destroy skipped');
        }

        try {
            if (binding) {
                binding.destroy();
            }
        } catch (error) {
            console.warn('[YJS CLEANUP] binding destroy skipped');
        }

        try {
            ydoc?.destroy();
        } catch (error) {
            console.warn('[YJS CLEANUP] ydoc destroy skipped');
        }
    }, []);

    useEffect(() => {
        return () => {
            if (cursorSaveTimerRef.current) {
                clearTimeout(cursorSaveTimerRef.current);
                cursorSaveTimerRef.current = null;
            }

            saveCurrentEditSessionNow();
        };
    }, [selectedProject?.id]);

    useEffect(() => {
        return () => cleanupYjs();
    }, [cleanupYjs]);

    useEffect(() => {
        const editor = editorRef.current;
        if (!editor) return;

        const readOnly = !canEditProject;

        editor.updateOptions({
            readOnly,
            domReadOnly: readOnly
        });

        if (readOnly && saveTimerRef.current) {
            clearTimeout(saveTimerRef.current);
            saveTimerRef.current = null;
        }
    }, [canEditProject]);


    const escapeCssString = (value = '') => {
        const cleaned = String(value || 'User').replace(/[^\w .@가-힣-]/g, '').trim();
        return cleaned || 'User';
    };

    const normalizeCursorColor = (color, fallback) => {
        const value = String(color || '').trim();
        return /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
    };

    const getCurrentProjectId = useCallback(() => (
        selectedProject?.id ||
        selectedProject?._id ||
        selectedProject?.projectId ||
        "no-project"
    ), [selectedProject]);

    const getUserColor = useCallback((userId = "") => {
        return getProjectUserColor(userId, getCurrentProjectId());
    }, [getCurrentProjectId]);

    const updateRemoteCursorStyles = useCallback((awareness) => {
        if (!awareness?.getStates) return;

        let styleElement = remoteCursorStyleRef.current;
        if (!styleElement) {
            styleElement = document.createElement('style');
            styleElement.setAttribute('data-dgu-yjs-cursors', 'true');
            document.head.appendChild(styleElement);
            remoteCursorStyleRef.current = styleElement;
        }

        const states = Array.from(awareness.getStates().entries());
        const colorIds = states.map(([clientId, state]) => state?.user?.id || String(clientId));
        const colorsByUser = getUserColors(colorIds, getCurrentProjectId());
        const rules = [];

        states.forEach(([clientId, state]) => {
            const user = state?.user || {};
            const fallbackId = user.id || String(clientId);
            const color = normalizeCursorColor(
                getUserColorFromMap(colorsByUser, fallbackId),
                getUserColor(fallbackId)
            );
            const label = escapeCssString(user.name || "User");
            const selectionColor = hexToRgba(color, 0.18);

            rules.push(".yRemoteSelection-" + clientId + " { background-color: " + selectionColor + "; }");
            rules.push(".yRemoteSelectionHead-" + clientId + " { border-left-color: " + color + "; }");
            rules.push(".yRemoteSelectionHead-" + clientId + "::after { content: \"" + label + "\"; background: " + color + "; }");
        });

        styleElement.textContent = rules.join("\n");
    }, [getCurrentProjectId, getUserColor]);

    const handleEditorDidMount = useCallback((editor, monaco) => {

        cleanupYjs();

        const sessionId = yjsSessionRef.current + 1;
        yjsSessionRef.current = sessionId;
        isYjsReadyRef.current = false;

        editorRef.current = editor;
        monacoRef.current = monaco;

        const readOnly = !canEditProjectRef.current;

        editor.updateOptions({
            readOnly,
            domReadOnly: readOnly
        });

        cursorChangeDisposableRef.current = editor.onDidChangeCursorPosition((event) => {
            if (yjsSessionRef.current !== sessionId) return;
            scheduleCursorSessionSave(event.position);
        });

        const pId = selectedProject?.id || selectedProject?._id || selectedProject?.projectId;
        const currentFileId = activeFileIdRef.current;
        if (!pId || !currentFileId) return;

        const ydoc = new Y.Doc();
        const ytext = ydoc.getText('content');

        const contributorsMap = ydoc.getMap('historyContributors');
        const historyOperationsArray = ydoc.getArray('historyOperations');

        contributorsMapRef.current = contributorsMap;
        historyOperationsArrayRef.current = historyOperationsArray;

        const roomName = `project-${pId.replace(/:/g, '')}-file-${currentFileId.replace(/:/g, '')}`;
        const yjsServerUrl = normalizeYjsUrl(import.meta.env.VITE_YJS_URL) || getDefaultYjsUrl();

        const provider = new WebsocketProvider(yjsServerUrl, roomName, ydoc);
        const updateAwarenessCursorStyles = () => {
            if (yjsSessionRef.current !== sessionId) return;
            updateRemoteCursorStyles(provider.awareness);
        };

        awarenessChangeHandlerRef.current = updateAwarenessCursorStyles;
        provider.awareness.on('change', updateAwarenessCursorStyles);
        provider.awareness.on('update', updateAwarenessCursorStyles);

        const startedAt = performance.now();

        provider.on('status', (event) => {
            if (yjsSessionRef.current !== sessionId) return;

        });

        provider.on('connection-close', (event) => {
            if (yjsSessionRef.current !== sessionId) return;
            console.warn('[YJS CONNECTION CLOSE]');

        });

        provider.on('sync', (isSynced) => {
            if (yjsSessionRef.current !== sessionId) return;

            if (!isSynced) {
                isYjsReadyRef.current = false;
                return;
            }

            if (isYjsReadyRef.current) return;

            const dbText = initialContentRef.current ?? '';
            const cleanCurrentFileId = normalizeEntryId(currentFileId);

            const shouldForceDbSync =
                forceDbOnNextOpenRef.current ||
                pendingRestoredEntryIdsRef.current.has(cleanCurrentFileId);

            if (shouldForceDbSync) {
                isApplyingHistoryRestoreRef.current = true;

                ydoc.transact(() => {
                    ytext.delete(0, ytext.length);

                    if (dbText.length > 0) {
                        ytext.insert(0, dbText);
                    }
                }, 'history-restore');

                pendingRestoredEntryIdsRef.current.delete(cleanCurrentFileId);
                forceDbOnNextOpenRef.current = false;

                setTimeout(() => {
                    isApplyingHistoryRestoreRef.current = false;
                }, 0);

            } else {
                // 1. 빈 Y.Text는 DB 내용으로 초기화
                if (ytext.length === 0 && dbText.length > 0) {
                    ydoc.transact(() => {
                        ytext.insert(0, dbText);
                    }, 'init-db');

                }

                // 2. 이미 Y.Text 내용이 있으면 Y.Text를 원본으로 유지
                if (ytext.length > 0 && ytext.toString() !== dbText) {
                }
            }

            if (!ytextObserverRef.current) {
                const observer = (event) => {
                    if (!event.transaction.local) return;
                    if (event.transaction.origin === 'init-db') return;
                    if (event.transaction.origin === 'history-contributors-clear') return;
                    if (event.transaction.origin === 'history-restore') return;
                    if (!canEditProjectRef.current) return;

                    const userId = currentUser?.uuid || currentUser?.id;
                    if (!userId) return;

                    const userName =
                        currentUser?.name ||
                        currentUser?.studentId ||
                        currentUser?.email ||
                        'User';

                    const editedAt = Date.now();
                    const userKey = String(userId);

                    contributorsMap.set(userKey, {
                        id: userKey,
                        name: userName,
                        editedAt
                    });

                    let index = 0;
                    const operations = [];

                    for (const delta of event.delta || []) {
                        if (delta.retain) {
                            index += delta.retain;
                        }

                        if (typeof delta.insert === "string" && delta.insert.length > 0) {
                            const text = delta.insert;
                            const length = Array.from(text).length;
                            operations.push({
                                type: "insert",
                                index,
                                length,
                                text,
                                userId: userKey,
                                userName,
                                editedAt
                            });
                            index += length;
                        }

                        if (delta.delete) {
                            operations.push({
                                type: "delete",
                                index,
                                length: delta.delete,
                                text: "",
                                userId: userKey,
                                userName,
                                editedAt
                            });
                        }
                    }

                    if (operations.length > 0) {
                        historyOperationsArray.push(operations);
                    }
                };

                ytext.observe(observer);
                ytextObserverRef.current = observer;
            }

            // 3. sync + 초기화 이후에 binding 생성
            if (!bindingRef.current && editorRef.current) {
                const model = editorRef.current.getModel();

                bindingRef.current = new MonacoBinding(
                    ytext,
                    model,
                    new Set([editorRef.current]),
                    provider.awareness
                );
            }

            // 4. binding 이후에 변경 감지 등록
            if (editorChangeDisposableRef.current) {
                editorChangeDisposableRef.current.dispose();
                editorChangeDisposableRef.current = null;
            }

            editorChangeDisposableRef.current = editorRef.current.onDidChangeModelContent((event) => {
                if (yjsSessionRef.current !== sessionId) return;
                if (!isYjsReadyRef.current) return;
                if (isApplyingHistoryRestoreRef.current) return;
                if (Date.now() < historyRestoreSuppressUntilRef.current) return;

                dismissTouchedCompileErrorsRef.current(event?.changes || []);

                if (saveTimerRef.current) {
                    clearTimeout(saveTimerRef.current);
                }

                saveTimerRef.current = setTimeout(async () => {
                    if (isApplyingHistoryRestoreRef.current) {
                        saveTimerRef.current = null;
                        return;
                    }
                    if (Date.now() < historyRestoreSuppressUntilRef.current) {
                        saveTimerRef.current = null;
                        return;
                    }

                    const currentId = activeFileIdRef.current;
                    const currentContent = getCurrentEditorText();

                    saveTimerRef.current = null;

                    if (canEditProjectRef.current && currentId && currentContent !== null) {
                        await saveFileContent(currentId, currentContent);

                        await runHistoryTrigger(HISTORY_STATE.EDITED, {
                            entryId: currentId,
                            content: currentContent
                        });
                    }

                    if (isAutoCompileRef.current && currentContent !== null) {
                        await handleAutoCompileRef.current?.(currentContent);
                    }
                }, 3000);
            });

            // 5. 모든 준비가 끝난 뒤 ready 처리
            isYjsReadyRef.current = true;

            requestAnimationFrame(() => {
                if (yjsSessionRef.current === sessionId) {
                    applyPendingRestoreCursor();
                }
            });

        });

        const awarenessUserId = currentUser?.uuid || currentUser?.id || 'anonymous';

        provider.awareness.setLocalStateField('user', {
            id: awarenessUserId,
            name: currentUser?.name || 'User',
            color: currentUser?.color || getUserColor(awarenessUserId)
        });

        updateAwarenessCursorStyles();

        ydocRef.current = ydoc;
        ytextRef.current = ytext;
        providerRef.current = provider;

        requestAnimationFrame(() => {
            if (yjsSessionRef.current === sessionId) {
                applyCompileErrorMarkers();
            }
        });

    }, [
        selectedProject,
        currentUser,
        cleanupYjs,
        flushSaveCurrentFile,
        getCurrentEditorText,
        saveFileContent,
        runHistoryTrigger,
        normalizeEntryId,
        getUserColor,
        scheduleCursorSessionSave,
        applyPendingRestoreCursor,
        applyCompileErrorMarkers
    ]);

    const insertSnippet = useCallback((template) => {
        const editor = editorRef.current;
        if (editor == null) return;

        if (template === "__COMMAND__:undo") {
            editor.trigger("toolbar", "undo", null);
            editor.focus();
            return;
        }

        if (template === "__COMMAND__:redo") {
            editor.trigger("toolbar", "redo", null);
            editor.focus();
            return;
        }

        if (canEditProjectRef.current !== true) {
            console.warn("[VIEWER MODE] snippet insert blocked");
            return;
        }

        const model = editor.getModel();
        const selection = editor.getSelection();

        if (model == null || selection == null) return;

        const selectedText = model.getValueInRange(selection);
        const startOffset = model.getOffsetAt(selection.getStartPosition());
        const selectedMarker = "$" + "{selected}";
        const cursorMarker = "$" + "{cursor}";

        let insertText = String(template || "").split(selectedMarker).join(selectedText);
        const cursorOffset = insertText.indexOf(cursorMarker);
        insertText = insertText.split(cursorMarker).join("");

        editor.executeEdits("toolbar-snippet", [{
            range: selection,
            text: insertText,
            forceMoveMarkers: true
        }]);

        const nextPosition = model.getPositionAt(
            startOffset + (cursorOffset >= 0 ? cursorOffset : insertText.length)
        );

        editor.setPosition(nextPosition);
        editor.revealPositionInCenterIfOutsideViewport(nextPosition);
        editor.focus();
    }, []);

    useEffect(() => {
        if (!selectedProject) return;

        let isCancelled = false;

        const initializeProjectEditor = async () => {
            const pId = selectedProject?.id || selectedProject?._id || selectedProject?.projectId;
            const sessionUserId = normalizeEntryId(getCurrentUserId());
            const rawMainId = selectedProject.mainEntryId || selectedProject.mainFileId || selectedProject.lastOpenedFileId || '';
            const normalizedMainId = normalizeEntryId(rawMainId);

            setMainFileId(normalizedMainId);

            // 프로젝트가 바뀌었을 때 이전 PDF/로그가 잠깐 남는 것 방지
            setPdfUrl('');
            setCompileLog('');

            let tree = [];

            if (selectedProject.files) {
                tree = buildFileTree(selectedProject.files);
                filesRef.current = tree;
                setFiles([...tree]);
            }

            const refreshedTree = await refreshTree();
            if (isCancelled) return;

            if (refreshedTree) {
                tree = refreshedTree;
            }

            refreshProjectMembers();
            refreshJoinRequests();

            // 에디터 진입 시 현재 사용자의 마지막 컴파일 PDF 조회
            loadLastCompiledPdf();

            const getOpenableFileId = (entryId) => {
                const cleanId = normalizeEntryId(entryId);
                if (!cleanId) return '';

                const entry = findEntryById(tree, cleanId);
                if (!entry || entry.type === 'folder' || entry.isFolder || entry.is_folder) return '';

                return cleanId;
            };

            const fallbackCursor = { lineNumber: 1, column: 1 };
            let targetFileId = '';
            let targetCursor = fallbackCursor;

            const restoredOpenId = restoreNavigationState?.openEntryId;
            const restoredFileId = getOpenableFileId(restoredOpenId);

            if (restoredFileId) {
                targetFileId = restoredFileId;
            } else if (pId && sessionUserId) {
                const userId = sessionUserId;

                if (userId) {
                    let sessionData = null;

                    try {
                        const sessionResult = await EditorService.getEditSession(pId, userId);
                        if (!isCancelled && sessionResult.success && sessionResult.data) {
                            sessionData = sessionResult.data;
                        }
                    } catch (error) {
                        console.warn('[EDIT SESSION RESTORE] server session lookup failed');
                    }

                    if (!sessionData) {
                        // 서버 세션이 없거나 조회 실패 시 브라우저 백업값을 사용합니다.
                        sessionData = readLocalEditSession(pId, userId);
                    }

                    if (!isCancelled && sessionData) {
                        const sessionFileId = getOpenableFileId(sessionData.fileId);

                        if (sessionFileId) {
                            targetFileId = sessionFileId;
                            targetCursor = {
                                lineNumber: sessionData.cursorLine || 1,
                                column: sessionData.cursorColumn || 1
                            };
                        }
                    }
                }
            }

            if (isCancelled) return;

            if (!targetFileId) {
                targetFileId = getOpenableFileId(normalizedMainId);
                targetCursor = fallbackCursor;
            }

            if (targetFileId) {
                handleOpenFile(targetFileId, {
                    cursor: targetCursor,
                    tree,
                    skipFlush: true
                });
            }
        };

        initializeProjectEditor();

        return () => {
            isCancelled = true;
        };

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedProject, currentUser?.uuid, currentUser?.id, currentUser?.userId]);

    const handleCreateEntry = async (title, isFolder, parentId = null) => {
        if (!canEditProjectRef.current) {
            alert('Viewer 권한은 이 작업을 수행할 수 없습니다.');
            return;
        }

        await flushCurrentFileBeforeLeave();
        
        const pId = selectedProject?.id || selectedProject?._id || selectedProject?.projectId;
        if (!pId || !title.trim()) return;

        const result = await EditorService.create(pId, {
            title: title.trim(),
            isFolder: Boolean(isFolder),
            parentId
        });

        if (result.success) {
            await refreshTree();
            await runHistoryTrigger(HISTORY_STATE.STRUCTURE);
        } else {
            alert(result.message);
        }
    };

    const collectEntryAndDescendantIds = useCallback((entries, targetIds) => {
        const targets = new Set((targetIds || []).map(id => normalizeEntryId(id)));
        const collected = new Set();

        const visit = (nodes = [], isInsideTarget = false) => {
            for (const node of nodes) {
                const nodeId = normalizeEntryId(node?.id || node?.fileId);
                if (!nodeId) continue;

                const nextInsideTarget = isInsideTarget || targets.has(nodeId);
                if (nextInsideTarget) {
                    collected.add(nodeId);
                }

                if (Array.isArray(node.children) && node.children.length > 0) {
                    visit(node.children, nextInsideTarget);
                }
            }
        };

        visit(entries);
        return collected;
    }, [normalizeEntryId]);

    const handleDeleteEntry = async (idOrIds) => {
        if (!canEditProjectRef.current) {
            alert('Viewer 권한은 이 작업을 수행할 수 없습니다.');
            return;
        }

        await flushCurrentFileBeforeLeave();
        
        const pId = selectedProject?.id || selectedProject?._id || selectedProject?.projectId;
        if (!pId) return;

        const idsToDelete = Array.isArray(idOrIds)
            ? idOrIds.map(id => String(id).replace(/-/g, '').toLowerCase())
            : [String(idOrIds).replace(/-/g, '').toLowerCase()];

        const deleteScopeIds = collectEntryAndDescendantIds(filesRef.current, idsToDelete);
        const cleanMainFileId = normalizeEntryId(mainFileId);

        if (cleanMainFileId && deleteScopeIds.has(cleanMainFileId)) {
            alert("main 파일은 삭제할 수 없습니다.");
            return;
        }

        const result = await EditorService.delete(pId, idsToDelete);

        if (result.success) {
            if (idsToDelete.includes(activeFileIdRef.current)) {
                if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

                setActiveFileId('');
                activeFileIdRef.current = '';
                setFileContent('');
                setSelectedIds([]);
                setActiveFileKind('text');
                setActiveFileMeta(null);
                setActiveImageUrl('');
                setIsFileContentLoaded(false);
            }

            await refreshTree();
            await runHistoryTrigger(HISTORY_STATE.STRUCTURE);
        } else {
            alert(result.message);
        }
    };

    const handleRenameEntry = async (entryId, newTitle) => {
        if (!canEditProjectRef.current) {
            alert('Viewer 권한은 이 작업을 수행할 수 없습니다.');
            return;
        }

        await flushCurrentFileBeforeLeave();
        
        const pId = selectedProject?.id || selectedProject?._id || selectedProject?.projectId;
        if (!pId || !newTitle.trim()) return;

        const result = await EditorService.rename(pId, entryId, {
            title: newTitle
        });

        if (result.success) {
            await refreshTree();
            await runHistoryTrigger(HISTORY_STATE.STRUCTURE);
        } else {
            alert(result.message);
        }
    };

    const handleMoveEntry = async (idOrIds, targetParentId) => {
        if (!canEditProjectRef.current) {
            alert('Viewer 권한은 이 작업을 수행할 수 없습니다.');
            return;
        }

        await flushCurrentFileBeforeLeave();

        const pId = selectedProject?.id || selectedProject?._id || selectedProject?.projectId;
        if (!pId) return;

        const formattedIds = Array.isArray(idOrIds)
            ? idOrIds.map(id => String(id).replace(/-/g, '').toLowerCase())
            : String(idOrIds).replace(/-/g, '').toLowerCase();

        const cleanTargetParentId = targetParentId
            ? String(targetParentId).replace(/-/g, '').toLowerCase()
            : null;

        const result = await EditorService.move(pId, formattedIds, {
            targetId: cleanTargetParentId
        });

        if (result.success) {
            setSelectedIds([]);
            await refreshTree();
            await runHistoryTrigger(HISTORY_STATE.STRUCTURE);
        } else {
            alert(result.message || "이동 실패");
        }
    };

    const handleUpload = async (formData) => {
        if (!canEditProjectRef.current) {
            alert('Viewer 권한은 이 작업을 수행할 수 없습니다.');
            return;
        }

        await flushCurrentFileBeforeLeave();


        const pId = selectedProject?.id || selectedProject?._id || selectedProject?.projectId;

        if (!pId || !formData) return;

        const result = await EditorService.upload(pId, formData);

        if (result.success) {
            await refreshTree();
            await runHistoryTrigger(HISTORY_STATE.STRUCTURE);
        } else {
            alert(result.errorLog || result.message || "업로드 실패");
        }
    };

    const handleDownloadFile = async (entryId, fileName) => {
        const pId = selectedProject?.id || selectedProject?._id || selectedProject?.projectId;

        if (!pId || !entryId) return;

        const cleanEntryId = String(entryId).replace(/-/g, '').toLowerCase();

        const result = await EditorService.downloadFile(pId, cleanEntryId, fileName);

        if (!result.success) {
            alert(result.message || "파일 다운로드 실패");
            return;
        }

        const blobUrl = window.URL.createObjectURL(result.blob);

        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = result.fileName || fileName || 'download';
        document.body.appendChild(a);
        a.click();
        a.remove();

        window.URL.revokeObjectURL(blobUrl);
    };

    const handleSetMainDocument = async (entryId) => {
        if (!canEditProjectRef.current) {
            alert('Viewer 권한은 이 작업을 수행할 수 없습니다.');
            return;
        }

        await flushCurrentFileBeforeLeave();
        
        const pId = selectedProject?.id || selectedProject?._id || selectedProject?.projectId;
        if (!pId) return;

        const cleanEntryId = String(entryId).replace(/-/g, '').toLowerCase().trim();

        const result = await EditorService.setMainDocument(pId, cleanEntryId);

        if (result.success) {
            const nextMainEntryId = String(result.mainEntryId || cleanEntryId)
                .replace(/-/g, '')
                .toLowerCase()
                .trim();

            setMainFileId(nextMainEntryId);
            onProjectPatch?.({
                mainEntryId: nextMainEntryId,
                mainFileId: nextMainEntryId,
                lastOpenedFileId: nextMainEntryId
            });
            await refreshTree();
        } else {
            alert(result.message);
        }
    };

    const handleManualCompile = async () => {
        const pId = selectedProject?.id || selectedProject?._id || selectedProject?.projectId;

        if (!pId || !mainFileId) return;

        const finalCompilerFileId = toUuid(mainFileId);
        const finalRealUserId = currentUser?.uuid || currentUser?.id || "2019112014";

        const isTextFileOpen = activeFileKind === 'text' && Boolean(activeFileIdRef.current);

        let finalEditingFileId = null;
        let snapshotText = null;


        if (isTextFileOpen) {
            await flushSaveCurrentFile();

            finalEditingFileId = toUuid(activeFileIdRef.current);
            snapshotText = getSnapshotText();

            if (snapshotText === null) {
                alert('파일 동기화가 완료된 뒤 다시 컴파일해주세요.');
                return;
            }
        } else {
            // 이미지/바이너리 파일을 보고 있는 상태에서는
            // 현재 파일 snapshot을 보내지 않고 DB 기준 main 문서로 컴파일
            if (saveTimerRef.current) {
                clearTimeout(saveTimerRef.current);
                saveTimerRef.current = null;
            }
        }

        isCompileRunningRef.current = true;
        setIsCompiling(true);

        try {
            const compilePayload = {
                userId: finalRealUserId,
                fileId: finalCompilerFileId,
                compileEngine,
                forceSanitize: true
            };

            if (isTextFileOpen) {
                compilePayload.editingFileId = finalEditingFileId;
                compilePayload.snapshotText = snapshotText;
            }

            const result = await CompilerService.manualCompile(pId, compilePayload);

            setIsCompiling(false);
            isCompileRunningRef.current = false;

            if (result && result.success) {
                const url = result.pdfUrl || result.data?.pdfUrl || result.data?.pdf_url;
                if (url) {
                    setPdfUrl(`${url}?t=${new Date().getTime()}`);
                    await persistCompiledPdfUrl({
                        projectId: pId,
                        userId: finalRealUserId,
                        fileId: finalCompilerFileId,
                        pdfUrl: url
                    });
                }
                setCompileLog(result.compileLog || "성공");
                setDismissedCompileErrorFileIds([]);
            } else {
                setCompileErrorModal({
                    isOpen: true,
                    title: '컴파일 실패',
                    message: result?.message || '문법 에러 발생'
                });
                setCompileLog(result?.compileLog || "");
                setDismissedCompileErrorFileIds([]);
            }
        } catch (error) {
            setIsCompiling(false);
            isCompileRunningRef.current = false;

            setCompileErrorModal({
                isOpen: true,
                title: '컴파일 실패',
                message: error.message
            });
        }
    };

    /* ---------------------------------------------------------
    * SECTION: History Save Handler
    * 기능:
    * - 현재 편집 중인 파일을 먼저 DB에 저장
    * - 이후 현재 프로젝트 상태를 히스토리 버전으로 저장
    * 비고:
    * - Ctrl + T 테스트용 저장 트리거에서 사용
    * --------------------------------------------------------- */

    const handleSaveHistory = useCallback(async () => {
        const pId = selectedProject?.id || selectedProject?._id || selectedProject?.projectId;

        if (!pId) {
            alert('프로젝트 정보가 없어 히스토리를 저장할 수 없습니다.');
            return;
        }

        if (isHistorySavingRef.current) {
            console.warn('[HISTORY SAVE BLOCKED] 이미 히스토리 저장 중입니다.');
            return;
        }

        isHistorySavingRef.current = true;

        try {
            // 현재 편집 중인 파일 내용을 DB에 먼저 반영
            await flushSaveCurrentFile();

            const currentId = activeFileIdRef.current;
            const currentContent = getCurrentEditorText();

            if (currentId && currentContent !== null) {
                await runHistoryTrigger(HISTORY_STATE.EDITED, {
                    entryId: currentId,
                    content: currentContent
                });
            } else {
                await runHistoryTrigger(HISTORY_STATE.STRUCTURE);
            }

            alert("현재 프로젝트 상태가 히스토리에 동기화되었습니다.");
        } catch (error) {
            console.error('[HISTORY SAVE ERROR]');

            alert(error.message || '히스토리 저장 중 오류가 발생했습니다.');
        } finally {
            isHistorySavingRef.current = false;
        }
    }, [selectedProject, flushSaveCurrentFile, getCurrentEditorText, runHistoryTrigger]);

    /* ---------------------------------------------------------
    * SECTION: Temporary History Save Shortcut
    * 기능:
    * - Ctrl + Shift + H 입력 시 현재 프로젝트 상태를 히스토리로 저장
    * 비고:
    * - 테스트용 단축키
    * - 정식 저장 트리거 구현 후 제거 예정
    * --------------------------------------------------------- */

    useEffect(() => {
        const handleKeyDown = (event) => {
            if (
                (event.ctrlKey || event.metaKey) &&
                event.shiftKey &&
                event.key.toLowerCase() === 'h'
            ) {
                event.preventDefault();
                handleSaveHistory();
            }
        };

        window.addEventListener('keydown', handleKeyDown);

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [handleSaveHistory]);

    const refreshProjectMembers = useCallback(async () => {
        const pId = selectedProject?.id || selectedProject?._id || selectedProject?.projectId;
        if (!pId) return;

        setIsMembersLoading(true);
        setMembersError('');

        try {
            const result = await CollaborationService.getMembers(pId);

            if (result.success) {
                const nextMembers = result.members || [];
                setProjectMembers(nextMembers);

                const myId = String(currentUser?.uuid || currentUser?.id || '')
                    .replace(/-/g, '')
                    .toLowerCase()
                    .trim();

                const me = nextMembers.find(member =>
                    String(member.id || member.userId || '')
                        .replace(/-/g, '')
                        .toLowerCase()
                        .trim() === myId
                );

                setMyProjectRole(me?.role || '');
            }
            else {
                setProjectMembers([]);
                setMembersError(result.message || '멤버 목록을 불러오지 못했습니다.');
            }
        } catch (error) {
            setProjectMembers([]);
            setMembersError(error.message || '멤버 목록을 불러오지 못했습니다.');
        } finally {
            setIsMembersLoading(false);
        }
    }, [selectedProject, currentUser]);

    const getProjectId = useCallback(() => {
        return selectedProject?.id || selectedProject?._id || selectedProject?.projectId;
    }, [selectedProject]);

    const getRequesterId = useCallback(() => {
        return currentUser?.uuid || currentUser?.id;
    }, [currentUser]);

    const createInviteCode = useCallback(async (role, { regenerate = false } = {}) => {
        const pId = getProjectId();
        const userId = getRequesterId();

        if (!pId || !userId) {
            return {
                success: false,
                message: '프로젝트 또는 사용자 정보가 없습니다.'
            };
        }

        return await CollaborationService.createInviteCode(pId, {
            role,
            userId,
            regenerate
        });
    }, [getProjectId, getRequesterId]);

    const updateProjectMemberRole = useCallback(async (memberId, nextRole) => {
        const pId = getProjectId();
        const requesterId = getRequesterId();

        if (!pId || !requesterId || !memberId) {
            return {
                success: false,
                message: '권한 변경에 필요한 정보가 부족합니다.'
            };
        }

        const result = await CollaborationService.updateRole(pId, memberId, {
            role: nextRole,
            requesterId,
            confirmTransfer: nextRole === 'owner'
        });

        if (result.success) {
            const nextOwnerId = result.ownerId || result.newOwnerId;

            if (nextRole === 'owner' && nextOwnerId) {
                const normalizedOwnerId = normalizeEntryId(nextOwnerId);
                onProjectPatch?.({
                    ownerId: normalizedOwnerId,
                    ownerUuid: normalizedOwnerId
                });
            }

            await refreshProjectMembers();
        }

        return result;
    }, [getProjectId, getRequesterId, refreshProjectMembers, normalizeEntryId, onProjectPatch]);

    const removeProjectMember = useCallback(async (memberId) => {
        const pId = getProjectId();
        const requesterId = getRequesterId();

        if (!pId || !requesterId || !memberId) {
            return {
                success: false,
                message: '멤버 강퇴에 필요한 정보가 부족합니다.'
            };
        }

        const result = await CollaborationService.removeMember(pId, memberId, {
            requesterId
        });

        if (result.success) {
            await refreshProjectMembers();
        }

        return result;
    }, [getProjectId, getRequesterId, refreshProjectMembers]);

    const refreshJoinRequests = useCallback(async () => {
        const pId = selectedProject?.id || selectedProject?._id || selectedProject?.projectId;
        if (!pId) return;

        setIsJoinRequestsLoading(true);
        setJoinRequestsError('');

        try {
            const result = await CollaborationService.getJoinRequests(pId);

            if (result.success) {
                setJoinRequests(result.requests || []);
            } else {
                setJoinRequests([]);
                setJoinRequestsError(result.message || '참가 요청 목록을 불러오지 못했습니다.');
            }
        } catch (error) {
            setJoinRequests([]);
            setJoinRequestsError(error.message || '참가 요청 목록을 불러오지 못했습니다.');
        } finally {
            setIsJoinRequestsLoading(false);
        }
    }, [selectedProject]);

    const handleProjectJoinRequest = useCallback(async (requestId, action) => {
        const adminId = currentUser?.uuid || currentUser?.id;

        if (!requestId || !adminId) {
            return {
                success: false,
                message: '참가 요청 처리에 필요한 정보가 부족합니다.'
            };
        }

        const result = await CollaborationService.handleJoinRequest(requestId, {
            adminId,
            action
        });

        if (result.success) {
            await refreshJoinRequests();
            await refreshProjectMembers();
        }

        return result;
    }, [currentUser, refreshJoinRequests, refreshProjectMembers]);

    const handleSocketMemberRoleUpdated = useCallback(async (payload) => {

        // 프로젝트 내 멤버 목록/role 최신화
        await refreshProjectMembers();
    }, [refreshProjectMembers]);

    const handleSocketMyRoleUpdated = useCallback(async (payload) => {

        const nextRole = String(payload?.role || '').toLowerCase();

        if (nextRole) {
            setMyProjectRole(nextRole);
        }

        if (nextRole === 'owner') {
            const nextOwnerId = payload?.ownerId || payload?.newOwnerId || payload?.memberId || currentUser?.uuid || currentUser?.id;

            if (nextOwnerId) {
                const normalizedOwnerId = normalizeEntryId(nextOwnerId);
                onProjectPatch?.({
                    ownerId: normalizedOwnerId,
                    ownerUuid: normalizedOwnerId
                });
            }
        }

        // 내 권한이 바뀐 경우에도 서버 기준 멤버 목록을 다시 맞춤
        await refreshProjectMembers();

        if (nextRole === 'viewer') {
            if (saveTimerRef.current) {
                clearTimeout(saveTimerRef.current);
                saveTimerRef.current = null;
            }

            // alert('권한이 Viewer로 변경되어 편집할 수 없습니다.');
        }

        if (nextRole === 'editor') {
            alert('권한이 Editor로 변경되었습니다.');
        }

        if (nextRole === 'owner') {
            alert('프로젝트 소유자가 되었습니다.');
        }
    }, [refreshProjectMembers, currentUser, normalizeEntryId, onProjectPatch]);

    const handleSocketEditPermissionRevoked = useCallback(async (payload) => {

        // editor → viewer 강등 시 즉시 편집 관련 동작 중단
        setMyProjectRole('viewer');

        if (saveTimerRef.current) {
            clearTimeout(saveTimerRef.current);
            saveTimerRef.current = null;
        }

        await refreshProjectMembers();

        alert('편집 권한이 회수되었습니다.');
    }, [refreshProjectMembers]);

    const handleSocketOwnerTransferred = useCallback(async (payload) => {
        const nextOwnerId = payload?.ownerId || payload?.newOwnerId;

        if (nextOwnerId) {
            const normalizedOwnerId = normalizeEntryId(nextOwnerId);
            onProjectPatch?.({
                ownerId: normalizedOwnerId,
                ownerUuid: normalizedOwnerId
            });
        }

        // owner 표시/멤버 role 모두 바뀌므로 재조회가 가장 안전함
        await refreshProjectMembers();
    }, [refreshProjectMembers, normalizeEntryId, onProjectPatch]);

    const handleSocketMemberRemoved = useCallback(async (payload) => {

        // 프로젝트 room 전체 대상:
        // 멤버 목록에서 제거된 사용자 반영
        await refreshProjectMembers();
    }, [refreshProjectMembers]);

    const handleSocketRemovedFromProject = useCallback(async (payload) => {
        const isProjectDeleted = payload?.reason === 'PROJECT_DELETED' || payload?.projectDeleted === true;
        const projectDeletedMessage = '"' + (payload?.projectTitle || '프로젝트') + '" 프로젝트가 삭제되었습니다.';

        // 내가 프로젝트에서 제거된 경우
        setMyProjectRole('');

        setIsAutoCompile(false);
        isAutoCompileRef.current = false;

        cleanupYjs();

        setActiveFileId('');
        activeFileIdRef.current = '';
        setFileContent('');
        setSelectedIds([]);
        setProjectMembers([]);

        if (isProjectDeleted) {
            try {
                window.sessionStorage.setItem(PROJECT_DELETED_NOTICE_KEY, JSON.stringify({
                    title: '프로젝트가 삭제되었습니다',
                    message: projectDeletedMessage
                }));
            } catch {
                // sessionStorage를 사용할 수 없는 환경에서는 대시보드 안내 복원을 생략합니다.
            }
        } else {
            alert('프로젝트에서 제거되었습니다.');
        }

        return {
            shouldLeaveProject: true,
            forceDashboardReload: isProjectDeleted,
            noticeTitle: isProjectDeleted ? '프로젝트가 삭제되었습니다' : '프로젝트에서 제외되었습니다',
            noticeMessage: isProjectDeleted ? projectDeletedMessage : '프로젝트에서 제거되었습니다.'
        };
    }, [cleanupYjs]);

    const handleSocketFileRestored = useCallback(async (payload) => {
        historyRestoreSuppressUntilRef.current = Date.now() + 1500;


        const pId = selectedProject?.id || selectedProject?._id || selectedProject?.projectId;

        const restoredEntryId = normalizeEntryId(
            payload?.entryId ||
            payload?.rolledBackEntryId ||
            payload?.fileId
        );

        if (!pId || !restoredEntryId) return;

        await refreshTree();

        const currentId = normalizeEntryId(activeFileIdRef.current);

        // 현재 열고 있는 파일이 아니면, 나중에 해당 파일을 열 때 DB 기준으로 강제 sync
        if (currentId !== restoredEntryId) {
            pendingRestoredEntryIdsRef.current.add(restoredEntryId);
            return;
        }

        // 현재 열고 있는 파일이면 DB에서 복구된 최신 내용을 다시 조회
        const result = await EditorService.getFileContent(pId, restoredEntryId);

        if (!result.success) {
            console.warn('[HISTORY FILE RESTORE] restored file content load failed');

            return;
        }

        const restoredContent = result.data?.content || '';

        forceReplaceYTextFromHistoryRestore(restoredContent);

        alert('현재 열려 있는 파일이 히스토리 버전으로 복구되었습니다.');
    }, [
        selectedProject,
        refreshTree,
        normalizeEntryId,
        forceReplaceYTextFromHistoryRestore
    ]);

    const handleSocketProjectRestored = useCallback(async (payload) => {
        historyRestoreSuppressUntilRef.current = Date.now() + 1500;


        const restoredMainId = normalizeEntryId(
            payload?.mainEntryId ||
            payload?.mainFileId ||
            payload?.entryId
        );

        if (saveTimerRef.current) {
            clearTimeout(saveTimerRef.current);
            saveTimerRef.current = null;
        }

        // 프로젝트 복구 중에는 자동 컴파일을 꺼두는 편이 안전함
        setIsAutoCompile(false);
        isAutoCompileRef.current = false;

        // main 파일로 이동하기 전에 현재 열려 있는 파일 room의 Y.Text를 DB 내용으로 먼저 초기화
        await restoreCurrentActiveYTextBeforeProjectMove();

        // 기존 파일 room 정리
        cleanupYjs();

        // 다음에 여는 파일은 무조건 DB 내용으로 Y.Text 강제 초기화
        forceDbOnNextOpenRef.current = true;

        await refreshTree();

        setActiveFileId('');
        activeFileIdRef.current = '';
        setFileContent('');
        setSelectedIds([]);
        setActiveFileKind('text');
        setActiveFileMeta(null);
        setActiveImageUrl('');
        setIsFileContentLoaded(false);

        if (restoredMainId) {
            setMainFileId(restoredMainId);
            onProjectPatch?.({
                mainEntryId: restoredMainId,
                mainFileId: restoredMainId,
                lastOpenedFileId: restoredMainId
            });
            await handleOpenFile(restoredMainId);
        }

        alert('프로젝트가 히스토리 버전으로 복구되어 메인 파일로 이동합니다.');
    }, [
        cleanupYjs,
        refreshTree,
        handleOpenFile,
        normalizeEntryId,
        restoreCurrentActiveYTextBeforeProjectMove
    ]);

    const handleSocketTreeUpdated = useCallback(async (payload) => {

        const refreshedTree = await refreshTree();
        const latestTree = refreshedTree || filesRef.current || [];

        if (payload?.action === 'main-entry' && payload?.entryId) {
            setMainFileId(
                String(payload.entryId)
                    .replace(/-/g, '')
                    .toLowerCase()
                    .trim()
            );
        }

        if (
            payload?.action === 'delete' &&
            Array.isArray(payload.entryIds)
        ) {
            const deletedIds = payload.entryIds.map(id =>
                String(id || '')
                    .replace(/-/g, '')
                    .toLowerCase()
                    .trim()
            );

            if (deletedIds.includes(activeFileIdRef.current)) {
                const fallbackMainId = normalizeEntryId(mainFileId);
                const fallbackMainEntry = fallbackMainId && !deletedIds.includes(fallbackMainId)
                    ? findEntryById(latestTree, fallbackMainId)
                    : null;

                cleanupYjs();

                setActiveFileId('');
                activeFileIdRef.current = '';
                setFileContent('');
                setSelectedIds([]);
                setActiveFileKind('text');
                setActiveFileMeta(null);
                setActiveImageUrl('');
                setIsFileContentLoaded(false);

                if (fallbackMainEntry && !(fallbackMainEntry.type === 'folder' || fallbackMainEntry.isFolder || fallbackMainEntry.is_folder)) {
                    await handleOpenFile(fallbackMainId, {
                        cursor: { lineNumber: 1, column: 1 },
                        tree: latestTree,
                        skipFlush: true
                    });
                }
            }
        }
    }, [refreshTree, cleanupYjs, findEntryById, handleOpenFile, mainFileId, normalizeEntryId]);

    return {
        files,
        activeFileId,
        setActiveFileId,
        fileContent,
        setFileContent,
        isFileContentLoaded,
        selectedIds,
        setSelectedIds,
        mainFileId,
        handleSetMainDocument,
        handleCreateEntry,
        handleDeleteEntry,
        handleRenameEntry,
        handleMoveEntry,
        handleOpenFile,
        activeFileKind,
        activeFileMeta,
        activeImageUrl,
        handleUpload,
        handleDownloadFile,
        refreshTree,
        handleManualCompile,
        handleSaveHistory,
        handleEditorDidMount,
        insertSnippet,
        getSnapshotText,
        pdfUrl,
        compileLog,
        compileErrorEntryIds,
        isCompiling,
        compileEngine,
        setCompileEngine,
        flushSaveCurrentFile,
        flushCurrentFileBeforeLeave,

        isAutoCompile,
        toggleAutoCompile,
        handleAutoCompile,

        projectMembers,
        isMembersLoading,
        membersError,
        refreshProjectMembers,
        createInviteCode,
        updateProjectMemberRole,
        removeProjectMember,
        handleProjectJoinRequest,
        joinRequests,
        isJoinRequestsLoading,
        joinRequestsError,
        refreshJoinRequests,
        myProjectRole,
        canEditProject,
        isViewerMode,

        handleSocketMemberRoleUpdated,
        handleSocketMyRoleUpdated,
        handleSocketEditPermissionRevoked,
        handleSocketOwnerTransferred,
        handleSocketMemberRemoved,
        handleSocketRemovedFromProject,
        handleSocketTreeUpdated,
        handleSocketFileRestored,
        handleSocketProjectRestored,

        compileErrorModal,
        setCompileErrorModal,
    };
};
