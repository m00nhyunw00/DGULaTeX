/**
 * =================================================================
 * [Model] History Model Data Access
 * 설명: MySQL 테이블 조회와 변경 쿼리를 캡슐화하여 상위 계층에 제공함
 * =================================================================
 */
const db = require('./db');

const historyModel = {
    /**
     * [CREATE] 특정 프로젝트의 현재 상태를 버전(스냅숏)으로 저장
     * 컨트롤러 호출명: historyModel.insertHistory
     */
    insertHistory: async (connection, { versionId, projectId, restoreFromVer, restoreFileName, actionType, mainFileId, userId }) => {
        const sql = `
            INSERT INTO history (version_id, project_id, restore_from_ver, restore_file_name, action_type, main_file_id, user_id) 
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `;

        return connection.query(sql, [
            versionId,                // Buffer (16)
            projectId,                // Buffer (16)
            restoreFromVer || null,   // Buffer (16) or null (컨트롤러에서 미전달 시 null 처리)
            restoreFileName || null,  // varchar(255) or null
            actionType || (restoreFromVer ? 'RESTORED' : null),
            mainFileId || null,       // Buffer (16)
            userId || null            // Buffer (16)
        ]);
    },

    /** [CREATE] 히스토리 버전별 편집자 목록 저장 */
    insertHistoryContributor: async (connection, { historyId, userId, entryId, editedAt }) => {
        const sql = `
            INSERT INTO history_contributor (history_id, user_id, entry_id, edited_at)
            VALUES (?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE edited_at = VALUES(edited_at)
        `;
        return connection.query(sql, [historyId, userId, entryId, editedAt]);
    },

    /** [READ] 특정 버전의 모든 편집자 상세 정보 조회 */
    findContributorsByVersionId: async (connection, versionId, projectId = null) => {
        const memberJoin = projectId
            ? 'LEFT JOIN project_member pm ON pm.user_id = hc.user_id AND pm.project_id = ?'
            : 'LEFT JOIN project_member pm ON pm.user_id = hc.user_id';
        const params = projectId ? [projectId, versionId] : [versionId];

        const sql = [
            'SELECT' +
                ' hc.user_id,' +
                ' u.user_name,' +
                ' pm.user_id AS member_user_id,' +
                ' hc.entry_id,' +
                ' hc.edited_at' +
            ' FROM history_contributor hc' +
            ' LEFT JOIN users u ON hc.user_id = u.id' +
            ' ' + memberJoin +
            ' WHERE hc.history_id = ?'
        ].join('');
        const [rows] = await connection.query(sql, params);
        return rows;
    },

    /**
     * [CREATE] 파일 본문 내용 저장 (Git 방식: 중복 해시값은 무시)
     * 컨트롤러 호출명: historyModel.insertHistoryContent
     */
    insertHistoryContent: async (connection, { contentId, content }) => {
        const sql = `
            INSERT IGNORE INTO history_contents (content_id, content) 
            VALUES (?, ?)
        `;

        return connection.query(sql, [
            contentId,          // Buffer (32) - SHA-256 해시 바이너리
            content             // longtext
        ]);
    },

    /**
     * [CREATE] 그 시점의 파일 구조 및 메타데이터를 박제
     * 컨트롤러 호출명: historyModel.insertHistoryStructure
     */
    /** [CREATE] 특정 버전 시점의 파일 구조 및 메타데이터를 저장 */
    insertHistoryStructure: async (connection, { versionId, entryId, entryName, contentId, parentId, isFolder }) => {
        const sql = `
            INSERT INTO history_structure (
                version_id, 
                entry_id, 
                entry_name, 
                content_id, 
                parent_id, 
                is_folder
            ) 
            VALUES (?, ?, ?, ?, ?, ?)
        `;
        
        // 새로 추가된 parentId와 isFolder를 배열 뒤쪽에 순서대로 배치합니다.
        return await connection.execute(sql, [
            versionId, 
            entryId, 
            entryName, 
            contentId, 
            parentId, 
            isFolder
        ]);
    },

    /**
     * [READ] 특정 프로젝트의 버전 히스토리 목록 조회
     * 컨트롤러 호출명: historyModel.findHistoryListByProjectId
     */
    findHistoryListByProjectId: async (connection, projectId) => {
        const sql = `
            SELECT h.version_id, h.restore_from_ver, h.restore_file_name, h.action_type, h.created_at, h.user_id, u.user_name
            FROM history h
            LEFT JOIN users u ON h.user_id = u.id
            WHERE h.project_id = ? 
            ORDER BY h.created_at DESC, h.version_id DESC
        `;

        const [rows] = await connection.query(sql, [projectId]);
        return rows;
    },

    /**
     * [추가/참고] 추후 복구(Restore) API 구현 시 사용할 핵심 쿼리
     * 설명: 특정 버전의 파일 구조와 본문 데이터를 한 번에 JOIN해서 가져옵니다.
     */
    findVersionStructureWithContent: async (connection, versionId) => {
        const sql = `
            SELECT 
                s.entry_id, 
                s.entry_name, 
                s.content_id, 
                c.content
            FROM history_structure s
            LEFT JOIN history_contents c ON s.content_id = c.content_id
            WHERE s.version_id = ?
        `;

        const [rows] = await connection.query(sql, [versionId]);
        return rows;
    },

    /** [READ] 특정 버전의 단일 생성 시점(created_at) 조회 */
    findHistoryByIdAndProjectId: async (connection, versionId, projectId) => {
        const sql = `
            SELECT created_at, action_type, restore_from_ver, main_file_id 
            FROM history 
            WHERE version_id = ? AND project_id = ?
        `;
        const [rows] = await connection.query(sql, [versionId, projectId]);
        return rows[0] || null;
    },

    /** [READ] 동일 프로젝트 내에서 현재 기준 직전 과거 버전 ID 조회 */
    findPreviousVersionId: async (connection, projectId, createdAt) => {
        const sql = `
            SELECT version_id 
            FROM history 
            WHERE project_id = ? AND created_at < ? 
            ORDER BY created_at DESC, version_id DESC 
            LIMIT 1
        `;
        const [rows] = await connection.query(sql, [projectId, createdAt]);
        return rows[0] || null;
    },

    /** [READ] 특정 버전 ID에 등록된 전체 파일/폴더 구조 목록 조회 */
    findHistoryStructureByVersionId: async (connection, versionId) => {
        const sql = `
            SELECT entry_id, entry_name, content_id, parent_id, is_folder 
            FROM history_structure 
            WHERE version_id = ?
        `;
        const [rows] = await connection.query(sql, [versionId]);
        return rows;
    },

    /** [READ] 특정 버전 스냅숏 내부의 단일 파일 정보 및 본문 조회 */
    findFileSnapshot: async (connection, versionId, entryId) => {
        const sql = `
            SELECT hs.entry_name, hs.is_folder, hc.content 
            FROM history_structure hs
            LEFT JOIN history_contents hc ON hs.content_id = hc.content_id
            WHERE hs.version_id = ? AND hs.entry_id = ?
        `;
        const [rows] = await connection.query(sql, [versionId, entryId]);
        return rows[0] || null;
    },

    /** [UPDATE] 롤백 대상 데이터를 현재 활성화된 Live entry 테이블에 반영 */
    updateLiveEntry: async (connection, { title, content, contentHash, entryId, projectId }) => {
        const sql = `
            UPDATE entry 
            SET title = ?, current_content = ?, content_hash = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND project_id = ?
        `;
        return connection.query(sql, [title, content, contentHash, entryId, projectId]);
    },

    /** [READ] 새로운 전체 스냅숏 생성을 위해 현재 시점의 프로젝트 entry 목록 전체 조회 */
    findLiveEntriesForSnapshot: async (connection, projectId) => {
        const sql = `
            SELECT id, title, is_folder, parent_id, current_content 
            FROM entry 
            WHERE project_id = ?
        `;
        const [rows] = await connection.query(sql, [projectId]);
        return rows;
    },

    /**
     * [READ] 특정 프로젝트의 가장 최근(최신) 버전 메타데이터 조회
     */
    findLatestVersionMeta: async (connection, projectId) => {
        const sql = `
            SELECT version_id, created_at, restore_from_ver, action_type
            FROM history 
            WHERE project_id = ? 
            ORDER BY created_at DESC, version_id DESC 
            LIMIT 1
        `;
        const [rows] = await connection.query(sql, [projectId]);
        return rows[0] || null;
    },

    touchHistoryVersion: async (connection, { versionId, actionType, mainFileId }) => {
        const sql = `
            UPDATE history
            SET created_at = CURRENT_TIMESTAMP(3),
                action_type = COALESCE(?, action_type),
                main_file_id = COALESCE(?, main_file_id)
            WHERE version_id = ?
        `;
        return connection.execute(sql, [actionType || null, mainFileId || null, versionId]);
    },

    // =================================================================
    // 실시간 편집 중 구조 테이블의 포인터(content_id)만 갱신하는 전용 메서드
    // =================================================================
    updateHistoryStructureContent: async (connection, { versionId, entryId, contentId }) => {
        const sql = `
            UPDATE history_structure 
            SET content_id = ?
            WHERE version_id = ? AND entry_id = ?
        `;
        return connection.execute(sql, [contentId, versionId, entryId]);
    },

    /** [READ] 특정 버전의 전체 파일/폴더 구조와 본문 데이터를 계층 구조 통째로 JOIN 조회 */
    findProjectSnapshot: async (connection, versionId) => {
        const sql = `
            SELECT 
                s.entry_id, 
                s.entry_name, 
                s.content_id, 
                s.parent_id, 
                s.is_folder, 
                c.content
            FROM history_structure s
            LEFT JOIN history_contents c ON s.content_id = c.content_id
            WHERE s.version_id = ?
        `;
        const [rows] = await connection.query(sql, [versionId]);
        return rows;
    },

    /** [DELETE] 프로젝트 전체 롤백을 위해 현재 라이브 entry 전체 청소 */
    deleteLiveEntriesByProjectId: async (connection, projectId) => {
        const sql = `DELETE FROM entry WHERE project_id = ?`;
        return connection.query(sql, [projectId]);
    },

    /** [CREATE] 과거 스냅숏 데이터를 현재 라이브 entry 테이블에 완전 복원 기입 */
    insertLiveEntry: async (connection, { id, projectId, parentId, isFolder, title, currentContent, contentHash }) => {
        const sql = `
            INSERT INTO entry (id, project_id, parent_id, is_folder, title, current_content, content_hash) 
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `;
        return connection.query(sql, [
            id,              // Buffer(16)
            projectId,       // Buffer(16)
            parentId,        // Buffer(16) or null
            isFolder,        // tinyint
            title,           // varchar(255)
            currentContent,  // longtext
            contentHash      // Buffer(32) or null
        ]);
    },

    /** * [UPDATE] 내용 변화 없이 이름(또는 위치)만 바뀐 파일/폴더 행 수정
     * 유저 피드백 반영: content_id는 기존 히스토리가 가리키던 것을 그대로 유지하므로 세팅에서 제외
     */
    updateHistoryStructure: async (connection, { versionId, entryId, entryName, parentId }) => {
        const sql = `
            UPDATE history_structure 
            SET entry_name = ?, parent_id = ?
            WHERE version_id = ? AND entry_id = ?
        `;
        return connection.execute(sql, [entryName, parentId, versionId, entryId]);
    },

    /** [DELETE] 기존에 있었는데 라이브에서 사라진(Deleted) 파일 행 제거 (검증 완료) */
    deleteHistoryStructureRow: async (connection, versionId, entryId) => {
        const sql = `DELETE FROM history_structure WHERE version_id = ? AND entry_id = ?`;
        return connection.execute(sql, [versionId, entryId]);
    },

    /** [DELETE] 특정 버전의 구조 스냅숏 전체 삭제 */
    deleteHistoryStructureByVersionId: async (connection, versionId) => {
        const sql = `DELETE FROM history_structure WHERE version_id = ?`;
        return connection.execute(sql, [versionId]);
    },

    countRestoreDependents: async (connection, versionId) => {
        const sql = "SELECT COUNT(*) AS count FROM history WHERE restore_from_ver = ?";
        const [rows] = await connection.execute(sql, [versionId]);
        return Number(rows[0]?.count || 0);
    },

    deleteHistoryVersion: async (connection, versionId) => {
        const sql = "DELETE FROM history WHERE version_id = ?";
        return connection.execute(sql, [versionId]);
    }
};

module.exports = historyModel;