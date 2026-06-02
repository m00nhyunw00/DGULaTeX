/**
 * =================================================================
 * [Controller] History Controller
 * 설명: 요청 값 검증, 도메인 로직 호출, HTTP 응답 생성을 담당함
 * =================================================================
 */
const db = require('../models/db');
const crypto = require('crypto');
const historyModel = require('../models/historyModel');
const projectLogic = require('../logics/projectLogic');
const historyLogic = require('../logics/historyLogic');
const entryLogic = require('../logics/entryLogic');
const entryModel = require('../models/entryModel');
const projectModel = require('../models/projectModel');
const downloadLogic = require('../logics/downloadLogic');
const memberModel = require('../models/memberModel');
const memberLogic = require('../logics/memberLogic');


const normalizeTextContent = (content) => {
    return String(content ?? '').replace(/\r\n/g, '\n');
};

const generateContentHashBuffer = (content) => {
    return crypto
        .createHash('sha256')
        .update(normalizeTextContent(content), 'utf8')
        .digest()
        .subarray(0, 32); // SHA-256은 32바이트입니다.
};

const generateContentHashHex = (content) => {
    return generateContentHashBuffer(content).toString('hex');
};

const TEXT_EDITABLE_EXTENSIONS = new Set([
    'tex',
    'bib',
    'sty',
    'cls',
    'txt',
    'md'
]);

const getFileExtension = (fileName = '') => {
    const parts = String(fileName || '').toLowerCase().split('.');
    return parts.length > 1 ? parts.pop() : '';
};

const isTextEditableFile = (fileName = '') => {
    return TEXT_EDITABLE_EXTENSIONS.has(getFileExtension(fileName));
};

const resolveSnapshotMainFileId = ({ targetHistory, targetProjectSnapshot, currentMainFileId }) => {
    if (targetHistory?.main_file_id) {
        return targetHistory.main_file_id;
    }

    const snapshotEntries = Array.isArray(targetProjectSnapshot)
        ? targetProjectSnapshot
        : [];

    if (currentMainFileId) {
        const currentMainHex = currentMainFileId.toString('hex');
        const currentMainExists = snapshotEntries.some((entry) => {
            return entry.entry_id?.toString('hex') === currentMainHex;
        });

        if (currentMainExists) {
            return currentMainFileId;
        }
    }

    const mainTexEntry = snapshotEntries.find((entry) => {
        return entry.is_folder === 0 && String(entry.entry_name || '').toLowerCase() === 'main.tex';
    });

    if (mainTexEntry?.entry_id) {
        return mainTexEntry.entry_id;
    }

    const firstTexEntry = snapshotEntries.find((entry) => {
        return entry.is_folder === 0 && String(entry.entry_name || '').toLowerCase().endsWith('.tex');
    });

    return firstTexEntry?.entry_id || null;
};

/**
 * [HELPER] 특정 버전의 행동 성격을 실시간으로 추론합니다. (가드레일용)
 */
const getVersionActionType = async (connection, currentVer, projectId) => {
    if (currentVer.action_type) return currentVer.action_type;
    if (currentVer.restore_from_ver) return 'RESTORED';

    // action_type 도입 전 생성된 레거시 히스토리에는 새 변경을 누적하지 않는다.
    if (!currentVer.action_type) return 'UNKNOWN';

    const prevVerId = await historyModel.findPreviousVersionId(connection, projectId, currentVer.created_at);
    if (!prevVerId) return 'STRUCTURE';

    const currentRows = await historyModel.findHistoryStructureByVersionId(connection, currentVer.version_id);
    // [ACCEPT] prevVerId는 객체 { version_id: ... }이므로 .version_id로 접근해야 함
    const prevRows = await historyModel.findHistoryStructureByVersionId(connection, prevVerId.version_id);

    // ID 존재 여부(추가/삭제) 또는 이름/위치 변경 확인
    if (currentRows.length !== prevRows.length) return 'STRUCTURE';

    const prevMap = new Map(prevRows.map(r => [r.entry_id.toString('hex'), r]));
    for (const curr of currentRows) {
        const prev = prevMap.get(curr.entry_id.toString('hex'));
        if (!prev) return 'STRUCTURE';
        if (curr.entry_name !== prev.entry_name || curr.parent_id?.toString('hex') !== prev.parent_id?.toString('hex')) {
            return 'STRUCTURE';
        }
    }

    return 'EDITED';
};

const buildStructureMap = (rows = []) => {
    return new Map(rows.map(row => [row.entry_id.toString('hex'), row]));
};

const bufferHex = (value) => {
    return value ? value.toString('hex') : null;
};

const hasStructureDiff = (liveEntries = [], snapshotRows = []) => {
    if (liveEntries.length !== snapshotRows.length) {
        return true;
    }

    const snapshotMap = buildStructureMap(snapshotRows);

    for (const entry of liveEntries) {
        const snapshot = snapshotMap.get(entry.id.toString('hex'));

        if (!snapshot) {
            return true;
        }

        if (snapshot.entry_name !== entry.title) {
            return true;
        }

        if (bufferHex(snapshot.parent_id) !== bufferHex(entry.parent_id)) {
            return true;
        }

        if (Number(snapshot.is_folder) !== Number(entry.is_folder)) {
            return true;
        }
    }

    return false;
};

const getMeaningfulStructureChanges = (currentRows = [], prevRows = [], mode = "log") => {
    return historyLogic
        .compareProjectStructures(currentRows, prevRows, mode)
        .filter((row) => row.label && row.label !== "NONE");
};

const deleteHistoryVersionIfLogless = async (connection, { versionId, projectId, currentRows, prevRows }) => {
    const meta = await historyModel.findHistoryByIdAndProjectId(connection, versionId, projectId);

    if (!meta || meta.restore_from_ver) {
        return false;
    }

    const changes = getMeaningfulStructureChanges(currentRows, prevRows, "log");

    if (changes.length > 0) {
        return false;
    }

    const dependentCount = await historyModel.countRestoreDependents(connection, versionId);

    if (dependentCount > 0) {
        return false;
    }

    await historyModel.deleteHistoryVersion(connection, versionId);
    return true;
};

const resolveStructureContentId = async (connection, entry, previousStructureMap) => {
    const previousRow = previousStructureMap?.get(entry.id.toString('hex'));

    if (previousRow) {
        return previousRow.content_id || null;
    }

    if (!entry.is_folder && isTextEditableFile(entry.title)) {
        const content = entry.current_content || '';
        const contentId = generateContentHashBuffer(content);

        await historyModel.insertHistoryContent(connection, {
            contentId,
            content
        });

        return contentId;
    }

    return null;
};

const emitHistoryFileRestored = (req, projectId, payload = {}) => {
    const io = req.app.get('io');
    if (!io) return;

    const cleanProjectId = entryLogic.normalizeId(projectId);

    io.to(`project:${cleanProjectId}`).emit('history:file-restored', {
        projectId: cleanProjectId,
        ...payload,
        restoredAt: new Date().toISOString()
    });
};

