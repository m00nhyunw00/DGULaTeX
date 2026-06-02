/**
 * =================================================================
 * [Logic] Entry Core Logic
 * 설명: 프로젝트 파일/폴더 엔트리의 생성, 이동, 삭제, 이름 변경 규칙을 처리함
 * =================================================================
 */
const entryModel = require('../models/entryModel');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

const entryLogic = {
    /** UUID 생성 및 Buffer 변환 */
    generateBinaryId: () => Buffer.from(uuidv4().replace(/-/g, ''), 'hex'),

    /** Hex 문자열을 Buffer로 변환 */
    hexToBuffer: (hex) => {
        if (!hex || hex === 'null' || hex === 'undefined') return null;
        
        try {
            let cleanHex = String(hex).trim();

            if (cleanHex.toLowerCase().startsWith('0x')) {
                cleanHex = cleanHex.slice(2);
            }

            cleanHex = cleanHex.replace(/-/g, '').toLowerCase();

            // UUID BINARY(16)은 hex 32자리여야 함
            if (!/^[0-9a-f]{32}$/.test(cleanHex)) {
                return null;
            }

            return Buffer.from(cleanHex, 'hex');
        } catch (err) {
            console.error("hexToBuffer 변환 중 에러 발생");
            return null;
        }
    },

    /** Buffer 또는 Hex ID를 프론트/응답용 hex 문자열로 변환 */
    bufferToHex: (value) => {
        if (!value) return null;

        if (Buffer.isBuffer(value)) {
            return value.toString('hex');
        }

        return String(value)
            .replace(/^0x/i, '')
            .replace(/-/g, '')
            .trim()
            .toLowerCase();
    },

    /** ID 비교용 정규화 */
    normalizeId: (id) => {
        if (!id) return '';

        return String(id)
            .replace(/^0x/i, '')
            .replace(/-/g, '')
            .trim()
            .toLowerCase();
    },

    /** role 값 정규화 */
    normalizeRole: (role) => {
        return String(role || '')
            .trim()
            .toLowerCase();
    },

    /** 이미지 업로드 - 파일명 특수문자 정화  */
    sanitizeFileName: (filename) => {
        return path.basename(filename).replace(/[^\w.\-가-힣]/g, '_');
    },

    /** 이미지 업로드 - 허용된 파일 타입 검증 */
    isAllowedUploadFile: (file) => {
        if (!file) return false;
        const allowedMimeTypes = new Set([
            'text/plain',
            'image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp', 'image/svg+xml',
            'application/pdf'
        ]);
        return allowedMimeTypes.has(file.mimetype) || file.originalname.endsWith('.tex');
    },

    /**  이미지 업로드 - 에러 발생 시 임시 파일 삭제  */
    removeTempFile: async (filePath) => {
        if (!filePath) return;
        await fs.rm(filePath, { force: true }).catch(() => {});
    },

    /** 단일 업로드 파일 검증 및 하이브리드(DB/디스크) 저장 처리 */
    saveUploadedFile: async (connection, { bProjectId, projectIdHex, targetParentBufferId, safeFileName, uploadedFile }) => {
        // 내부 함수 호출 시 entryLogic. 으로 통일감 있게 호출 
        if (!entryLogic.isAllowedUploadFile(uploadedFile)) {
            await entryLogic.removeTempFile(uploadedFile.path);
            const err = new Error('UNSUPPORTED_FILE_TYPE');
            err.statusCode = 400;
            throw err;
        }

        const cleanProjectIdHex = projectIdHex.replace(/^0x/i, '').toUpperCase();
        const entryIdBuffer = entryLogic.generateBinaryId();
        const entryIdHex = entryIdBuffer.toString('hex').toUpperCase();

        const ext = path.extname(safeFileName).toLowerCase();
        const isTextFile =
            uploadedFile.mimetype === 'text/plain' ||
            ['.tex', '.bib', '.txt', '.sty', '.cls', '.md'].includes(ext);

        if (isTextFile) {
            let textContent = '';
            if (uploadedFile.buffer) {
                textContent = uploadedFile.buffer.toString('utf8');
            } else if (uploadedFile.path) {
                textContent = await fs.readFile(uploadedFile.path, 'utf8');
            }

            if ((uploadedFile.size || 0) > 0 && textContent.length === 0) {
                throw new Error(`TEXT_FILE_READ_EMPTY: ${safeFileName}`);
            }

            const normalizedContent = textContent.replace(/\r\n/g, '\n');
            const contentHash = crypto.createHash('sha256').update(normalizedContent, 'utf8').digest();

            await entryModel.createEntry(connection, {
                id: entryIdBuffer,
                projectId: bProjectId,
                parentId: targetParentBufferId,
                isFolder: false,
                title: safeFileName,
                content: normalizedContent,
                contentHash,
                assetUrl: null
            });

            await entryLogic.removeTempFile(uploadedFile.path);
            return { id: entryIdHex, title: safeFileName, assetUrl: null };
        } else {
            // [이미지/PDF 등 바이너리 파일 처리 블록]
            const assetUrl = `/uploads/projects/${cleanProjectIdHex}/assets/${entryIdHex}/${safeFileName}`;

            await entryModel.createEntry(connection, {
                id: entryIdBuffer,
                projectId: bProjectId,
                parentId: targetParentBufferId,
                isFolder: false,
                title: safeFileName,
                content: null,
                assetUrl: assetUrl
            });

            const targetDir = path.join(process.cwd(), 'public', 'uploads', 'projects', cleanProjectIdHex, 'assets', entryIdHex);
            await fs.mkdir(targetDir, { recursive: true });
            const targetPath = path.join(targetDir, safeFileName);

            if (uploadedFile.buffer) {
                await fs.writeFile(targetPath, uploadedFile.buffer);
            } else if (uploadedFile.path) {
                await fs.rename(uploadedFile.path, targetPath);
            }

            return { id: entryIdHex, title: safeFileName, assetUrl: assetUrl };
        }
    },

    /** * 순환 참조 방지 로직: 목적지가 내 하위 항목인지 확인
     * 수정 내용: targetParentId가 null인 경우(루트 이동) 즉시 안전 판정
     */
    isDescendant: async (connection, targetParentId, myId) => {
        // [추가] 최상위(Root)로 이동하는 경우, 부모가 없으므로 순환 참조가 일어날 수 없음
        if (!targetParentId) return false;

        let currentParentId = targetParentId;
        
        try {
            while (currentParentId !== null) {
                // 조상 중에 내 ID와 일치하는 것이 있다면 -> 순환 참조 발생
                if (currentParentId.equals(myId)) {
                    return true;
                }

                const parentEntry = await entryModel.getEntryById(connection, currentParentId);
                
                // 더 이상 부모가 없거나 데이터가 없으면 루프 종료
                if (!parentEntry || !parentEntry.parent_id) {
                    break;
                }
                currentParentId = parentEntry.parent_id;
            }
            return false; 
        } catch (err) {
            console.error("순환 참조 체크 중 오류");
            return false; 
        }
    },

    prepareLocalFileEntry: (file) => {
        const newId = entryLogic.generateBinaryId();

        const parsedContent = file.buffer
            ? file.buffer.toString('utf8')
            : '';

        const normalizedContent = parsedContent.replace(/\r\n/g, '\n');

        const contentHash = crypto
            .createHash('sha256')
            .update(normalizedContent, 'utf8')
            .digest();

        return {
            id: newId,
            title: file.originalname,
            content: normalizedContent,
            contentHash
        };
    },

    formatEntryResponse: (entry, projectIdHex) => {
        const path = require('path');
        const entryIdHex = entry.id.toString('hex');
    
        // 확장자 체크 및 assetUrl 실시간 조합
        const ext = entry.title ? path.extname(entry.title).toLowerCase() : '';
        const isTextFile = ['.tex', '.bib', '.txt', '.sty'].includes(ext);
    
        let assetUrl = null;
        if (!isTextFile && !entry.is_folder) {
            const pIdUpper = projectIdHex ? projectIdHex.replace(/^0x/i, '').toUpperCase() : '';
            const eIdUpper = entryIdHex.replace(/^0x/i, '').toUpperCase();
            assetUrl = `/uploads/projects/${pIdUpper}/assets/${eIdUpper}/${entry.title}`;
        }

        //  프론트엔드가 원래 받던 규격  리턴하도록 통일
        return {
            fileId: entryIdHex,
            parentId: entry.parent_id ? entry.parent_id.toString('hex') : null,
            type: entry.is_folder ? 'folder' : 'file',
            fileName: entry.title,
            content: entry.current_content,
            assetUrl: assetUrl // 이미지 주소 추가
        };
    },

    // 프론트엔드 전달용 에디터 세션 데이터 포맷팅
    formatSessionResponse: (session) => {
        if (!session) return null;
        return {
            sessionId: session.session_id ? session.session_id.toString('hex') : null,
            projectId: session.project_id ? session.project_id.toString('hex') : null,
            userId: session.user_id ? session.user_id.toString('hex') : null,
            fileId: session.file_id ? session.file_id.toString('hex') : null,
            cursorLine: session.cursor_line ?? 0,
            cursorColumn: session.cursor_column ?? 0,
            lastPdfUrl: session.last_pdf_url || null
        };
    },

    /**
     *  --업로드-- 경로를 따라 폴더와 파일을 무조건 새로 생성하되, 동일 레벨 중복 시 넘버링하는 함수
     */
    createNumberedFolderTree: async (connection, { bProjectId, rootParentId, currentPath, folderCache, parentId }) => {
        // 경로를 슬래시(/) 기준으로 쪼개기
        const parts = currentPath.split('/');
        let fileName = parts.pop(); // 맨 마지막은 진짜 파일 이름

        let currentParentBufferId = rootParentId;
        let firstLevelEntryInfo = null;
        let currentPathKey = ''; 

        // ----------------------------------------------------------------------
        //  [경우 1] 폴더 구조 업로드일 때 (슬래시가 있는 경우)
        // ----------------------------------------------------------------------
        if (parts.length > 0) {
            for (let i = 0; i < parts.length; i++) {
                let folderName = parts[i];
                
                // 캐시 키 매핑 (세션 내 중복 생성 방지용)
                currentPathKey += (i === 0 ? folderName : `/${folderName}`);
                const cacheKey = `${bProjectId.toString('hex')}_${currentPathKey}`;

                if (folderCache.has(cacheKey)) {
                    // 이번 업로드 묶음에서 이미 만든 상위 계층 폴더면 그대로 부모 ID로 쓰기
                    currentParentBufferId = folderCache.get(cacheKey);
                } else {
                    //  오직 최상위 폴더 (i === 0) 일 때만 중복 검사 및 넘버링 진행
                    if (i === 0) {
                        let isFolderDuplicate = true;
                        let folderCounter = 1;
                        let originalFolderName = folderName;

                        while (isFolderDuplicate) {
                            isFolderDuplicate = await entryModel.checkDuplicateName(
                                connection, bProjectId, currentParentBufferId, folderName, null
                            );
                            if (isFolderDuplicate) {
                                folderName = `${originalFolderName} (${folderCounter})`;
                                folderCounter++;
                            }
                        }
                    }

                    // 최상위에서 넘버링이 끝났거나, 그 하위 폴더들은 중복 검사 없이 무조건 생성
                    const newFolderId = entryLogic.generateBinaryId();
                    await entryModel.createEntry(connection, {
                        id: newFolderId, projectId: bProjectId, parentId: currentParentBufferId,
                        isFolder: true, title: folderName, content: null
                    });

                    currentParentBufferId = newFolderId;
                    folderCache.set(cacheKey, currentParentBufferId);
                }

                // 프론트엔드 반환용 최상위 폴더 정보 저장 (넘버링 결과가 반영됨)
                if (i === 0 && !firstLevelEntryInfo) {
                    firstLevelEntryInfo = {
                        entryId: currentParentBufferId.toString('hex').toUpperCase(),
                        title: folderName, isFolder: true, parentId: parentId || null
                    };
                }
            }
        } 
        // ----------------------------------------------------------------------
        //  [경우 2] 순수 단일 파일 업로드일 때 (슬래시가 없는 경우)
        // ----------------------------------------------------------------------
        else {
            let isFileDuplicate = true;
            let fileCounter = 1;

            const lastDotIndex = fileName.lastIndexOf('.');
            const originalBaseName = lastDotIndex !== -1 ? fileName.substring(0, lastDotIndex) : fileName;
            const ext = lastDotIndex !== -1 ? fileName.substring(lastDotIndex) : '';

            // 현재 업로드 레벨에 이름 중복 검사 후 넘버링
            while (isFileDuplicate) {
                isFileDuplicate = await entryModel.checkDuplicateName(
                    connection, bProjectId, currentParentBufferId, fileName, null
                );
                if (isFileDuplicate) {
                    fileName = `${originalBaseName} (${fileCounter})${ext}`;
                    fileCounter++;
                }
            }
        }

        const isDirectFile = parts.length === 0;

        return {
            targetParentBufferId: currentParentBufferId,
            fileName, // 가공 완료된 파일 이름
            isDirectFile,
            firstLevelEntryInfo
        };
    },

    /**
     *  단일 파일 다운로드용 메타데이터 처리 및 분기 로직
     * @param {Object} entry - DB에서 조회한 엔트리 데이터
     * @param {string} projectIdHex - URL 파라미터 프로젝트 ID (Hex)
     * @param {string} entryIdHex - URL 파라미터 엔트리 ID (Hex)
     */
    processDownloadFile: (entry, projectIdHex, entryIdHex) => {
        const safeFileName = entry.title;

        //  브라우저 한글 깨짐 방지 RFC 5987 인코딩
        const encodedFileName = encodeURIComponent(safeFileName).replace(/['()]/g, escape);
        
        // 확장자 검사 로직(.tex 등의 확장자면 텍스트 데이터로 인식)
        const ext = path.extname(safeFileName).toLowerCase();
        const isTextExtension = ['.tex', '.bib', '.txt', '.toc', '.sty'].includes(ext);
        
        //  DB 가상 파일 (.tex, .bib 등 텍스트 편집 데이터)
        if ((entry.current_content !== undefined && entry.current_content !== null) || isTextExtension) {
            return {
                isTextOnly: true,
                contentType: 'text/plain; charset=utf-8',
                encodedFileName,
                //  만약 내용이 null이나 undefined라면 빈 파일이 내려가도록 빈 문자열('') 처리
                payload: entry.current_content || '' 
            };
        }   
        
        const cleanProjectId = projectIdHex.replace(/^0x/i, '').toUpperCase();
        const cleanEntryId = entryIdHex.replace(/^0x/i, '').toUpperCase();

        // 서버 디스크 에셋 파일 (이미지, PDF 등 바이너리 데이터)
        const physicalPath = path.join(
            process.cwd(),
            'public',
            'uploads',
            'projects',
            projectIdHex.toUpperCase(),
            'assets',
            entryIdHex.toUpperCase(),
            safeFileName
        );

        const validatedPath = physicalPath.replace(/\/assets\/\/+/g, '/assets/');
        
        // 확장자별 Content-Type 안전 매핑
        let contentType = 'application/octet-stream';
        if (ext === '.pdf') {
            contentType = 'application/pdf';
        } else if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'].includes(ext)) {
            contentType = ext === '.svg' ? 'image/svg+xml' : `image/${ext.replace('.', '')}`;
        }
        
        return {
            isTextOnly: false,
            contentType,
            encodedFileName,
            payload: validatedPath // 컨트롤러에서 res.sendFile 할 경로
        };
    }

};

module.exports = entryLogic;