/**
 * =================================================================
 * [Controller] Entry Controller
 * 설명: 요청 값 검증, 도메인 로직 호출, HTTP 응답 생성을 담당함
 * =================================================================
 */
const path = require('path');  // 다운로드 시 경로 조립
const fs = require('fs/promises'); // 서버디스크 에셋 존재 여부 체크 
const db = require('../models/db');
const entryModel = require('../models/entryModel');
const entryLogic = require('../logics/entryLogic');
const projectLogic = require('../logics/projectLogic');
const userModel = require('../models/userModel');
const crypto = require('crypto');  // 파일 내용(content) 해시값으로 바꿀 때 필요

/** [HELPER] 본문 내용 정규화 및 해시 생성 */
const generateHash = (content) => {
    const normalized = String(content ?? '').replace(/\r\n/g, '\n');
    return crypto.createHash('sha256')
        .update(normalized, 'utf8')
        .digest();
};

const emitProjectTreeUpdated = (req, projectId, payload = {}) => {
    const io = req.app.get('io');

    if (!io || !projectId) return;

    const cleanProjectId = entryLogic.normalizeId(projectId);

    io.to(`project:${cleanProjectId}`).emit('project:tree-updated', {
        projectId: cleanProjectId,
        ...payload,
        updatedAt: new Date().toISOString()
    });
};

