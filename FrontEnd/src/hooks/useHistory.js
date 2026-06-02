/**
 * =================================================================
 * [Hook] History State & Workflow
 * 설명: 화면 상태, 사용자 액션, 서비스 호출 흐름을 React 훅으로 관리함
 * =================================================================
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { HistoryService } from '../services/HistoryService';
import { buildFileTree } from '../utils/buildTree';


export const useHistory = (projectId, currentUser) => {

    /* ---------------------------------------------------------
     * SECTION 1: State Definitions
     * --------------------------------------------------------- */

    const [historyList, setHistoryList] = useState([]);
    const [selectedHistory, setSelectedHistory] = useState(null);

    const [historyFiles, setHistoryFiles] = useState([]);
    const [historyFilesVersionId, setHistoryFilesVersionId] = useState('');
    const [activeFileId, setActiveFileId] = useState('');
    const [activeFile, setActiveFile] = useState(null);

    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    const [isStructureLoading, setIsStructureLoading] = useState(false);
    const [structureError, setStructureError] = useState('');

    const [isFileLoading, setIsFileLoading] = useState(false);
    const [fileError, setFileError] = useState('');
    const fileRequestSeqRef = useRef(0);

    const getRequesterId = () => currentUser?.uuid || currentUser?.id;

    /* ---------------------------------------------------------
     * SECTION 2: History List API
     * 기능: 프로젝트 히스토리 목록 조회
     * --------------------------------------------------------- */

    const fetchHistories = useCallback(async () => {
        if (!projectId) return;

        setIsLoading(true);
        setError('');

        try {
            const result = await HistoryService.getHistories(projectId, {
                requesterId: getRequesterId()
            });

            if (result.success) {
                const histories = result.histories || [];

                setHistoryList(histories);
                setSelectedHistory(histories[0] || null);
            } else {
                setHistoryList([]);
                setSelectedHistory(null);
                setError(result.message || '히스토리 목록을 불러오지 못했습니다.');
            }
        } catch (error) {
            setHistoryList([]);
            setSelectedHistory(null);
            setError(error.message || '히스토리 목록을 불러오지 못했습니다.');
        } finally {
            setIsLoading(false);
        }
    }, [projectId, currentUser?.uuid, currentUser?.id]);

    /* ---------------------------------------------------------
     * SECTION 3: History Structure API
     * 기능: 선택된 히스토리 버전의 파일 트리 조회
     * --------------------------------------------------------- */

    const fetchHistoryStructure = useCallback(async (historyId) => {
        if (!projectId || !historyId) return;

        fileRequestSeqRef.current += 1;
        setIsStructureLoading(true);
        setStructureError('');
        setHistoryFiles([]);
        setHistoryFilesVersionId('');
        setActiveFileId('');
        setActiveFile(null);

        try {
            const result = await HistoryService.getHistoryStructure(historyId, projectId);

            if (!result.success) {
                setStructureError(result.message || '히스토리 파일 구조를 불러오지 못했습니다.');
                return;
            }

            const flatFiles = (result.files || []).map(file => ({
                fileId: file.entryId,
                id: file.entryId,
                parentId: file.parentId,
                fileName: file.entryName,
                name: file.entryName,
                type: file.isFolder ? 'folder' : 'file',
                isFolder: Boolean(file.isFolder),
                label: file.label,
                contentId: file.contentId
            }));

            const tree = buildFileTree(flatFiles);
            setHistoryFiles(tree);
            setHistoryFilesVersionId(historyId);

            const firstChangedFile = findFirstChangedFile(tree, selectedHistory?.changedEntries);
            const initialFile = firstChangedFile || findFirstFile(tree);
            if (initialFile) {
                setActiveFileId(initialFile.id || initialFile.fileId);
            }
        } catch (error) {
            setStructureError(error.message || '히스토리 파일 구조를 불러오지 못했습니다.');
        } finally {
            setIsStructureLoading(false);
        }
    }, [projectId, selectedHistory]);

    /* ---------------------------------------------------------
     * SECTION 4: History File Content API
     * 기능: 선택된 파일의 과거 코드 및 변경 라인 조회
     * --------------------------------------------------------- */

    const fetchHistoryFileContent = useCallback(async (entryId) => {
        const historyId = selectedHistory?.historyId || selectedHistory?.id;

        if (historyFilesVersionId !== historyId) return;

        const requestSeq = fileRequestSeqRef.current + 1;
        fileRequestSeqRef.current = requestSeq;

        const targetEntry = findEntryById(historyFiles, entryId);
        if (!targetEntry) return;

        const targetFileName =
            targetEntry?.name ||
            targetEntry?.fileName ||
            targetEntry?.entryName ||
            '';

        if (isCodeViewerUnsupportedFileName(targetFileName)) {
            setFileError('');
            setIsFileLoading(false);

            setActiveFile({
                id: entryId,
                name: targetFileName,
                content: '',
                label: targetEntry?.label || null,
                changedLines: [],
                isCodeViewerUnsupported: true
            });

            return;
        }

        if (!projectId || !historyId || !entryId) return;

        setIsFileLoading(true);
        setFileError('');
        setActiveFile(null);

        try {
            const result = await HistoryService.getHistoryFileContent(historyId, projectId, entryId);

            if (fileRequestSeqRef.current !== requestSeq) return;

            if (result.success) {
                setActiveFile(result.file);
            } else {
                setFileError(result.message || '파일 내용을 불러오지 못했습니다.');
            }
        } catch (error) {
            if (fileRequestSeqRef.current !== requestSeq) return;
            setFileError(error.message || '파일 내용을 불러오지 못했습니다.');
        } finally {
            if (fileRequestSeqRef.current === requestSeq) {
                setIsFileLoading(false);
            }
        }
    }, [projectId, selectedHistory, historyFiles, historyFilesVersionId]);

    /* ---------------------------------------------------------
     * SECTION 5: Side Effects
     * 기능: 히스토리 선택/파일 선택 변화에 따른 API 호출
     * --------------------------------------------------------- */

    useEffect(() => {
        fetchHistories();
    }, [fetchHistories]);

    useEffect(() => {
        const historyId = selectedHistory?.historyId || selectedHistory?.id;

        if (historyId) {
            fetchHistoryStructure(historyId);
        }
    }, [selectedHistory, fetchHistoryStructure]);

    useEffect(() => {
        if (activeFileId) {
            fetchHistoryFileContent(activeFileId);
        }
    }, [activeFileId, fetchHistoryFileContent]);

    /* ---------------------------------------------------------
    * SECTION 6: Tree Traversal Utility
    * 기능:

    * - 트리 내 첫 번째 파일 탐색
    * - 특정 entryId와 일치하는 노드 탐색
    * --------------------------------------------------------- */

    function findFirstFile(items) {
        if (!items || !Array.isArray(items)) return null;

        for (const item of items) {
            if (item.type === "file") return item;

            const found = findFirstFile(item.children);
            if (found) return found;
        }

        return null;
    }

    function findEntryById(items, targetId) {
        if (!items || !Array.isArray(items)) return null;

        const cleanTargetId = String(targetId || "")
            .replace(/-/g, "")
            .toLowerCase();

        for (const item of items) {
            const itemId = String(item.id || item.fileId || "")
                .replace(/-/g, "")
                .toLowerCase();

            if (itemId === cleanTargetId) return item;

            const found = findEntryById(item.children, targetId);
            if (found) return found;
        }

        return null;
    }

    function normalizeFileName(value) {
        return String(value || "")
            .trim()
            .toLowerCase();
    }

    function flattenFiles(items) {
        if (!items || !Array.isArray(items)) return [];

        const files = [];

        for (const item of items) {
            if (item.type === "file") {
                files.push(item);
            }

            files.push(...flattenFiles(item.children));
        }

        return files;
    }

    function hasChangeLabel(item) {
        const label = String(item?.label || "").toUpperCase();
        return Boolean(label && label !== "NONE");
    }

    function findFirstChangedFile(items, changedEntries = []) {
        const files = flattenFiles(items);
        if (files.length === 0) return null;

        const labeledFile = files.find(hasChangeLabel);
        if (labeledFile) return labeledFile;

        const changedNames = (changedEntries || [])
            .map(entry => normalizeFileName(entry?.entryName))
            .filter(Boolean);

        if (changedNames.length === 0) return null;

        return files.find(file => {
            const fileName = normalizeFileName(file.name || file.fileName || file.entryName);
            return changedNames.includes(fileName);
        }) || null;
    }

    /* ---------------------------------------------------------
    * SECTION 6-1: File Type Utility
    * 기능: 히스토리 뷰어에서 코드 조회 대상이 아닌 이미지 파일 판별
    * --------------------------------------------------------- */

    const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'];
    const CODE_VIEWER_UNSUPPORTED_EXTENSIONS = [...IMAGE_EXTENSIONS, 'pdf'];

    const isCodeViewerUnsupportedFileName = (fileName = '') => {
        const extension = String(fileName)
            .toLowerCase()
            .split('.')
            .pop();

        return CODE_VIEWER_UNSUPPORTED_EXTENSIONS.includes(extension);
    };

    /* ---------------------------------------------------------
    * SECTION 7: Rollback Action Handlers
    * 기능: 선택된 히스토리 파일을 현재 프로젝트 파일로 복구
    * --------------------------------------------------------- */

    const rollbackProject = async (historyId) => {
        const requesterId = getRequesterId();

        if (!projectId || !historyId || !requesterId) {
            return {
                success: false,
                message: '프로젝트 롤백에 필요한 정보가 부족합니다.'
            };
        }

        const result = await HistoryService.rollbackProject(historyId, projectId, {
            requesterId
        });

        return result;
    };

    const rollbackFile = async () => {
        const targetVersionId = selectedHistory?.historyId || selectedHistory?.id;
        const entryId = activeFile?.id;
        const requesterId = getRequesterId();

        if (!projectId || !targetVersionId || !entryId || !requesterId) {
            return {
                success: false,
                message: '롤백에 필요한 정보가 부족합니다.'
            };
        }

        if (activeFile?.isCodeViewerUnsupported) {
            return {
                success: false,
                message: '이미지/PDF 파일은 현재 파일 롤백 대상에서 제외됩니다.'
            };
        }

        const result = await HistoryService.rollbackFile(projectId, entryId, {
            targetVersionId,
            requesterId
        });


        return result;
    };

    /* ---------------------------------------------------------
     * SECTION 8: Public API Export
     * --------------------------------------------------------- */

    return {
        historyList,
        selectedHistory,
        setSelectedHistory,

        historyFiles,
        activeFile,
        activeFileId,
        setActiveFileId,

        rollbackProject,
        rollbackFile,

        fetchHistories,
        isLoading,
        error,

        isStructureLoading,
        structureError,
        isFileLoading,
        fileError
    };
};