const emitHistoryProjectRestored = (req, projectId, payload = {}) => {
    const io = req.app.get('io');
    if (!io) return;

    const cleanProjectId = entryLogic.normalizeId(projectId);

    io.to(`project:${cleanProjectId}`).emit('history:project-restored', {
        projectId: cleanProjectId,
        ...payload,
        restoredAt: new Date().toISOString()
    });
};

const createHttpError = (statusCode, message) => {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
};

const assertProjectOwner = async (connection, req, bProjectId) => {
    const requesterId = memberLogic.resolveRequesterId(req);

    if (!requesterId) {
        throw createHttpError(400, 'MISSING_REQUESTER_ID');
    }

    const bRequesterId = memberLogic.hexToBuffer(requesterId);

    if (!bRequesterId) {
        throw createHttpError(400, 'INVALID_REQUESTER_ID');
    }

    // projects.owner_id를 1차 기준으로 사용
    const project = await projectModel.findProjectOwnerForUpdate(connection, bProjectId);

    if (!project) {
        throw createHttpError(404, 'PROJECT_NOT_FOUND');
    }

    const ownerId = memberLogic.bufferToHex(project.owner_id);

    if (memberLogic.normalizeId(ownerId) !== memberLogic.normalizeId(requesterId)) {
        throw createHttpError(403, 'ONLY_OWNER_CAN_RESTORE_HISTORY');
    }

    // project_member role도 같이 검증해서 DB 불일치 방지
    const requesterMember = await memberModel.findMemberForUpdate(connection, {
        projectId: bProjectId,
        userId: bRequesterId
    });

    if (!requesterMember || requesterMember.role !== 'owner') {
        throw createHttpError(403, 'ONLY_OWNER_CAN_RESTORE_HISTORY');
    }

    return {
        requesterId: memberLogic.normalizeId(requesterId),
        ownerId
    };
};

