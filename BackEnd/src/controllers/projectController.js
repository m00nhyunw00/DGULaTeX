/**
 * =================================================================
 * [Controller] Project Controller
 * 설명: 요청 값 검증, 도메인 로직 호출, HTTP 응답 생성을 담당함
 * =================================================================
 */
const projectModel = require('../models/projectModel');
const userModel = require('../models/userModel');
const projectLogic = require('../logics/projectLogic');
const entryLogic = require('../logics/entryLogic');
const entryModel = require('../models/entryModel');
const downloadLogic = require('../logics/downloadLogic');
const memberModel = require('../models/memberModel');
const historyModel = require('../models/historyModel');
const db = require('../models/db');
const crypto = require('crypto');
const {
    emitToUserDashboard,
    forceLeaveUserFromProject
} = require('../socket/socketEmitters');

const generateContentHashBuffer = (content) => {
    const normalized = String(content ?? "").replace(/\r\n/g, "\n");
    return crypto.createHash("sha256")
        .update(normalized, "utf8")
        .digest();
};

const projectController = {
    /** [GET ALL] 특정 유저의 프로젝트 목록 조회(로그인 직후 화면) */
    getProjects: async (req, res) => {

        const { ownerId, type = 'all' } = req.query;
        const connection = await db.getConnection();

        /**
         * [도우미] 학번을 UUID Hex 문자열로 변환하는 정류 로직
         * (projectModel 쿼리에서 owner_id를 제대로 가져오지 못했거나
         *  DB 데이터가 불완전하여 owner_id가 null인 경우를 대비한 fallback)
         */
        const resolveUuidFromStudentId = async (conn, studentId) => {
            if (!studentId) return null;
            const user = await userModel.findUserIdByStudentId(conn, studentId);
            return user ? user.id.toString('hex') : null;
        };

        const resolveUserFromOwnerId = async (conn, rawOwnerId) => {
            const normalized = String(rawOwnerId || "").replace(/^0x/i, "").replace(/-/g, "").trim();

            if (/^[0-9a-fA-F]{32}$/.test(normalized)) {
                return { id: Buffer.from(normalized.toLowerCase(), "hex") };
            }

            return userModel.findUserIdByStudentId(conn, rawOwnerId);
        };

        try {
            const user = await resolveUserFromOwnerId(connection, ownerId);

            if (!user) {
                return res.status(200).json({ 
                    status: "success", 
                    data: { projects: [] },
                    message: "요청한 사용자의 프로젝트를 찾을 수 없습니다."
                });
            }

            let rows;

            if (type === 'shared') {
                // [공유받은 프로젝트] 내가 소유자는 아니지만 멤버로 참여 중인 것
                rows = await projectModel.findAllSharedByUser(connection, user.id);
            } else if (type === 'my') {
                // [나의 프로젝트] 내가 Owner(소유자)인 것
                rows = await projectModel.findAllByOwner(connection, user.id);
            } else {
                // [전체 프로젝트] 내 것과 공유받은 것 모두 포함
                const myRows = await projectModel.findAllByOwner(connection, user.id);
                const sharedRows = await projectModel.findAllSharedByUser(connection, user.id);
                
                // 두 배열을 하나로 합친 뒤, updated_at(최신 수정일) 기준으로 내림차순 정렬
                rows = [...myRows, ...sharedRows].sort((a, b) => {
                    return new Date(b.updated_at) - new Date(a.updated_at);
                });
            }

            /**
             * [FIX] 변수 중복 선언 오류 해결 및 데이터 매핑 최적화
             * 프론트엔드(React)에서 권한 확인을 위해 ownerUuid(Hex)와 
             * 화면 표시를 위한 ownerId(학번)가 모두 필요합니다.
             */
            const formattedProjects = await Promise.all(rows.map(async p => { // 비동기 작업을 위해 Promise.all 사용
                // 기본 포맷팅 (id, title, ownerName, updatedAt, ownerId 포함)
                // projectLogic.formatProjectResponse 내부에서 p.owner_id (UUID)를 이용해
                // 소유자의 학번과 이름을 조회하여 item에 담는다고 가정합니다.
                const item = projectLogic.formatProjectResponse(p, ownerId); 

                let resolvedOwnerUuid = null;
                // 1. 프로젝트 객체에 직접 owner_id (UUID Buffer)가 있다면 사용
                if (p.owner_id && Buffer.isBuffer(p.owner_id)) {
                    resolvedOwnerUuid = p.owner_id.toString('hex');
                } else if (item.ownerId) {
                    // 2. p.owner_id가 없거나 유효한 UUID Buffer가 아니지만, item.ownerId (프로젝트 소유자 학번)이 있다면 이를 이용해 UUID 조회
                    // 이 경우는 projectModel 쿼리에서 owner_id를 제대로 가져오지 못했거나 DB 데이터가 불완전한 경우를 보완합니다.
                    resolvedOwnerUuid = await resolveUuidFromStudentId(connection, item.ownerId);
                }

                return {
                    ...item,
                    ownerUuid: resolvedOwnerUuid
                };
            }));

            res.json({
                status: "success",
                data: { projects: formattedProjects }
            });

        } catch (error) {
            console.error("[FETCH ERROR]", error.message);
            res.status(500).json({ status: "error", message: "조회 실패" });
        } finally {
            connection.release();
        }
    },

    /** [GET BY ID] 특정 프로젝트 상세 정보 조회 (에디터 입장용) */
    getProjectById: async (req, res) => {
        const { id } = req.params;
        const connection = await db.getConnection();
        try {
            const projectIdBuffer = projectLogic.hexToBuffer(id);
            
            const project = await projectModel.findById(connection, projectIdBuffer);
            if (!project) {
                return res.status(404).json({ status: "error", message: "프로젝트를 찾을 수 없습니다." });
            }

            const entries = await entryModel.findAllEntriesByProjectId(connection, projectIdBuffer);
            const formattedData = projectLogic.formatProjectDetailResponse(project, entries);

            res.json({ status: "success", data: formattedData });
        } catch (error) {
            console.error("[DETAIL ERROR]", error.message);
            res.status(500).json({ status: "error", message: "상세 정보 조회 실패" });
        } finally {
            connection.release();
        }
    },

    /** [CREATE] 신규 프로젝트 생성 */
    createProject: async (req, res) => {
        const { title, ownerId } = req.body;
        const connection = await db.getConnection();

        try {
            await connection.beginTransaction();
            
            const cleanOwnerId = String(ownerId || "").replace(/^0x/i, "").replace(/-/g, "").trim();
            const user = /^[0-9a-fA-F]{32}$/.test(cleanOwnerId)
                ? await userModel.findById(connection, projectLogic.hexToBuffer(cleanOwnerId))
                : await userModel.findUserIdByStudentId(connection, ownerId);
            if (!user) {
                await connection.rollback();
                return res.status(404).json({ status: "error", message: "사용자를 찾을 수 없습니다." });
            }

            // 2. 프로젝트 및 메인 파일 ID 생성 (16바이트 바이너리)
            const projectId = projectLogic.generateBinaryId();
            const entryId = projectLogic.generateBinaryId();
            const initialContent = '';
            const contentHash = generateContentHashBuffer(initialContent);

            await projectModel.insertProject(connection, {
                id: projectId,
                title,
                ownerId: user.id
            });

            // 3. 기본 main.tex 엔트리 생성
            await entryModel.createEntry(connection, { 
                id: entryId, 
                projectId, 
                parentId: null, 
                isFolder: 0, 
                title: 'main.tex', 
                content: initialContent,
                contentHash 
            });

            // 4. 프로젝트 소유 정보 및 초기 히스토리 기록
            await projectModel.updateMainFileId(connection, projectId, entryId);
            await memberModel.insertProjectMember(connection, { projectId, userId: user.id, role: 'owner' });

            const versionId = projectLogic.generateBinaryId();

            await historyModel.insertHistory(connection, {
                versionId,
                projectId,
                actionType: 'CREATED',
                mainFileId: entryId,
                userId: user.id // 프로젝트 생성자의 ID (UUID) 전달
            });

            await historyModel.insertHistoryContent(connection, {
                contentId: contentHash,
                content: initialContent
            });

            await historyModel.insertHistoryStructure(connection, {
                versionId,
                entryId,
                entryName: 'main.tex',
                contentId: contentHash,
                parentId: null,
                isFolder: 0
            });

            await connection.commit();
            res.status(201).json({ 
                status: "success", 
                data: { 
                    projectId: projectId.toString('hex'),
                    title: title,
                    createdAt: new Date().toISOString()
                }
            });
        } catch (error) {
            await connection.rollback();
            res.status(500).json({ status: "error", message: error.message });
        } finally {
            connection.release();
        }
    },

    /** [DELETE] 프로젝트 삭제 */
    deleteProject: async (req, res) => {
        const { id } = req.params;
        const requesterId = req.query.requesterId || req.body?.requesterId || req.headers['x-user-id'];
        const connection = await db.getConnection();

        try {
            const projectIdBuffer = projectLogic.hexToBuffer(id);
            const project = await projectModel.findById(connection, projectIdBuffer);

            if (!project) {
                return res.status(404).json({ status: "error", message: "프로젝트를 찾을 수 없습니다." });
            }

            const cleanRequesterId = String(requesterId || "").replace(/^0x/i, "").replace(/-/g, "").toLowerCase().trim();
            const ownerIdHex = project.owner_id ? project.owner_id.toString("hex").toLowerCase() : "";

            if (!cleanRequesterId || cleanRequesterId !== ownerIdHex) {
                return res.status(403).json({ status: "error", message: "프로젝트 삭제는 owner만 가능합니다." });
            }

            const projectMembers = await memberModel.findMembersByProjectId(connection, projectIdBuffer);
            const targetMembers = projectMembers.filter((member) => {
                const memberId = member.user_id ? member.user_id.toString("hex").toLowerCase() : "";
                return memberId && memberId !== ownerIdHex;
            });
            const cleanProjectId = String(id || "").replace(/^0x/i, "").replace(/-/g, "").toLowerCase().trim();
            const deletedAt = new Date().toISOString();

            await projectModel.deleteProject(connection, projectIdBuffer);

            const io = req.app.get('io');

            if (io) {
                try {
                    const payload = {
                        projectId: cleanProjectId,
                        projectTitle: project.title || "프로젝트",
                        ownerId: ownerIdHex,
                        ownerName: project.owner_name || "사용자",
                        reason: "PROJECT_DELETED",
                        deletedAt
                    };

                    io.to(`project:${cleanProjectId}`).emit(
                        'member:removed-from-project',
                        {
                            projectId: cleanProjectId,
                            reason: 'PROJECT_DELETED',
                            projectDeleted: true,
                            lastEditSessionDeleted: true,
                            updatedAt: deletedAt
                        }
                    );

                    for (const member of targetMembers) {
                        const memberId = member.user_id.toString("hex").toLowerCase();

                        await emitToUserDashboard(
                            io,
                            memberId,
                            'dashboard:project-removed',
                            {
                                ...payload,
                                removedRole: member.role,
                                updatedAt: deletedAt
                            }
                        );

                        await forceLeaveUserFromProject(
                            io,
                            cleanProjectId,
                            memberId
                        );
                    }
                } catch (socketError) {
                    console.error('[PROJECT DELETE SOCKET BROADCAST ERROR]', socketError.message);
                }
            }

            res.json({ 
                status: "success", 
                data: { message: "프로젝트가 성공적으로 삭제되었습니다." } 
            });
        } catch (error) {
            res.status(500).json({ status: "error", message: "삭제 실패" });
        } finally {
            connection.release();
        }
    },

    /** [UPDATE] 사용자가 원하는 파일로 메인 컴파일 파일 변경 */
    setMainEntry: async (req, res) => {
        const { projectId } = req.params;
        const { mainEntryId } = req.body; // 프론트에서 넘겨줄 새로운 메인 파일의 Hex ID
        
        const connection = await db.getConnection();

        try {
            await connection.beginTransaction();

            // 라우터에서 받아온 Hex 문자열 ID들을 Buffer로 변환
            const bProjectId = projectLogic.hexToBuffer(projectId);
            const bMainEntryId = projectLogic.hexToBuffer(mainEntryId);

            // projectModel을 호출하여 main_entry_id 컬럼을 새 파일 ID로 업데이트
            // 프로젝트 create 에서 사용한 updateMainFileId 함수를 재사용
            const result = await projectModel.updateMainFileId(connection, bProjectId, bMainEntryId);
        
            // 객체 추출
            const affectedRows = (Array.isArray(result) && result[0]) 
            ? result[0].affectedRows 
            : (result ? result.affectedRows : 0);

            // 변경된 행이 없다면 프로젝트가 존재하지 않는 것임
            if (affectedRows === 0) {
                throw new Error("대상 프로젝트를 찾을 수 없습니다.");
            }

            await connection.commit();

            const io = req.app.get('io');

            if (io) {
                const cleanProjectId = entryLogic.normalizeId(projectId);
                const cleanMainEntryId = entryLogic.normalizeId(mainEntryId);

                io.to(`project:${cleanProjectId}`).emit('project:tree-updated', {
                    projectId: cleanProjectId,
                    action: 'main-entry',
                    entryId: cleanMainEntryId,
                    updatedAt: new Date().toISOString()
                });
            }

            res.status(200).json({ 
                status: "success", 
                message: "메인 파일이 성공적으로 변경되었습니다." 
            });

        } catch (error) {
            if (connection) await connection.rollback();
            console.error("[SET MAIN ENTRY ERROR]", error.message);
            res.status(500).json({ status: "error", message: error.message });
        } finally {
            if (connection) connection.release();
        }
    },

    // [UPDATE] 프로젝트 정보 수정(이름 변경) 컨트롤러
    updateProjectTitle: async (req, res) => {
        let { projectId } = req.params; 
        const { title } = req.body;

        //  가드레일 체크
        if (!projectId || !title || title.trim() === "") {
            return res.status(400).json({
                status: "error",
                message: "프로젝트 ID 또는 수정할 이름(title)이 올바르지 않습니다."
            });
        }

        projectId = projectId.replace(/^0x/i, '');

        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();

            const projectIdBuffer = projectLogic.hexToBuffer(projectId);

            //  모델 호출
            const result = await projectModel.updateTitle(connection, {
                projectId: projectIdBuffer,
                title: title.trim()
            });

            if (result.affectedRows === 0) {
                await connection.rollback();
                return res.status(404).json({
                    status: "error",
                    message: "수정할 프로젝트를 찾을 수 없습니다."
                });
            }

            await connection.commit();
            return res.status(200).json({
                status: "success",
                statusCode: 200,
                message: "프로젝트 정보가 변경되었습니다."
            });

        } catch (error) {
        if (connection) await connection.rollback();
            console.error("[UPDATE PROJECT ERROR]", error.message);
            res.status(500).json({ status: "error", message: "프로젝트 수정 실패" });
        } finally {
            if (connection) connection.release();
        }   
    },

    downloadProjectZip: async (req, res) => {
        const { projectId } = req.params;
        const connection = await db.getConnection();

        try {
            const bProjectId = projectLogic.hexToBuffer(projectId);

            // 프로젝트 정보 조회 (ZIP 파일명 추출용)
            const project = await projectModel.findById(connection, bProjectId);
            if (!project) {
                return res.status(404).json({ status: "error", message: "존재하지 않는 프로젝트입니다." });
            }

            //  프로젝트에 속한 모든 엔트리(파일/폴더) 조회
            const entries = await entryModel.findAllEntriesByProjectId(connection, bProjectId);
            if (!entries || entries.length === 0) {
                return res.status(400).json({ status: "error", message: "다운로드할 파일이 없는 빈 프로젝트입니다." });
            }

            //  다운로드용 ZIP 헤더 세팅 위임 
            downloadLogic.setZipHeaders(res, project.title || 'project');

            //  실시간 ZIP 압축 및 스트리밍 전송 위임 
            await downloadLogic.pipeEntriesToZip(res, entries, projectId);

        } catch (error) {
            console.error("프로젝트 전체 다운로드 트랜잭션 에러:", error.message);
            if (!res.headersSent) {
                res.status(500).json({ status: "error", message: error.message });
            }
        } finally {
            if (connection) connection.release();
        }
    }
};

module.exports = projectController;
