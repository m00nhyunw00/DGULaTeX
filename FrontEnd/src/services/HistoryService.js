/**
 * =================================================================
 * [Service] History Client Service
 * 설명: 히스토리 생성, 조회, 롤백, 스냅샷 조회 API 응답을 화면 모델로 변환함
 * =================================================================
 */
import { getHistoriesRequest } from '../api/history/getHistories';
import { getHistoryStructureRequest } from '../api/history/getHistoryStructure';
import { getHistoryFileContentRequest } from '../api/history/getHistoryFileContent';
import { rollbackFileRequest } from '../api/history/rollbackFile';
import { rollbackProjectRequest } from '../api/history/rollbackProject';
import { updateLiveFileContentRequest } from '../api/history/updateLiveFileContent';
import { syncLiveEntryStructureRequest } from '../api/history/syncLiveEntryStructure';

const normalizeHistoryId = (value = '') => String(value || '').replace(/^0x/i, '').replace(/-/g, '').toLowerCase().trim();
const historyOperationCache = new Map();
const HISTORY_OPERATION_STORAGE_PREFIX = "dgu-latex:history-operations:";
const canUseSessionStorage = () => typeof window !== "undefined" && Boolean(window.sessionStorage);
const buildStorageKey = (historyId, entryId) => HISTORY_OPERATION_STORAGE_PREFIX + getOperationCacheKey(historyId, entryId);
const readStoredOperations = (historyId, entryId) => {
    if (!canUseSessionStorage()) return [];

    try {
        const raw = window.sessionStorage.getItem(buildStorageKey(historyId, entryId));
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
};
const writeStoredOperations = (historyId, entryId, operations = []) => {
    if (!canUseSessionStorage()) return;

    try {
        window.sessionStorage.setItem(buildStorageKey(historyId, entryId), JSON.stringify(operations));
    } catch {
        // sessionStorage가 가득 찼거나 비활성화된 경우는 무시한다.
    }
};


const getOperationCacheKey = (historyId, entryId) => normalizeHistoryId(historyId) + ':' + normalizeHistoryId(entryId);
const cacheHistoryOperations = (historyId, entryId, operations = []) => {
    const cleanHistoryId = normalizeHistoryId(historyId);
    const cleanEntryId = normalizeHistoryId(entryId);
    if (!cleanHistoryId || !cleanEntryId || !Array.isArray(operations) || operations.length === 0) return;

    const key = getOperationCacheKey(cleanHistoryId, cleanEntryId);
    const previous = historyOperationCache.get(key) || [];
    const merged = [...previous, ...operations];
    historyOperationCache.set(key, merged);
    writeStoredOperations(cleanHistoryId, cleanEntryId, merged);
};
const getCachedHistoryOperations = (historyId, entryId) => {
    const key = getOperationCacheKey(historyId, entryId);
    const memoryValue = historyOperationCache.get(key);
    if (Array.isArray(memoryValue) && memoryValue.length > 0) return memoryValue;

    const storedValue = readStoredOperations(historyId, entryId);
    if (storedValue.length > 0) {
        historyOperationCache.set(key, storedValue);
        return storedValue;
    }
    return [];
};

const isUnknownContributorName = (value) => {
    const name = String(value || "").trim();
    return !name || name === "(알수없음)" || name === "알 수 없는 사용자" || name === "알수없음";
};

const normalizeContributor = (contributor, fallbackName = "사용자") => {
    if (typeof contributor === "string") {
        return {
            id: contributor,
            name: contributor,
            isUnknown: isUnknownContributorName(contributor)
        };
    }

    const contributorName = contributor?.name || contributor?.userName || contributor?.user_name || "";
    const isUnknown = Boolean(contributor?.isUnknown || isUnknownContributorName(contributorName));

    return {
        id: isUnknown ? "unknown" : (contributor?.id || contributor?.userId || contributor?.uuid || contributorName || fallbackName),
        name: isUnknown ? "(알수없음)" : contributorName,
        isUnknown,
        editedAt: contributor?.editedAt || contributor?.edited_at || null
    };
};

const handleServiceError = (error) => ({
    success: false,
    message: error.message || '히스토리 요청 중 오류가 발생했습니다.',
    statusCode: error.statusCode,
    errorCode: error.errorCode,
    errorLog: error.errorLog
});

export const HistoryService = {
    /**
     * [GET HISTORIES]
     * 특정 프로젝트의 버전 히스토리 목록 조회
     */
    async getHistories(projectId, options = {}) {
        try {
            const res = await getHistoriesRequest(projectId, options.requesterId);

            const histories = (res.histories || []).map(history => {
                const contributorMap = new Map();
                (history.contributors || [])
                    .map((contributor) => normalizeContributor(contributor, history.editorName || "사용자"))
                    .filter((contributor) => contributor.name)
                    .forEach((contributor) => {
                        const key = String(contributor.id || contributor.name).trim();
                        if (!key) return;
                        contributorMap.set(key, contributor);
                    });

                if (contributorMap.size === 0) {
                    const fallbackName = history.isMe ? "You" : (history.editorName || "사용자");
                    const isUnknownFallback = isUnknownContributorName(fallbackName);
                    contributorMap.set(isUnknownFallback ? "unknown" : fallbackName, {
                        id: isUnknownFallback ? "unknown" : (history.userId || fallbackName),
                        name: isUnknownFallback ? "(알수없음)" : fallbackName,
                        isUnknown: isUnknownFallback
                    });
                }

                const contributors = Array.from(contributorMap.values());

                return {
                    id: history.historyId,
                    historyId: history.historyId,
                    editorName: history.editorName || '사용자',
                    isMe: Boolean(history.isMe),
                    createdAt: history.createdAt,
                    changedEntries: (history.changedEntries || []).map(entry => ({
                        entryName: entry.entryName || '이름 없음',
                        label: entry.label || 'Changed'
                    })),
                    contributors
                };
            });

            return {
                success: true,
                histories
            };
        } catch (error) {
            return handleServiceError(error);
        }
    },

    /**
     * [GET HISTORY STRUCTURE]
     * 특정 히스토리 버전의 파일/폴더 구조 및 변경 라벨 조회
     */
    async getHistoryStructure(historyId, projectId) {
        try {
            const res = await getHistoryStructureRequest(historyId, projectId);

            return {
                success: true,
                versionId: res.versionId,
                projectId: res.projectId,
                files: res.files || []
            };
        } catch (error) {
            return handleServiceError(error);
        }
    },

    /**
     * [GET HISTORY FILE CONTENT]
     * 특정 히스토리 버전의 특정 파일 코드 및 변경 라인 조회
     */
    async getHistoryFileContent(historyId, projectId, entryId) {
        try {
            const res = await getHistoryFileContentRequest(historyId, projectId, entryId);

            return {
                success: true,
                file: {
                    id: res.entryId,
                    name: res.entryName || '이름 없음',
                    content: res.content || '',
                    label: res.label || 'none',
                    changedLines: res.changedLines || [],
                    previousContent: Object.prototype.hasOwnProperty.call(res, "previousContent") ? res.previousContent : null,
                    contributors: (res.contributors || []).map((contributor) => normalizeContributor(contributor)),
                    changeOperations: res.changeOperations || getCachedHistoryOperations(historyId, entryId)
                }
            };
        } catch (error) {
            return handleServiceError(error);
        }
    },

    /**
     * [ROLLBACK FILE]
     * 특정 파일을 선택한 히스토리 버전으로 롤백
     */
    async rollbackFile(projectId, entryId, { targetVersionId, requesterId }) {
        try {
            const res = await rollbackFileRequest(projectId, entryId, {
                targetVersionId,
                requesterId
            });

            return {
                success: true,
                newVersionId: res.newVersionId,
                restoreFromVer: res.restoreFromVer,
                restoreFileName: res.restoreFileName,
                rolledBackEntryId: res.rolledBackEntryId
            };
        } catch (error) {
            return handleServiceError(error);
        }
    },

    /**
     * [ROLLBACK PROJECT]
     * 프로젝트 전체를 선택한 히스토리 버전으로 롤백
     */
    async rollbackProject(historyId, projectId, { requesterId } = {}) {
        try {
            const res = await rollbackProjectRequest(historyId, projectId, { requesterId });

            return {
                success: true,
                newVersionId: res.newVersionId,
                restoreFromVer: res.restoreFromVer,
                mainEntryId: res.mainEntryId
            };
        } catch (error) {
            return handleServiceError(error);
        }
    },

    /**
     * [UPDATE LIVE FILE CONTENT]
     * 최신 히스토리 버전의 특정 파일 본문 포인터를 실시간 동기화
     *
     * @param {string} projectId
     * @param {string} entryId
     * @param {string} content
     * @param {object} options - { contributors: [...] }
     */
    async updateLiveFileContent(projectId, entryId, content, options = {}) {
        try {
            // 백엔드가 요구하는 형식에 맞춰 contributors 배열을 body에 포함하여 전달
            const res = await updateLiveFileContentRequest(projectId, entryId, content, options.contributors, options.changeOperations);
            const targetVersionId = res.targetVersionId || res.versionId;
            cacheHistoryOperations(targetVersionId, entryId, options.changeOperations);

            return {
                success: true,
                versionId: res.versionId,
                targetVersionId,
                isNewVersionCreated: Boolean(res.isNewVersionCreated)
            };
        } catch (error) {
            return handleServiceError(error);
        }
    },

    /**
     * [SYNC LIVE ENTRY STRUCTURE]
     * 최신 히스토리 버전의 파일/폴더 구조 변경을 실시간 동기화
     *
     * @param {string} projectId
     */
    async syncLiveEntryStructure(projectId) {
        try {
            const res = await syncLiveEntryStructureRequest(projectId);

            return {
                success: true,
                isNewVersionCreated: Boolean(res.isNewVersionCreated),
                versionId: res.versionId
            };
        } catch (error) {
            return handleServiceError(error);
        }
    }
};