const historyController = {

    /** [CREATE] 특정 프로젝트의 현재 상태를 버전(스냅숏)으로 저장 */
    saveProjectVersion: async (req, res) => {
        let { projectId } = req.params;
        const connection = await db.getConnection();

        try {
            await connection.beginTransaction();
            projectId = String(projectId || '').replace(/^0x/i, '');

            const bProjectId = projectLogic.hexToBuffer(projectId);
            const requesterId = memberLogic.resolveRequesterId(req);
            
            const bUserId = requesterId ? projectLogic.hexToBuffer(requesterId) : null;

            const project = await projectModel.findById(connection, bProjectId);
            if (!project) throw new Error("프로젝트를 찾을 수 없습니다.");

            const previousVersionMeta = await historyModel.findLatestVersionMeta(connection, bProjectId);

            const bVersionId = crypto.randomBytes(16);
            const rawVersionId = bVersionId.toString('hex');
            const createdAt = new Date();

            await historyModel.insertHistory(connection, {
                versionId: bVersionId,
                projectId: bProjectId,
                actionType: 'STRUCTURE',
                mainFileId: project.main_file_id,
                userId: bUserId
            });

            const currentEntries = await entryModel.findAllEntriesByProjectId(connection, bProjectId);

            if (currentEntries.length === 0) {
                await connection.rollback();
                return res.status(400).json({
                    status: "error",
                    message: "저장할 파일이나 폴더가 존재하지 않습니다."
                });
            }

            for (const entry of currentEntries) {
                let bContentId = null;

                if (!entry.is_folder && isTextEditableFile(entry.title)) {
                    bContentId = Buffer.isBuffer(entry.content_hash)
                        ? entry.content_hash
                        : generateContentHashBuffer(entry.current_content);

                    await historyModel.insertHistoryContent(connection, {
                        contentId: bContentId,
                        content: entry.current_content || ''
                    });
                }

                await historyModel.insertHistoryStructure(connection, {
                    versionId: bVersionId,
                    entryId: entry.id,
                    entryName: entry.title,
                    contentId: bContentId,
                    parentId: entry.parent_id,
                    isFolder: entry.is_folder
                });
            }

            const savedRowsForLog = await historyModel.findHistoryStructureByVersionId(connection, bVersionId);
            const previousRowsForLog = previousVersionMeta
                ? await historyModel.findHistoryStructureByVersionId(connection, previousVersionMeta.version_id)
                : [];
            const isLoglessVersionDeleted = await deleteHistoryVersionIfLogless(connection, {
                versionId: bVersionId,
                projectId: bProjectId,
                currentRows: savedRowsForLog,
                prevRows: previousRowsForLog
            });

            if (isLoglessVersionDeleted) {
                await connection.commit();
                return res.status(200).json({
                    status: "success",
                    message: "LOGLESS_HISTORY_VERSION_DELETED",
                    data: {
                        isVersionDeleted: true,
                        versionId: rawVersionId,
                        projectId
                    }
                });
            }

            await connection.commit();

            return res.status(201).json({
                status: "success",
                message: "현재 프로젝트 상태가 성공적으로 버전 저장되었습니다.",
                data: {
                    versionId: rawVersionId,
                    projectId,
                    createdAt
                }
            });
        } catch (error) {
            if (connection) await connection.rollback();
            console.error("[SAVE VERSION ERROR]", error.message);
            return res.status(500).json({
                status: "error",
                message: error.message || "히스토리 버전 저장 실패"
            });
        } finally {
            if (connection) connection.release();
        }
    },

    /** [READ] 특정 프로젝트의 버전 히스토리 목록 조회 */
    getProjectVersions: async (req, res) => {
        let { projectId } = req.params;
        let requesterId = memberLogic.resolveRequesterId(req);

        // [FIX] 요청자 ID 정규화 (0x 제거 및 소문자 통일)
        const normalizedRequesterId = requesterId 
            ? memberLogic.normalizeId(requesterId)
            : null;

        const connection = await db.getConnection();

        try {
            projectId = String(projectId || '').replace(/^0x/i, '');
            const bProjectId = projectLogic.hexToBuffer(projectId);
            const versions = await historyModel.findHistoryListByProjectId(connection, bProjectId);
            const versionHistories = [];

            for (let i = 0; i < versions.length; i += 1) {
                const currentVer = versions[i];
                const nextVer = versions[i + 1];
                const bVersionId = currentVer.version_id;

                const currentRows = await historyModel.findHistoryStructureByVersionId(connection, bVersionId);
                const prevRows = nextVer
                    ? await historyModel.findHistoryStructureByVersionId(connection, nextVer.version_id)
                    : [];

                const rawContributors = await historyModel.findContributorsByVersionId(connection, bVersionId, bProjectId);

                const actionUserIdHex = currentVer.user_id
                    ? currentVer.user_id.toString('hex').toLowerCase()
                    : '';

                const isActionMe = normalizedRequesterId && (actionUserIdHex === normalizedRequesterId);

                const mainEditorName = isActionMe ? "You" : (currentVer.user_name || "알 수 없는 사용자");

                // 기여자 목록 가공 (색상 계산에 필요한 userId 포함)
                const contributorMap = new Map();
                rawContributors.forEach((contributor, index) => {
                    const contributorUserIdHex = contributor.user_id
                        ? contributor.user_id.toString('hex').toLowerCase()
                        : '';
                    const isMe = normalizedRequesterId && contributorUserIdHex === normalizedRequesterId;
                    const isUnknown = !contributorUserIdHex || !contributor.user_name;
                    const displayName = isUnknown
                        ? "(알수없음)"
                        : isMe ? "You" : contributor.user_name;
                    const contributorKey = isUnknown
                        ? "unknown-" + (contributor.entry_id?.toString('hex') || index)
                        : contributorUserIdHex;

                    contributorMap.set(contributorKey, {
                        id: isUnknown ? "unknown" : contributorUserIdHex,
                        name: displayName,
                        userName: displayName,
                        isUnknown
                    });
                });

                // [STRUCTURE / CREATED 대응] 기여자 이력이 없다면 버전을 생성한 주 편집자를 목록에 포함
                if (contributorMap.size === 0 && mainEditorName) {
                    contributorMap.set(actionUserIdHex || "unknown", {
                        id: actionUserIdHex || "unknown",
                        name: actionUserIdHex ? mainEditorName : "(알수없음)",
                        isUnknown: !actionUserIdHex
                    });
                }

                // "You"가 목록에 있다면 항상 맨 앞으로 정렬
                const contributors = Array.from(contributorMap.values()).sort((a, b) => {
                    if (a.name === "You") return -1;
                    if (b.name === "You") return 1;
                    return 0;
                });

                const finalIsMe = isActionMe || contributors.some((contributor) => contributor.name === "You");

                const comparison = historyLogic.compareProjectStructures(currentRows, prevRows, 'log');
                let changedEntries = comparison
                    .filter((row) => row.label !== 'NONE')
                    .map((row) => ({
                        entryName: row.entry_name,
                        label: row.label
                    }));

                if (currentVer.restore_from_ver) {
                    changedEntries = [{
                        entryName: currentVer.restore_file_name || '전체 프로젝트',
                        label: 'RESTORED'
                    }];
                }

                versionHistories.push({
                    historyId: bVersionId.toString('hex'),
                    createdAt: currentVer.created_at,
                    editorName: mainEditorName,
                    isMe: Boolean(finalIsMe),
                    isRestored: currentVer.restore_from_ver !== null,
                    changedEntries,
                    contributors
                });
            }

            return res.status(200).json({
                status: "success",
                data: { histories: versionHistories }
            });
        } catch (error) {
            console.error("[FETCH VERSIONS ERROR]", error.message);
            return res.status(500).json({
                status: "error",
                message: error.message || "히스토리 목록 조회 실패"
            });
        } finally {
            if (connection) connection.release();
        }
    },

     /** [READ] 특정 히스토리 버전의 파일/폴더 구조 및 변경 라벨 조회 */
    getVersionStructure: async (req, res) => {
        let { historyId, projectId } = req.params; 
        const connection = await db.getConnection();

        try {
            historyId = String(historyId || '').replace(/^0x/i, '');
            projectId = String(projectId || '').replace(/^0x/i, '');

            const bVersionId = projectLogic.hexToBuffer(historyId);
            const bProjectId = projectLogic.hexToBuffer(projectId);

            //  모델 함수를 통해 현재 요청된 버전의 생성 시간 확인
            const currentVer = await historyModel.findHistoryByIdAndProjectId(connection, bVersionId, bProjectId);

            if (!currentVer) {
                return res.status(404).json({ status: "error", message: "존재하지 않는 버전입니다." });
            }

            // 모델 함수를 통해 동일 프로젝트의 바로 이전 버전 ID 조회
            const prevVer = await historyModel.findPreviousVersionId(connection, bProjectId, currentVer.created_at);

            // 모델 함수를 통해 현재 버전의 구조 조회
            const currentStructure = await historyModel.findHistoryStructureByVersionId(connection, bVersionId);

            //  이전 버전이 존재할 경우, 이전 버전의 구조 조회
            let prevStructure = [];
            if (prevVer) {
                prevStructure = await historyModel.findHistoryStructureByVersionId(connection, prevVer.version_id);
            }

            // 공통 로직을 사용하여 라벨 계산 ('label' 모드)
            const resultList = historyLogic.compareProjectStructures(currentStructure, prevStructure, 'label');

            //  [정렬 로직] 변경된 파일(Label이 NONE이 아닌 것)을 상단으로 배치
            resultList.sort((a, b) => {
                if (a.label !== 'NONE' && b.label === 'NONE') return -1;
                if (a.label === 'NONE' && b.label !== 'NONE') return 1;
                return 0;
            });

            // 응답 규격에 맞게 포맷팅
            const formattedFiles = resultList.map(f => ({
                entryId: f.entryId,
                entryName: f.entry_name,
                parentId: f.parent_id ? (typeof f.parent_id === 'string' ? f.parent_id : f.parent_id.toString('hex')) : null,
                isFolder: f.is_folder,
                contentId: f.content_id ? f.content_id.toString('hex') : null,
                label: f.label === 'NONE' ? null : f.label
            }));

            // 결과 응답 반환
            res.status(200).json({
                status: "success",
                data: {
                    versionId: historyId,
                    projectId: projectId,
                    files: formattedFiles
                }
            });

        } catch (error) {
            console.error("[GET VERSION STRUCTURE ERROR]", error.message);
            res.status(500).json({ status: "error", message: error.message || "버전 구조 조회 실패" });
        } finally {
            if (connection) connection.release();
        }
    },

    /** [GET] 특정 히스토리 버전의 특정 파일 코드 및 변경 라인 조회 */
    getVersionFileContent: async (req, res) => {
        let { historyId, projectId, entryId } = req.params;
        let connection;

        try {
            connection = await db.getConnection();

            historyId = String(historyId || '').replace(/^0x/i, '');
            projectId = String(projectId || '').replace(/^0x/i, '');
            entryId = entryLogic.normalizeId(entryId);

            const bVersionId = entryLogic.hexToBuffer(historyId);
            const bProjectId = entryLogic.hexToBuffer(projectId);
            const bEntryId = entryLogic.hexToBuffer(entryId);

            if (!bVersionId || !bProjectId || !bEntryId) {
                return res.status(400).json({ status: "error", message: "히스토리 파일 조회 ID가 올바르지 않습니다." });
            }

            // 현재 버전의 메타데이터 조회 (시간 추적 및 직전 버전 탐색용)
            const currentVer = await historyModel.findHistoryByIdAndProjectId(connection, bVersionId, bProjectId);
            if (!currentVer) {
                return res.status(404).json({ status: "error", message: "존재하지 않는 버전입니다." });
            }

            // 1. 요청된 버전 H(n) 시점의 파일 구조 조회
            const [currRows] = await connection.execute(
                `SELECT entry_name, content_id, is_folder 
                 FROM history_structure 
                 WHERE version_id = ? AND entry_id = ?`,
                [bVersionId, bEntryId]
            );

            let entryName = "";
            let currentContent = "";
            let label = "NONE";
            let changedLines = [];
            let previousContent = null;
            let fileFound = false;

            if (currRows && currRows.length > 0) {
                // [CASE A] 현재 버전 H(n)에 파일이 존재하는 경우
                const currEntry = currRows[0];
                if (currEntry.is_folder) {
                    return res.status(400).json({ status: "error", message: "폴더는 코드를 불러올 수 없습니다." });
                }

                fileFound = true;
                entryName = currEntry.entry_name;
                label = "ADDED"; 

                if (currEntry.content_id) {
                    const [contentRows] = await connection.execute(
                        `SELECT content FROM history_contents WHERE content_id = ?`,
                        [currEntry.content_id]
                    );
                    if (contentRows.length > 0) currentContent = contentRows[0].content;
                }

                // 직전 버전과 비교하여 상세 라벨 및 변경 라인 계산
                const prevVer = await historyModel.findPreviousVersionId(connection, bProjectId, currentVer.created_at);
                if (prevVer) {
                    const [prevRows] = await connection.execute(
                        `SELECT entry_name, content_id FROM history_structure WHERE version_id = ? AND entry_id = ?`,
                        [prevVer.version_id, bEntryId]
                    );

                    if (prevRows && prevRows.length > 0) {
                        const prevEntry = prevRows[0];
                        const currContentHex = currEntry.content_id ? currEntry.content_id.toString('hex') : null;
                        const prevContentHex = prevEntry.content_id ? prevEntry.content_id.toString('hex') : null;

                        if (currEntry.entry_name !== prevEntry.entry_name) {
                            label = "RENAMED";
                        } else if (isTextEditableFile(currEntry.entry_name) && currContentHex !== prevContentHex) {
                            label = "EDITED";
                            let prevContent = "";
                            if (prevEntry.content_id) {
                                const [prevContentRows] = await connection.execute(
                                    `SELECT content FROM history_contents WHERE content_id = ?`,
                                    [prevEntry.content_id]
                                );
                                if (prevContentRows.length > 0) prevContent = prevContentRows[0].content;
                            }
                            changedLines = historyLogic.getChangedLineNumbers(prevContent, currentContent);
                            previousContent = prevContent;
                        } else {
                            label = "NONE";
                        }
                    }
                }
            } else {
                // [CASE B] 현재 버전 H(n)에 파일이 없음 -> 삭제된 파일로 간주하고 H(n-1) 조회
                const prevVer = await historyModel.findPreviousVersionId(connection, bProjectId, currentVer.created_at);
                if (prevVer) {
                    const [prevRows] = await connection.execute(
                        `SELECT entry_name, content_id, is_folder 
                         FROM history_structure 
                         WHERE version_id = ? AND entry_id = ?`,
                        [prevVer.version_id, bEntryId]
                    );

                    if (prevRows && prevRows.length > 0) {
                        const prevEntry = prevRows[0];
                        if (prevEntry.is_folder) {
                            return res.status(400).json({ status: "error", message: "폴더 히스토리는 코드를 불러올 수 없습니다." });
                        }

                        fileFound = true;
                        entryName = prevEntry.entry_name;
                        label = "REMOVED"; 

                        if (prevEntry.content_id) {
                            const [contentRows] = await connection.execute(
                                `SELECT content FROM history_contents WHERE content_id = ?`,
                                [prevEntry.content_id]
                            );
                            if (contentRows.length > 0) currentContent = contentRows[0].content;
                        }
                    }
                }
            }

            if (!fileFound) {
                return res.status(404).json({ status: "error", message: "존재하지 않는 파일 히스토리입니다." });
            }

            const rawFileContributors = await historyModel.findContributorsByVersionId(connection, bVersionId, bProjectId);
            const fileContributors = rawFileContributors
                .filter((contributor) => contributor.entry_id && contributor.entry_id.equals(bEntryId))
                .map((contributor) => {
                    const contributorUserIdHex = contributor.user_id
                        ? contributor.user_id.toString("hex").toLowerCase()
                        : "";
                    const isUnknown = !contributorUserIdHex || !contributor.user_name;

                    const displayName = isUnknown ? "(알수없음)" : contributor.user_name;

                    return {
                        id: isUnknown ? "unknown" : contributorUserIdHex,
                        name: displayName,
                        userName: displayName,
                        isUnknown
                    };
                });

            return res.status(200).json({
                status: "success",
                data: {
                    historyId, projectId, entryId,
                    entryName,
                    content: currentContent,
                    label,
                    changedLines,
                    previousContent,
                    contributors: fileContributors
                }
            });
        } catch (error) {
            console.error("[GET VERSION FILE CONTENT ERROR]", error.message);
            return res.status(500).json({ status: "error", message: error.message || "파일 코드 조회 실패" });
        } finally {
            if (connection) connection.release();
        }
    },

    /**
     * [POST] 특정 파일을 과거 특정 히스토리 버전으로 롤백
     * 설명: 과거 파일 스냅숏을 복원하여 entry 업데이트하고,
     * 그 상태를 기반으로 프로젝트의 신규 히스토리 버전을 빌드
     */
    rollbackFile: async (req, res) => {
        let { projectId, entryId } = req.params;
        const { targetVersionId } = req.body; // 복구 타겟 과거 version_id (Hex)

        // 1. 가드레일 조건 체크
        if (!projectId || !entryId || !targetVersionId) {
            return res.status(400).json({
                status: "error",
                message: "projectId, entryId, targetVersionId는 필수 파라미터입니다."
            });
        }

        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();

            projectId = String(projectId || '').replace(/^0x/i, '');
            entryId = String(entryId || '').replace(/^0x/i, '');

            const bProjectId = entryLogic.hexToBuffer(projectId);
            const bTargetVersionId = projectLogic.hexToBuffer(targetVersionId);
            const requesterId = memberLogic.resolveRequesterId(req);

            await assertProjectOwner(connection, req, bProjectId);

            const project = await projectModel.findById(connection, bProjectId);
            if (!project) throw new Error("프로젝트를 찾을 수 없습니다.");

            // 1. 해당 버전 H(n)의 구조 로드하여 대상 파일의 부모 경로 추적
            const targetRows = await historyModel.findHistoryStructureByVersionId(connection, bTargetVersionId);
            let targetMap = new Map(targetRows.map(r => [r.entry_id.toString('hex'), r]));

            // [REMOVED 대응] 선택한 버전에 파일이 없으면 H(n-1)에서 찾기
            if (!targetMap.has(entryId)) {
                const targetMeta = await historyModel.findHistoryByIdAndProjectId(connection, bTargetVersionId, bProjectId);
                if (targetMeta) {
                    const prevVerId = await historyModel.findPreviousVersionId(connection, bProjectId, targetMeta.created_at);
                    if (prevVerId) {
                        const prevRows = await historyModel.findHistoryStructureByVersionId(connection, prevVerId.version_id);
                        targetMap = new Map(prevRows.map(r => [r.entry_id.toString('hex'), r]));
                    }
                }
            }

            if (!targetMap.has(entryId)) {
                await connection.rollback();
                return res.status(404).json({
                    status: "error",
                    message: "지정한 히스토리 버전(및 이전 버전)에서 해당 파일의 기록을 찾을 수 없습니다."
                });
            }

            // 2. 파일의 전체 계층 경로(루트 -> 대상 파일) 생성
            const pathNodes = [];
            let curr = targetMap.get(entryId);
            let missingAncestorId = null;
            while (curr) {
                pathNodes.unshift(curr);
                const pId = curr.parent_id ? curr.parent_id.toString('hex') : null;
                if (pId && !targetMap.has(pId)) {
                    missingAncestorId = pId;
                    break;
                }
                curr = pId ? targetMap.get(pId) : null;
            }

            if (missingAncestorId) {
                await connection.rollback();
                return res.status(409).json({
                    status: "error",
                    message: "히스토리 스냅숏의 부모 폴더 정보가 누락되어 파일 계층을 복원할 수 없습니다.",
                    data: { missingAncestorId }
                });
            }
            if (pathNodes[pathNodes.length - 1].is_folder === 1) {
                await connection.rollback();
                return res.status(400).json({ status: "error", message: "폴더 단위 롤백은 지원하지 않습니다." });
            }

            // 3. 라이브 테이블(entry)에 경로 복원 및 덮어쓰기 로직 수행
            let currentLiveParentId = null;
            let finalLiveId = null;

            for (let i = 0; i < pathNodes.length; i++) {
                const node = pathNodes[i];
                const isTargetFile = (i === pathNodes.length - 1);

                // [중복 검사] 현재 라이브 부모 아래 이름과 폴더 여부가 일치하는 항목이 있는지 확인
                const [existing] = await connection.execute(
                    `SELECT id FROM entry WHERE project_id = ? AND title = ? AND (parent_id <=> ?) AND is_folder = ?`,
                    [bProjectId, node.entry_name, currentLiveParentId, node.is_folder]
                );

                let liveId;
                if (existing.length > 0) {
                    // [CASE 1] 동일 이름 존재 -> 기존 ID 재사용 (덮어쓰기)
                    liveId = existing[0].id;
                    
                    if (isTargetFile) {
                        let rolledBackContent = "";
                        if (node.content_id) {
                            const [contentRows] = await connection.execute(
                                "SELECT content FROM history_contents WHERE content_id = ?",
                                [node.content_id]
                            );
                            rolledBackContent = contentRows[0]?.content || "";
                        }
                        const bNewContentHash = generateContentHashBuffer(rolledBackContent);
                        await connection.execute(
                            `UPDATE entry SET current_content = ?, content_hash = ?, is_folder = 0, updated_at = CURRENT_TIMESTAMP 
                             WHERE id = ?`,
                            [rolledBackContent, bNewContentHash, liveId]
                        );
                        finalLiveId = liveId;
                    }
                } else {
                    // [CASE 2] 같은 경로는 없지만 스냅숏 ID가 이미 다른 라이브 엔트리에 쓰이면 새 ID를 발급
                    const [idRows] = await connection.execute(
                        "SELECT id FROM entry WHERE project_id = ? AND id = ? LIMIT 1",
                        [bProjectId, node.entry_id]
                    );
                    liveId = idRows.length > 0 ? entryLogic.generateBinaryId() : node.entry_id;
                    let content = null;
                    let bHash = null;

                    if (isTargetFile) {
                        if (node.content_id) {
                            const [contentRows] = await connection.execute(
                                "SELECT content FROM history_contents WHERE content_id = ?",
                                [node.content_id]
                            );
                            content = contentRows[0]?.content || "";
                        } else {
                            content = "";
                        }
                        bHash = generateContentHashBuffer(content);
                        finalLiveId = liveId;
                    }
                    await connection.execute(
                        "INSERT INTO entry (id, project_id, parent_id, is_folder, title, current_content, content_hash) VALUES (?, ?, ?, ?, ?, ?, ?)",
                        [liveId, bProjectId, currentLiveParentId || null, Number(node.is_folder), node.entry_name, content, bHash]
                    );
                }
                currentLiveParentId = liveId;
            }

            // 5. [Model 연동] history 테이블에 신규 복구 버전 정보 발행
            const newVersionId = entryLogic.generateBinaryId();
            await historyModel.insertHistory(connection, {
                versionId: newVersionId,
                projectId: bProjectId,
                restoreFromVer: bTargetVersionId,
                restoreFileName: pathNodes[pathNodes.length - 1].entry_name,
                actionType: 'RESTORED',
                mainFileId: project.main_file_id,
                userId: requesterId ? memberLogic.hexToBuffer(requesterId) : null
            });

            // 6. [Model 연동] 새로운 히스토리 추적을 위해 현재 기준 전체 프로젝트 에셋 스냅숏 확보
            const currentProjectEntries = await historyModel.findLiveEntriesForSnapshot(connection, bProjectId);

            // 7. 전체 스냅숏 저장 루프 (Contents 및 Structure 적재)
            for (const entry of currentProjectEntries) {
                let bContentId = null;

                if (entry.is_folder === 0 && isTextEditableFile(entry.title)) {
                    bContentId = generateContentHashBuffer(entry.current_content || '');

                    await historyModel.insertHistoryContent(connection, {
                        contentId: bContentId,
                        content: entry.current_content || ''
                    });
                }

                // [Model 연동] 신규 버전 하위의 파일 구조 기록 박제
                await historyModel.insertHistoryStructure(connection, {
                    versionId: newVersionId,
                    entryId: entry.id,
                    entryName: entry.title,
                    contentId: bContentId,
                    parentId: entry.parent_id,
                    isFolder: entry.is_folder
                });
            }

            await connection.commit();

            const rolledBackEntryId = finalLiveId ? finalLiveId.toString('hex') : entryId;

            emitHistoryFileRestored(req, projectId, {
                entryId: rolledBackEntryId,
                rolledBackEntryId,
                targetVersionId,
                newVersionId: newVersionId.toString('hex'),
                restoreFromVer: targetVersionId,
                restoreFileName: pathNodes[pathNodes.length - 1].entry_name
            });

            return res.status(200).json({
                status: "success",
                statusCode: 200,
                message: "파일 단위 롤백 및 신규 히스토리 버전 생성이 완료되었습니다.",
                data: {
                    newVersionId: newVersionId.toString('hex'),
                    restoreFromVer: targetVersionId,
                    restoreFileName: pathNodes[pathNodes.length - 1].entry_name,
                    // [ACCEPT] finalLiveId가 null인 경우를 대비한 안전 가드
                    rolledBackEntryId: finalLiveId ? finalLiveId.toString('hex') : entryId
                }
            });
        } catch (error) {
            if (connection) await connection.rollback();

            const statusCode = error.statusCode || 500;
            console.error('[ROLLBACK FILE ERROR]', error.message);

            return res.status(statusCode).json({ status: "error", statusCode, message: error.message });
        } finally {
            if (connection) connection.release();
        }
    },

    /**
     * [POST] 프로젝트 전체를 과거 특정 히스토리 버전으로 롤백
     * URL 패턴: POST /api/histories/:historyId/:projectId/rollback
     * 설명: 과거 특정 버전(:historyId)의 전체 파일/폴더 스냅숏을 조회하여 현재 라이브 entry를 완전히 교체하고,
     * 이 롤백된 상태를 기점으로 프로젝트의 신규 히스토리 버전을 발행합니다.
     */
    rollbackProject: async (req, res) => {
        let { historyId, projectId } = req.params; // historyId = 복구 타겟 과거 version_id (Hex)

        historyId = String(historyId || '').replace(/^0x/i, '');
        projectId = String(projectId || '').replace(/^0x/i, '');

        // 1. 가드레일 조건 체크
        if (!historyId || !projectId) {
            return res.status(400).json({
                status: "error",
                message: "historyId와 projectId는 필수 파라미터입니다."
            });
        }

        const connection = await db.getConnection();
        let foreignKeyChecksDisabled = false;

        try {
            await connection.beginTransaction();

            const bTargetVersionId = entryLogic.hexToBuffer(historyId);
            const bProjectId = entryLogic.hexToBuffer(projectId);
            const requesterId = memberLogic.resolveRequesterId(req);

            const ownerInfo = await assertProjectOwner(connection, req, bProjectId);
            const targetHistory = await historyModel.findHistoryByIdAndProjectId(connection, bTargetVersionId, bProjectId);
            const project = await projectModel.findById(connection, bProjectId);
            if (!project) throw new Error("프로젝트를 찾을 수 없습니다.");

            await connection.query('SET FOREIGN_KEY_CHECKS = 0');
            foreignKeyChecksDisabled = true;

            // 2. 모델을 통해 과거 특정 시점의 프로젝트 전체 스냅숏(구조 + 본문) 조회
            const targetProjectSnapshot = await historyModel.findProjectSnapshot(connection, bTargetVersionId);

            if (!targetProjectSnapshot || targetProjectSnapshot.length === 0) {
                await connection.rollback();
                await connection.query('SET FOREIGN_KEY_CHECKS = 1');
                return res.status(404).json({
                    status: "error",
                    message: "지정한 히스토리 버전에서 프로젝트 데이터를 찾을 수 없거나 비어 있습니다."
                });
            }

            const restoredMainFileId = resolveSnapshotMainFileId({
                targetHistory,
                targetProjectSnapshot,
                currentMainFileId: project.main_file_id
            });

            // 3. 현재 라이브 에셋(entry) 전체 삭제 (과거 시점으로 깔끔하게 덮어쓰기 위함)
            await historyModel.deleteLiveEntriesByProjectId(connection, bProjectId);

            // 4. 과거 스냅숏 데이터를 순회하며 라이브 entry 테이블에 복원 기입
            for (const snap of targetProjectSnapshot) {
                let bContentHash = null;
                const rolledBackContent = snap.content || '';

                if (snap.is_folder === 0 && isTextEditableFile(snap.entry_name)) {
                    bContentHash = generateContentHashBuffer(rolledBackContent);
                }

                await historyModel.insertLiveEntry(connection, {
                    id: snap.entry_id,
                    projectId: bProjectId,
                    parentId: snap.parent_id,
                    isFolder: snap.is_folder,
                    title: snap.entry_name,
                    currentContent: snap.is_folder === 0 ? rolledBackContent : null,
                    contentHash: bContentHash
                });
            }

            // 5. history 테이블에 신규 복구 버전 정보 발행
            const newVersionId = entryLogic.generateBinaryId(); // 신규 16바이트 바이너리 ID 생성
            await historyModel.insertHistory(connection, {
                versionId: newVersionId,
                projectId: bProjectId,
                restoreFromVer: bTargetVersionId,
                restoreFileName: null, // ✨ 요청대로 전체 롤백이므로 파일명은 기입하지 않음(null)
                actionType: 'RESTORED',
                mainFileId: restoredMainFileId,
                userId: requesterId ? memberLogic.hexToBuffer(requesterId) : null
            });

            // 6. [Model 연동] 새로운 히스토리 추적을 위해 방금 복원 완료한 전체 에셋 스냅숏 확보
            const currentProjectEntries = await historyModel.findLiveEntriesForSnapshot(connection, bProjectId);

            // 7. 전체 스냅숏 저장 루프 (Contents 및 Structure 영구 적재)
            for (const entry of currentProjectEntries) {
                let bContentId = null;

                if (entry.is_folder === 0 && isTextEditableFile(entry.title)) {
                    bContentId = generateContentHashBuffer(entry.current_content || '');

                    await historyModel.insertHistoryContent(connection, {
                        contentId: bContentId,
                        content: entry.current_content || ''
                    });
                }

                await historyModel.insertHistoryStructure(connection, {
                    versionId: newVersionId,
                    entryId: entry.id,
                    entryName: entry.title,
                    contentId: bContentId,
                    parentId: entry.parent_id,
                    isFolder: entry.is_folder
                });
            }

            // [FIX] 과거 시점의 메인 파일 ID로 프로젝트 설정 복구
            if (restoredMainFileId) {
                await projectModel.updateMainFileId(connection, bProjectId, restoredMainFileId);
            }

            //  외래키 제약조건 재활성화 및 커밋
            await connection.query('SET FOREIGN_KEY_CHECKS = 1');
            foreignKeyChecksDisabled = false;
            await connection.commit();

            const mainEntryId = restoredMainFileId
                ? restoredMainFileId.toString('hex')
                : null;

            emitHistoryProjectRestored(req, projectId, {
                mainEntryId,
                targetVersionId: historyId,
                newVersionId: newVersionId.toString('hex'),
                restoreFromVer: historyId
            });

            return res.status(200).json({
                status: "success",
                message: "프로젝트 단위 전체 롤백 및 신규 히스토리 버전 생성이 완료되었습니다.",
                data: {
                    newVersionId: newVersionId.toString('hex'),
                    restoreFromVer: historyId,
                    mainEntryId
                }
            });

        } catch (error) {
            if (connection) {
                try {
                    if (foreignKeyChecksDisabled) {
                        await connection.query('SET FOREIGN_KEY_CHECKS = 1');
                    }
                } catch (fkError) {
                    console.error('[ROLLBACK PROJECT] FOREIGN_KEY_CHECKS restore failed:', fkError.message);
                }

                await connection.rollback();
            }

            const statusCode = error.statusCode || 500;
            console.error('[ROLLBACK PROJECT ERROR]', error.message);

            return res.status(statusCode).json({ status: "error", statusCode, message: error.message });
        } finally {
            if (connection) connection.release();
        }
    },

    /** 
     * [PATCH] 실시간 코드 편집 내용 동기화 (5분 가드레일)
     */
    syncLiveCodeEdit: async (req, res) => {
        let { projectId, entryId } = req.params;
        const { content, contributors } = req.body;
        const connection = await db.getConnection();

        try {
            await connection.beginTransaction();

            projectId = String(projectId || '').replace(/^0x/i, '');
            entryId = String(entryId || '').replace(/^0x/i, '');

            const bProjectId = projectLogic.hexToBuffer(projectId);
            const bEntryId = projectLogic.hexToBuffer(entryId);
            const requesterId = memberLogic.resolveRequesterId(req);

            const latestMeta = await historyModel.findLatestVersionMeta(connection, bProjectId);
            const project = await projectModel.findById(connection, bProjectId);
            if (!project) throw new Error("프로젝트를 찾을 수 없습니다.");

            const bContentId = generateContentHashBuffer(content);
            await historyModel.insertHistoryContent(connection, {
                contentId: bContentId,
                content: content || ""
            });

            await entryModel.updateContent(connection, {
                fileId: bEntryId,
                projectId: bProjectId,
                content,
                contentHash: bContentId
            });

            const now = new Date();
            let bTargetVersionId = latestMeta?.version_id;
            let isNewVersionCreated = false;

            if (!latestMeta) {
                isNewVersionCreated = true;
            } else {
                const latestAction = await getVersionActionType(connection, latestMeta, bProjectId);
                const timeDiffMs = now.getTime() - new Date(latestMeta.created_at).getTime();

                if (latestAction !== "EDITED" || timeDiffMs > 5 * 60 * 1000) {
                    isNewVersionCreated = true;
                }
            }

            if (isNewVersionCreated) {
                bTargetVersionId = crypto.randomBytes(16);
                const bUserId = requesterId ? projectLogic.hexToBuffer(requesterId) : null;

                await historyModel.insertHistory(connection, {
                    versionId: bTargetVersionId,
                    projectId: bProjectId,
                    actionType: "EDITED",
                    mainFileId: project.main_file_id,
                    userId: bUserId
                });

                const previousRows = latestMeta
                    ? await historyModel.findHistoryStructureByVersionId(connection, latestMeta.version_id)
                    : [];
                const previousStructureMap = buildStructureMap(previousRows);
                const currentEntries = await historyModel.findLiveEntriesForSnapshot(connection, bProjectId);

                for (const entry of currentEntries) {
                    const isEditedEntry = entry.id.equals(bEntryId);
                    const entryContentId = isEditedEntry
                        ? bContentId
                        : await resolveStructureContentId(connection, entry, previousStructureMap);

                    await historyModel.insertHistoryStructure(connection, {
                        versionId: bTargetVersionId,
                        entryId: entry.id,
                        entryName: entry.title,
                        contentId: entryContentId,
                        parentId: entry.parent_id,
                        isFolder: entry.is_folder
                    });
                }
            } else {
                await historyModel.updateHistoryStructureContent(connection, {
                    versionId: bTargetVersionId,
                    entryId: bEntryId,
                    contentId: bContentId
                });

                await historyModel.touchHistoryVersion(connection, {
                    versionId: bTargetVersionId,
                    actionType: "EDITED",
                    mainFileId: project.main_file_id
                });
            }

            if (Array.isArray(contributors)) {
                for (const contributor of contributors) {
                    if (!contributor?.id) continue;
                    
                    const cleanContributorId = String(contributor.id).replace(/^0x/i, '').toLowerCase();

                    await historyModel.insertHistoryContributor(connection, {
                        historyId: bTargetVersionId,
                        userId: projectLogic.hexToBuffer(cleanContributorId),
                        entryId: bEntryId,
                        editedAt: new Date(contributor.editedAt || Date.now())
                    });
                }
            }

            await connection.commit();

            return res.status(200).json({
                status: "success",
                message: "실시간 코드 편집이 히스토리에 반영되었습니다.",
                data: {
                    isNewVersionCreated,
                    versionId: bTargetVersionId.toString("hex")
                }
            });
        } catch (error) {
            if (connection) await connection.rollback();
            return res.status(500).json({ status: "error", message: error.message });
        } finally {
            if (connection) connection.release();
        }
    },

    /** 
     * [POST] 실시간 구조 변경 동기화 트리거 (5분 가드레일)
     * 설명: 파일 트리 구조(이동, 이름 변경, 생성, 삭제) 변경 시 히스토리에 반영합니다.
     */
    syncLiveStructureChange: async (req, res) => {
        let { projectId } = req.params;
        const connection = await db.getConnection();

        try {
            await connection.beginTransaction();
            projectId = String(projectId || '').replace(/^0x/i, '');

            const bProjectId = projectLogic.hexToBuffer(projectId);
            const requesterId = memberLogic.resolveRequesterId(req);

            // 1. 최신 히스토리 메타 확인
            const latestMeta = await historyModel.findLatestVersionMeta(connection, bProjectId);
            // 현재 프로젝트 메타데이터 조회 (메인 파일 ID 획득용)
            const project = await projectModel.findById(connection, bProjectId);
            if (!project) throw new Error("프로젝트를 찾을 수 없습니다.");
            const currentEntries = await historyModel.findLiveEntriesForSnapshot(connection, bProjectId);
            const latestRows = latestMeta
                ? await historyModel.findHistoryStructureByVersionId(connection, latestMeta.version_id)
                : [];
            const structureChanged = !latestMeta || hasStructureDiff(currentEntries, latestRows);

            if (!structureChanged) {
                await connection.commit();
                return res.status(200).json({
                    status: "success",
                    message: "파일 트리 구조 변경이 없어 히스토리 버전을 생성하지 않았습니다.",
                    data: {
                        isNewVersionCreated: false,
                        isStructureChanged: false,
                        versionId: latestMeta.version_id.toString('hex')
                    }
                });
            }

            const now = new Date();
            let bTargetVersionId = latestMeta?.version_id;
            let isNewVersionCreated = false;
            let prevRowsForLog = [];

            if (!latestMeta) {
                isNewVersionCreated = true;
            } else {
                // 실시간 타입 추론
                const latestAction = await getVersionActionType(connection, latestMeta, bProjectId);
                const timeDiffMs = now.getTime() - new Date(latestMeta.created_at).getTime();

                // [규칙] 직전이 'STRUCTURE'가 아니거나, 5분이 지났으면 새 버전 생성
                if (latestAction !== 'STRUCTURE' || timeDiffMs > 5 * 60 * 1000) {
                    isNewVersionCreated = true;
                }
            }

            // =================================================================
            // [CASE A] 5분 경과: 아예 새로운 버전을 만들고 전체 스냅숏 저장
            // =================================================================
            if (isNewVersionCreated) {
                bTargetVersionId = crypto.randomBytes(16);
                const bUserId = requesterId ? projectLogic.hexToBuffer(requesterId) : null;

                await historyModel.insertHistory(connection, {
                    versionId: bTargetVersionId,
                    projectId: bProjectId,
                    actionType: 'STRUCTURE',
                    mainFileId: project.main_file_id,
                    userId: bUserId
                });

                const previousRows = latestMeta
                    ? await historyModel.findHistoryStructureByVersionId(connection, latestMeta.version_id)
                    : [];
                prevRowsForLog = previousRows;
                const previousStructureMap = buildStructureMap(previousRows);
                // [ACCEPT] 새로운 버전 생성 시 현재 라이브 데이터를 전량 복제하여 박제
                for (const entry of currentEntries) {
                    const bContentId = await resolveStructureContentId(connection, entry, previousStructureMap);

                    await historyModel.insertHistoryStructure(connection, {
                        versionId: bTargetVersionId, entryId: entry.id, entryName: entry.title, contentId: bContentId, parentId: entry.parent_id, isFolder: entry.is_folder
                    });
                }
            } 
            // =================================================================
            // [CASE B] 5분 이내: 동일 버전 내부에서 정밀 비교 후 단일 행 조작 (핵심 기획)
            // =================================================================
            else {
                const prevVerForLog = latestMeta
                    ? await historyModel.findPreviousVersionId(connection, bProjectId, latestMeta.created_at)
                    : null;
                prevRowsForLog = prevVerForLog
                    ? await historyModel.findHistoryStructureByVersionId(connection, prevVerForLog.version_id)
                    : [];
                const previousStructureMap = buildStructureMap(latestRows);

                await historyModel.deleteHistoryStructureByVersionId(connection, bTargetVersionId);

                for (const entry of currentEntries) {
                    const bContentId = await resolveStructureContentId(connection, entry, previousStructureMap);

                    await historyModel.insertHistoryStructure(connection, {
                        versionId: bTargetVersionId,
                        entryId: entry.id,
                        entryName: entry.title,
                        contentId: bContentId,
                        parentId: entry.parent_id,
                        isFolder: entry.is_folder
                    });
                }
            }

            const finalRowsForLog = await historyModel.findHistoryStructureByVersionId(connection, bTargetVersionId);
            const isLoglessVersionDeleted = await deleteHistoryVersionIfLogless(connection, {
                versionId: bTargetVersionId,
                projectId: bProjectId,
                currentRows: finalRowsForLog,
                prevRows: prevRowsForLog
            });

            if (isLoglessVersionDeleted) {
                await connection.commit();
                return res.status(200).json({
                    status: "success",
                    message: "LOGLESS_HISTORY_VERSION_DELETED",
                    data: {
                        isNewVersionCreated: false,
                        isVersionDeleted: true,
                        versionId: bTargetVersionId.toString("hex")
                    }
                });
            }

            await historyModel.touchHistoryVersion(connection, {
                versionId: bTargetVersionId,
                actionType: 'STRUCTURE',
                mainFileId: project.main_file_id
            });

            await connection.commit();
            return res.status(200).json({
                status: "success",
                message: isNewVersionCreated ? "5분이 경과하여 새 스냅숏 버전을 빌드했습니다." : "5분 이내 변경이므로 기존 버전에 구조적 변경점을 정밀 동기화했습니다.",
                data: { isNewVersionCreated, versionId: bTargetVersionId.toString('hex') }
            });

        } catch (error) {
            if (connection) await connection.rollback();
            console.error('[SYNC LIVE STRUCTURE ERROR]', error.message);

            return res.status(500).json({ status: "error", message: error.message });
        } finally {
            if (connection) connection.release();
        }
    },

    /** [GET] 특정 히스토리 버전 전체를 ZIP으로 다운로드 */
    downloadVersionZip: async (req, res) => {
        let { historyId, projectId } = req.params;
        const connection = await db.getConnection();

        try {
            historyId = String(historyId || '').replace(/^0x/i, '');
            projectId = String(projectId || '').replace(/^0x/i, '');

            const bVersionId = projectLogic.hexToBuffer(historyId);
            const bProjectId = projectLogic.hexToBuffer(projectId);

            // 1. 버전 정보 조회 (생성일자 확인용)
            const history = await historyModel.findHistoryByIdAndProjectId(connection, bVersionId, bProjectId);
            if (!history) {
                return res.status(404).json({ status: "error", message: "존재하지 않는 버전입니다." });
            }

            // 2. 해당 버전의 전체 스냅숏(구조 + 본문) 조회
            const snapshot = await historyModel.findProjectSnapshot(connection, bVersionId);
            if (!snapshot || snapshot.length === 0) {
                return res.status(400).json({ status: "error", message: "다운로드할 데이터가 없는 빈 버전입니다." });
            }

            // 3. downloadLogic이 기대하는 형식으로 데이터 매핑
            // history_structure의 entry_name -> title, content -> current_content로 변환
            const entries = snapshot.map(s => ({
                id: s.entry_id,
                title: s.entry_name,
                parent_id: s.parent_id,
                is_folder: s.is_folder,
                current_content: s.content || ''
            }));

            // 4. 파일명 조립 (프로젝트명_날짜_버전ID)
            const project = await projectModel.findById(connection, bProjectId);
            const baseName = project ? project.title : 'project';
            const dateStr = new Date(history.created_at).toISOString().split('T')[0].replace(/-/g, '');
            const zipFileName = `${baseName}_ver_${dateStr}_${historyId.substring(0, 6)}`;

            // 5. ZIP 헤더 설정 및 스트리밍 압축 전송 (공통 로직 재사용)
            downloadLogic.setZipHeaders(res, zipFileName);
            await downloadLogic.pipeEntriesToZip(res, entries, projectId);

        } catch (error) {
            console.error("[VERSION DOWNLOAD ERROR]", error.message);
            if (!res.headersSent) {
                res.status(500).json({ status: "error", message: error.message || "버전 다운로드 실패" });
            }
        } finally {
            if (connection) connection.release();
        }
    }
};

module.exports = historyController;