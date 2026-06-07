/**
 * =================================================================
 * [Model] Entry Model Data Access
 * 설명: MySQL 테이블 조회와 변경 쿼리를 캡슐화하여 상위 계층에 제공함
 * =================================================================
 */
const db = require('./db');

const entryModel = {
    /** [CREATE] 새 엔트리(파일/폴더/업로드 파일) 통합 생성 */
    createEntry: async (connection, { id, projectId, parentId, isFolder, title, content, assetUrl, contentHash }) => {
        const sql = `
            INSERT INTO entry (
                id,
                project_id,
                parent_id,
                is_folder,
                title,
                current_content,
                content_hash,
                asset_url
            ) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `;

        const initialContent = isFolder ? null : (content !== undefined ? content : '');

        return connection.query(sql, [
            id,
            projectId,
            parentId,
            isFolder ? 1 : 0,
            title,
            initialContent,
            isFolder ? null : (contentHash || null),
            assetUrl
        ]);
    },

    // 하위 엔트리 ID 값 찾기
    findAllChildren: async (connection, parentId) => {
        const sql = `
            WITH RECURSIVE cte AS (
                SELECT id FROM entry WHERE parent_id = ?
                UNION ALL
                SELECT e.id FROM entry e
                INNER JOIN cte ON e.parent_id = cte.id
            )
            SELECT id FROM cte;
        `;
        const [rows] = await connection.query(sql, [parentId]);
        return rows.map(row => row.id);
    },

    // 특정 엔트리(파일 또는 폴더) 단일 삭제
    deleteEntry: async (connection, entryId) => {
        const sql = `DELETE FROM entry WHERE id = ?`;
        const [result] = await connection.query(sql, [entryId]);
        return result;
    },

    /** 프로젝트에 속한 모든 엔트리(파일 및 폴더) 조회 */
    findAllEntriesByProjectId: async (connection, projectId) => {
        const [rows] = await connection.query(
            `SELECT id, parent_id, is_folder, title, current_content, content_hash, asset_url
             FROM entry 
             WHERE project_id = ?`, 
            [projectId]
        );
        return rows;
    },

    /** [UPDATE] 파일 또는 폴더 이름 변경 */
    updateEntryTitle: async (connection, { id, title }) => {
        const sql = `
            UPDATE entry 
            SET title = ?, 
                updated_at = CURRENT_TIMESTAMP 
            WHERE id = ?
        `;
        const [result] = await connection.query(sql, [title, id]);
        return result;
    },

    /** [UPDATE] 파일 코드(content) 업데이트 */
    updateContent: async (connection, { fileId, projectId, content, contentHash }) => {
        const sql = `
            UPDATE entry
            SET current_content = ?,
                content_hash = ?
            WHERE id = ?
              AND project_id = ?
              AND is_folder = 0
        `;
        // updated_at 컬럼은 sql 제약조건으로 자동으로 바뀜
        const [result] = await connection.query(sql, [content, contentHash, fileId, projectId]);
        return result;
    },

    /** [READ] 특정 파일의 본문 내용 및 해시 조회 */
    getFileContent: async (connection, { fileId, projectId }) => {
        const sql = `
            SELECT current_content, content_hash
            FROM entry
            WHERE id = ?
              AND project_id = ?
              AND is_folder = 0
        `;
        const [rows] = await connection.query(sql, [fileId, projectId]);
        return rows[0]; // 단일 파일 조회이므로 첫 번째 로우만 반환 (없으면 undefined)
    },

    /** [UPDATE] 엔트리 위치 변경 (바이너리 널 예외 차단 가드 빌드) */
    moveEntry: async (connection, { id, parentId }) => {
        const sql = `
            UPDATE entry 
            SET parent_id = ?, 
                updated_at = CURRENT_TIMESTAMP 
            WHERE id = ?
        `;
        // [바이너리 널 패치 핵심] 최상위 루트로 끌어다 놓을 때(parentId가 null일 때), 
        // MySQL 드라이버가 BINARY 구조체 연산 도중 뻗지 않도록 명시적 null 리터럴 값으로 가드 처리
        const bindParentId = parentId ? parentId : null;

        const [result] = await connection.query(sql, [bindParentId, id]);
        return result;
    },

    // ID 값으로 엔트리 정보 조회
    getEntryById: async (connection, id) => {
        const sql = `SELECT id, project_id, parent_id, is_folder, title, current_content, asset_url FROM entry WHERE id = ?`;
        const [rows] = await connection.query(sql, [id]);
        return rows[0];
    },

    /** 같은 부모 내에 중복된 이름이 있는지 확인 */
    checkDuplicateName: async (connection, projectId, parentId, title, excludeEntryId) => {      
        let sql = `
            SELECT COUNT(*) as count 
            FROM entry 
            WHERE project_id = ? 
            AND title = ?
        `;
    
        const params = [projectId, title];

        // 중복 이름 검사 시 본인 이름은 제외
        if (excludeEntryId !== null && excludeEntryId !== undefined) {
            sql += ` AND id != ?`;
            params.push(excludeEntryId);
        }

        if (!parentId || parentId === 'null' || parentId === 'undefined') {
            sql += ` AND parent_id IS NULL`;
        } else {
            sql += ` AND parent_id = ?`;
            params.push(parentId);
        }   
    
        const [rows] = await connection.query(sql, params);
        return rows[0].count > 0;
    },

    /**
     * =================================================================
     * [PUT] 에디터 내 사용자 편집 세션 최신화 (Upsert)
     * 설명: 유니크 키(project_id, user_id)가 중복되면 UPDATE, 없으면 INSERT를 수행
     * =================================================================
     */
    //projectController.saveEditSession 에서 호출
    upsertEditSession: async (connection, sessionData) => {
        const { 
            sessionId, 
            projectId, 
            userId, 
            fileId, 
            cursorLine, 
            cursorColumn, 
            lastPdfUrl 
        } = sessionData;

        //  디비에 중복된 (project_id, user_id)가 있으면 UPDATE
        const query = `
            INSERT INTO last_edit_session (
                session_id, 
                project_id, 
                user_id, 
                file_id, 
                cursor_line, 
                cursor_column, 
                last_pdf_url
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                file_id = VALUES(file_id),
                cursor_line = VALUES(cursor_line),
                cursor_column = VALUES(cursor_column),
                last_pdf_url = COALESCE(NULLIF(VALUES(last_pdf_url), ''), last_pdf_url);
        `;

        const params = [
            sessionId, 
            projectId, 
            userId, 
            fileId, 
            cursorLine, 
            cursorColumn, 
            lastPdfUrl
        ];

        const [result] = await connection.execute(query, params);
        return result;
    },

    /**
     * =================================================================
     * [GET] 에디터 내 사용자 편집 세션 단건 조회
     * 설명: project_id와 user_id가 매칭되는 최신 세션 레코드 한 줄을 반환
     * =================================================================
     */
    findEditSession: async (connection, projectIdBuffer, userIdBuffer) => {
        const query = `
            SELECT 
                session_id, 
                project_id, 
                user_id, 
                file_id, 
                cursor_line, 
                cursor_column, 
                last_pdf_url,
                updated_at
            FROM last_edit_session
            WHERE project_id = ? AND user_id = ?;
        `;

        const [rows] = await connection.execute(query, [projectIdBuffer, userIdBuffer]);
        return rows[0]; 
    },

}

module.exports = entryModel;