const entryController = {
    createEntry: async (req, res) => {
        const { projectId } = req.params; 
        const { parentId, isFolder, title } = req.body; 
        if (!title || !title.trim()) {
            return res.status(400).json({ status: "error", message: "엔트리 제목(title)은 필수입니다." });
        }

        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();

            const newId = entryLogic.generateBinaryId();
            const bProjectId = entryLogic.hexToBuffer(projectId);
            const bParentId = entryLogic.hexToBuffer(parentId);
            
            const isDuplicate = await entryModel.checkDuplicateName(
                connection, 
                bProjectId, 
                bParentId, 
                title.trim(), 
                null
            );

            if (isDuplicate) {
                //  똑같은 이름이 있으면 롤백 후 409 에러 반환
                await connection.rollback();
                return res.status(409).json({ 
                    status: "error", 
                    statusCode: 409,
                    message: `현재 위치에 이미 '${title}' 이름의 ${isFolder ? '폴더' : '파일'}가 존재합니다.` 
                });
            }

            const normalizedTitle = title.trim();
            const initialContent = ''; // 초기 파일 생성 시 빈 문자열

            const contentHash = !isFolder ? generateHash(initialContent) : null;

            await entryModel.createEntry(connection, {
                id: newId,
                projectId: bProjectId,
                parentId: bParentId,
                isFolder: isFolder ? 1 : 0,
                title: normalizedTitle,
                content: isFolder ? null : initialContent,
                contentHash,
                assetUrl: null
            });

            await connection.commit();

            emitProjectTreeUpdated(req, projectId, {
                action: 'create',
                entryId: newId.toString('hex'),
                parentId: parentId || null,
                isFolder: Boolean(isFolder),
                title: normalizedTitle
            });

            res.status(201).json({
                status: "success",
                data: {
                    entryId: newId.toString('hex'),
                    fileName: normalizedTitle
                }
            });
        } catch (error) {
            if (connection) await connection.rollback();
            res.status(500).json({ status: "error", message: error.message });
        } finally {
            if (connection) connection.release();
        }
    },

    /** 단일 및 다중 완전 수용 삭제 액션 */
    deleteEntry: async (req, res) => {
        const { entryId } = req.params;
        const { entryIds } = req.body; 
        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();
            
            let idsToDelete = [];
            if (entryIds && Array.isArray(entryIds)) {
                idsToDelete = entryIds.map(id => entryLogic.hexToBuffer(id));
            } else if (entryId && entryId !== 'undefined') {
                idsToDelete = [entryLogic.hexToBuffer(entryId)];
            }

            if (idsToDelete.length === 0) {
                throw new Error("삭제 요청된 유효한 대상 ID 목록이 비어있습니다.");
            }

            for (const bId of idsToDelete) {
                if (bId) await entryModel.deleteEntry(connection, bId);
            }

            await connection.commit();

            emitProjectTreeUpdated(req, req.params.projectId, {
                action: 'delete',
                entryIds: idsToDelete
                    .filter(Boolean)
                    .map(id => id.toString('hex'))
            });

            res.status(200).json({ status: "success", message: "삭제 성공" });
        } catch (error) {
            if (connection) await connection.rollback();
            console.error("❌ 백엔드 삭제 트랜잭션 실패:", error.message);
            res.status(500).json({ status: "error", message: "삭제 실패" });
        } finally {
            if (connection) connection.release();
        }
    },

    getEntries: async (req, res) => {
        const { projectId } = req.params;
        const connection = await db.getConnection();
        try {
            const bProjectId = entryLogic.hexToBuffer(projectId);
            const entries = await entryModel.findAllEntriesByProjectId(connection, bProjectId);
            
            const formatted = entries.map(e => entryLogic.formatEntryResponse(e, projectId));

            res.status(200).json({ status: "success", data: formatted });
        } catch (error) {
            res.status(500).json({ status: "error", message: "조회 실패" });
        } finally {
            if (connection) connection.release();
        }
    },

    // 엔트리 이름 변경
    updateEntryTitle: async (req, res) => {
        const { entryId } = req.params; 
        const { newTitle } = req.body; 
        const connection = await db.getConnection(); 
        try {
            await connection.beginTransaction(); 

            const bEntryId = entryLogic.hexToBuffer(entryId);

            // 현재 엔트리 정보 가져오기
            const currentEntry = await entryModel.getEntryById(connection, bEntryId);
            if (!currentEntry) {
                return res.status(404).json({ status: "error", message: "대상을 찾을 수 없습니다." });
            }

            // 부모 id가 null 이면 최상위 엔트리
            const parentIdForCheck = currentEntry.parent_id || null;
            const bProjectId = currentEntry.project_id; // 내 진짜 주인 프로젝트 ID 추출

            // 동일 프로젝트 + 동일 부모일 때 동일 이름이 있는지 검사
            const isDuplicate = await entryModel.checkDuplicateName(
            connection, 
            bProjectId, 
            parentIdForCheck, 
            newTitle, 
            bEntryId // 나 자신은 중복 검사 대상에서 제외
            );

            if (isDuplicate) {
                return res.status(409).json({ 
                    status: "error", 
                    message: parentIdForCheck === null 
                        ? "이미 동일한 이름의 파일 또는 폴더가 존재합니다."
                        : "이미 동일한 이름의 파일 또는 폴더가 존재합니다." 
                });
            }

            // 중복이 없는 경우 이름 업데이트
            await entryModel.updateEntryTitle(connection, { id: bEntryId, title: newTitle });

            await connection.commit(); 

            emitProjectTreeUpdated(req, currentEntry.project_id.toString('hex'), {
                action: 'rename',
                entryId,
                newTitle
            });

            res.status(200).json({ status: "success", data: { entryId, newTitle } });
        } catch (error) {
            if (connection) await connection.rollback(); 
            res.status(500).json({ status: "error", message: error.message });
        } finally {
            if (connection) connection.release(); 
        }
    },

    /** 단일 및 다중 완전 포용 위치 이동 제어문 */
    moveEntry: async (req, res) => {
        const { entryId } = req.params;             
        const { entryIds, parentId, targetId } = req.body; 
        const connection = await db.getConnection();
        
        try {
            await connection.beginTransaction();

            let rawMoveIds = [];
            let rawDestinationId = parentId !== undefined ? parentId : targetId; 

            if (entryId) {
                rawMoveIds = [entryId];
                rawDestinationId = parentId; 
            } else {
                rawMoveIds = entryIds || [];
            }

            const bParentId = entryLogic.hexToBuffer(rawDestinationId);

            if (bParentId) {
                const targetFolder = await entryModel.getEntryById(connection, bParentId);
                if (!targetFolder || targetFolder.is_folder === 0) {
                    throw new Error("유효하지 않거나 존재하지 않는 목적지 폴더입니다.");
                }
            }

            if (rawMoveIds.length === 0) {
                throw new Error("이동 요청된 대상 파일/폴더 ID 리스트가 존재하지 않습니다.");
            }

            for (const idHex of rawMoveIds) {
                if (!idHex) continue;
                
                const bEntryId = entryLogic.hexToBuffer(idHex);

                // 이동하려는 파일/폴더 정보 불러오기
                const currentEntry = await entryModel.getEntryById(connection, bEntryId);
                if (!currentEntry) {
                    throw new Error(`이동하려는 대상[${idHex}]이 존재하지 않습니다.`);
                }

                // 같은 이름이 존재하는지 확인
                const isDuplicate = await entryModel.checkDuplicateName(
                    connection, 
                    currentEntry.project_id, // 현재 엔트리의 프로젝트 ID 버퍼
                    bParentId,               // 이동할 목적지 부모 ID 버퍼
                    currentEntry.title,      // 이동할 녀석의 이름
                    bEntryId                 // 본인 ID (이름 안 바꾸고 제자리 이동 시 중복처리 방지용)
                );

                if (isDuplicate) {
                    // 이름이 겹치면  에러를 던져 트랜잭션 롤백
                    throw new Error(`목적지 폴더에 이미 '${currentEntry.title}' 이름의 파일/폴더가 존재합니다.`);
                }
                if (bParentId) {
                    const isInvalid = await entryLogic.isDescendant(connection, bParentId, bEntryId);
                    if (isInvalid) {
                        throw new Error(`상위 폴더[${idHex}]를 자신의 하위 폴더 내부 계층으로 이동시킬 수 없습니다.`);
                    }
                }

                await entryModel.moveEntry(connection, { id: bEntryId, parentId: bParentId });
            }

            await connection.commit();

            emitProjectTreeUpdated(req, req.params.projectId, {
                action: 'move',
                entryIds: rawMoveIds.map(id =>
                    String(id || '').replace(/-/g, '').toLowerCase().trim()
                ),
                parentId: rawDestinationId || null
            });

            res.status(200).json({ status: "success", message: "이동 성공" });
        } catch (error) {
            if (connection) await connection.rollback();
            res.status(500).json({ status: "error", message: error.message });
        } finally {
            if (connection) connection.release();
        }
    },

    // 파일, 폴더 업로드 
    uploadEntry: async (req, res) => {
        const { projectId } = req.params;
        const { parentId, paths: rawPaths } = req.body || {}; 

        // 가드레일 조건 체크
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ status: "error", message: "업로드할 파일이 없습니다." });
        }

        // 파싱하기
        let paths = rawPaths;
        if (typeof paths === 'string') {
            try { paths = JSON.parse(paths); } catch (e) { paths = [paths]; }
        }   

        // 파일 개수 검증
        if (!paths || paths.length !== req.files.length) {
            return res.status(400).json({ status: "error", message: "업로드할 파일과 경로 데이터의 개수가 일치하지 않습니다." });
        }

        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();

            const bProjectId = entryLogic.hexToBuffer(projectId);
            const projectIdHex = projectId.toUpperCase();
            const rootParentId = parentId ? entryLogic.hexToBuffer(parentId) : null;

            const uploadedEntriesMap = new Map();
            const folderCache = new Map(); // 동일 세션 내 DB 조회 최적화 캐시

            
            // 파일 루프 돌며 트리 로직 함수 호출
            for (let i = 0; i < req.files.length; i++) {
                // entryLogic에 선언된 함수를 호출
                const { targetParentBufferId, fileName, isDirectFile, firstLevelEntryInfo } = 
                    await entryLogic.createNumberedFolderTree(connection, {
                        bProjectId, 
                        rootParentId, 
                        currentPath: paths[i], 
                        folderCache, 
                        parentId
                    });

                // 최종 파일 객체 가공 및 디비 인서트
                //const processedFile = entryLogic.prepareLocalFileEntry(req.files[i]);
                //processedFile.title = fileName;

                /*await entryModel.createEntry(connection, {
                    id: processedFile.id,
                    projectId: bProjectId,
                    parentId: targetParentBufferId, // 완성된 트리 부모 ID 매핑
                    isFolder: false,
                    title: processedFile.title,
                    content: processedFile.content
                }); */

                // 텍스트는 DB 본문으로, 이미지는 디스크로 찢어서 저장하는 로직 
                const savedFile = await entryLogic.saveUploadedFile(connection, {
                    bProjectId,
                    projectIdHex,
                    targetParentBufferId,
                    safeFileName: fileName, // 넘버링 처리가 완료된 안전한 파일명 토스
                    uploadedFile: req.files[i]
                });

                // 프론트엔드 반환용 응답 데이터 세팅 (중복 제거)
                if (isDirectFile) {
                    uploadedEntriesMap.set(savedFile.id, {
                        entryId: savedFile.id,
                        title: savedFile.title,
                        isFolder: false,
                        parentId: parentId || null,
                        assetUrl: savedFile.assetUrl // 💡 이미지/PDF 렌더링을 위한 에셋 URL 추가
                    });
                } else if (firstLevelEntryInfo) {
                    uploadedEntriesMap.set(firstLevelEntryInfo.entryId, firstLevelEntryInfo);
                }
        }

        await connection.commit();

        const uploadedEntries = Array.from(uploadedEntriesMap.values());

        emitProjectTreeUpdated(req, projectId, {
            action: 'upload',
            uploadedEntries
        });

        // 성공 리턴
        res.status(201).json({ 
            status: "success", 
            statusCode: 201,
            message: "엔트리 업로드가 완료되었습니다.",
            data: {
                uploadedFilesCount: req.files.length,
                uploadedEntries
            }
        });

        } catch (error) {
            if (connection) await connection.rollback();

            if (req.files) {
                for (const file of req.files) {
                    if (file.path) {
                        await entryLogic.removeTempFile(file.path);
                }
            }
        }
            console.error('[UPLOAD ERROR]', error.message);

            res.status(500).json({ status: "error", message: error.message });
        } finally {
            if (connection) connection.release();
        }
    },

    // [UPDATE] 파일 내용 실시간 업데이트 컨트롤러
    updateFileContent: async (req, res) => {
        const { projectId, entryId } = req.params;
        const { content } = req.body;

        // 1. 가드레일 조건 체크
        if (!projectId || !entryId || content === undefined) {
            return res.status(400).json({
                status: "error",
                message: "필수 요청 파라미터 또는 본문 내용(content)이 누락되었습니다."
            });
        }

        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();

            //  entryLogic의 Hex -> Buffer 변환기 
            const bProjectId = entryLogic.hexToBuffer(projectId);
            const bFileId = entryLogic.hexToBuffer(entryId);

            const normalizedContent = String(content ?? '').replace(/\r\n/g, '\n');
            const contentHash = generateHash(normalizedContent);

            //  entryModel 함수 호출
            const result = await entryModel.updateContent(connection, {
                fileId: bFileId,
                projectId: bProjectId,
                content: normalizedContent,
                contentHash
            });

            // 매칭되는 파일이 없는 경우 가드레일
            if (result.affectedRows === 0) {
                await connection.rollback();
                return res.status(404).json({
                    status: "error",
                    message: "수정할 파일을 찾을 수 없거나 폴더 엔트리입니다."
                });
            }

            await connection.commit();

            return res.status(200).json({
                status: "success",
                statusCode: 200,
                message: "파일 내용이 디비에 성공적으로 저장되었습니다."
            });

        } catch (error) {
            if (connection) await connection.rollback();
            console.error('[ENTRY CONTENT SAVE ERROR]', error.message);

            res.status(500).json({ status: "error", message: error.message });
        } finally {
            if (connection) connection.release();
        }
    },

    // [READ] 특정 파일 본문 내용 조회 컨트롤러
    getFileContent: async (req, res) => {
        const { projectId, entryId } = req.params;

        //  가드레일 조건 체크
        if (!projectId || !entryId) {
            return res.status(400).json({
                status: "error",
                message: "필수 요청 파라미터가 누락되었습니다."
            });
        }

        const connection = await db.getConnection();
        try {
            //  entryLogic 변환기 작동
            const bProjectId = entryLogic.hexToBuffer(projectId);
            const bFileId = entryLogic.hexToBuffer(entryId);

            // 모델 호출
            const fileData = await entryModel.getFileContent(connection, {
                fileId: bFileId,
                projectId: bProjectId
            });

            // 파일이 존재하지 않거나 폴더일 경우 예외 처리
            if (!fileData) {
                return res.status(404).json({
                    status: "error",
                    message: "파일을 찾을 수 없거나 폴더 엔트리입니다."
                });
            }

            // 성공 응답 (null일 경우 빈 문자열 "" 가드 처리)
            return res.status(200).json({
                status: "success",
                statusCode: 200,
                data: {
                    content: fileData.current_content !== null ? fileData.current_content : "",
                    contentHash: fileData.content_hash ? fileData.content_hash.toString('hex') : null
                }
            });

        } catch (error) {
            console.error('[ENTRY CONTENT FETCH ERROR]', error.message);

            res.status(500).json({ status: "error", message: error.message });
        } finally {
            if (connection) connection.release();
        }
    },

     // [PUT] 에디터 내 사용자 편집 세션 최신화 (Upsert)
    saveEditSession: async (req, res) => {
        const { projectId } = req.params;
        const { userId, fileId, cursorLine, cursorColumn, lastPdfUrl } = req.body;

        // 필수 값 가드레일 체크
        if (!projectId || !userId) {
            return res.status(400).json({
                status: "error",
                message: "projectId와 userId는 필수 파라미터입니다."
            });
        }

        const connection = await db.getConnection();

        try {
            //  Buffer로 변환
            const projectIdBuffer = entryLogic.hexToBuffer(projectId);
            const userIdBuffer = entryLogic.hexToBuffer(userId);
            const fileIdBuffer = entryLogic.hexToBuffer(fileId); // 내부적으로 null 체크.

            // 생성(INSERT) 시 사용될 session_id용 바이너리 
            const sessionIdBuffer = entryLogic.generateBinaryId();

            // 모델 함수 호출하여 DB에 세션 저장 (Upsert)
            await connection.beginTransaction();

            await entryModel.upsertEditSession(connection, {
                sessionId: sessionIdBuffer,
                projectId: projectIdBuffer,
                userId: userIdBuffer,
                fileId: fileIdBuffer,
                cursorLine: cursorLine || 0,
                cursorColumn: cursorColumn || 0,
                lastPdfUrl: lastPdfUrl || null
            });

            await connection.commit();

            return res.status(200).json({
                status: "success",
                statusCode: 200,
                message: "에디터 세션 상태가 성공적으로 업데이트되었습니다."
            });

        } catch (error) {
            if (connection) await connection.rollback();
            console.error("[SAVE SESSION ERROR]", error.message);
            res.status(500).json({ status: "error", message: "세션 저장 실패" });
        } finally {
            if (connection) connection.release();
        }
    },

    getEditSession: async (req, res) => {
        const { projectId } = req.params;
        const { userId } = req.query; 

        //  필수 값 가드레일 체크
        if (!projectId || !userId) {
            return res.status(400).json({
                status: "error",
                message: "projectId와 userId는 필수 파라미터입니다."
            });
        }

        const connection = await db.getConnection();

        try {
            //  entryLogic 헬퍼를 사용해 Hex를 Buffer로 변환
            const projectIdBuffer = entryLogic.hexToBuffer(projectId);
            const userIdBuffer = entryLogic.hexToBuffer(userId);

            //존재하는 유저인지 확인
            const isUserExist = await userModel.checkUserExistsById(connection, userIdBuffer);
            if (!isUserExist) {
                return res.status(404).json({
                    status: "error",
                    statusCode: 404,
                    message: "존재하지 않거나 유효하지 않은 사용자입니다."
                });
            }

            //  모델 호출하여 최종 세션 데이터 조회
            const sessionData = await entryModel.findEditSession(connection, projectIdBuffer, userIdBuffer);

            //  만약 기존 세션 기록이 없는 경우 (처음 에디터에 들어온 유저인 경우)
            if (!sessionData) {
                return res.status(200).json({
                    status: "success",
                    statusCode: 200,
                    message: "기존 세션 기록이 없습니다. 최초 진입입니다.",
                    data: null // 프론트가 null을 받으면 기본 첫 번째 파일을 열도록 처리할 수 있게 유연성 확보
                });
            }

            //  데이터가 있다면 바이너리 ID들을 다시 Hex(문자열)로 풀어서 프론트에 반환
            return res.status(200).json({
                status: "success",
                statusCode: 200,
                message: "성공적으로 최종 세션 상태를 조회했습니다.",
                data: entryLogic.formatSessionResponse(sessionData)
            });

        } catch (error) {
            console.error("[GET SESSION ERROR]", error.message);
            res.status(500).json({ status: "error", message: "세션 조회 실패" });
        } finally {
            if (connection) connection.release();
        }
    },

    //  단일 파일 다운로드  
    downloadSingleFile: async (req, res) => {
        const { projectId, entryId } = req.params;
        const connection = await db.getConnection();

        try {
            const bProjectId = projectLogic.hexToBuffer(projectId);
            const bEntryId = entryLogic.hexToBuffer(entryId);
        
            // DB 조회 (Model 의존)
            const entry = await entryModel.getEntryById(connection, bEntryId);
            if (!entry) {
                return res.status(404).json({ status: "error", message: "존재하지 않는 파일입니다." });
            }

            // 권한 검증 및 폴더 차단 가드레일 (Controller 선제 필터링)
            if (!entry.project_id.equals(bProjectId)) {
                return res.status(403).json({ 
                    status: "error", 
                    message: "잘못된 요청이거나 해당 파일에 대한 접근 권한이 없습니다." 
                });
            }

            if (entry.is_folder === 1) {
                return res.status(400).json({ status: "error", message: "폴더는 단일 다운로드가 불가능합니다." });
            }

            // 파일 포맷 가공 위임 (Logic 의존)
            const fileMeta = entryLogic.processDownloadFile(
                entry, 
                projectId.toString().replace(/^0x/i, ''), 
                entryId.toString().replace(/^0x/i, '')
            );

            // 다운 파일이 일반 텍스트일 경우 헤더 붙여서 전송
            if (fileMeta.isTextOnly) {
                res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${fileMeta.encodedFileName}`);
                res.setHeader('Content-Type', fileMeta.contentType);
                return res.send(fileMeta.payload); 
            }

            // 이미지 등 바이너리 데이터일 경우 (절대 경로 처리 및 에러 방어)
            const absolutePath = path.resolve(fileMeta.payload);
            try {
                await fs.access(absolutePath);

                // 파일이 진짜 존재하는 게 확인된 타이밍에 헤더   
                res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${fileMeta.encodedFileName}`);
                res.setHeader('Content-Type', fileMeta.contentType);

                return res.sendFile(absolutePath); // 절대 경로 전송
            } catch (fsErr) {
                console.error('[DOWNLOAD FILE ACCESS ERROR]');

                return res.status(404).json({ status: "error", message: "디비 데이터는 존재하나 서버 스토리지에 물리 파일이 없습니다." });
            }

        } catch (error) {
            console.error("단일 파일 다운로드 트랜잭션 에러:", error.message);
            res.setHeader('Content-Type', 'application/json');
            res.status(500).json({ status: "error", message: error.message });
        } finally {
            if (connection) connection.release();
        }
    }    
    
};

module.exports = entryController;