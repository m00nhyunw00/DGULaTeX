/**
 * =================================================================
 * [Model] Project Model Data Access
 * 설명: MySQL 테이블 조회와 변경 쿼리를 캡슐화하여 상위 계층에 제공함
 * =================================================================
 */
const projectModel = {
    /** 학번으로 유저 Binary ID 조회 */
    findUserIdByStudentId: async (connection, studentId) => {
        const [rows] = await connection.query(
            'SELECT id FROM users WHERE student_id = ?', 
            [studentId]
        );
        return rows[0]; 
    },

    /** 프로젝트 기본 정보 및 소유자 이름 조회 */
    findById: async (connection, projectId) => {
        const [rows] = await connection.query(
            `SELECT p.*, u.user_name as owner_name 
             FROM projects p 
             JOIN users u ON p.owner_id = u.id 
             WHERE p.id = ?`, 
            [projectId]
        );
        return rows[0];
    },

    /** 신규 프로젝트 삽입 */
    insertProject: async (connection, { id, title, ownerId }) => {
        await connection.query(
            'INSERT INTO projects (id, title, owner_id) VALUES (?, ?, ?)',
            [id, title, ownerId]
        );
    },

    /** 프로젝트의 메인 파일 ID 업데이트 */
    updateMainFileId: async (connection, projectId, entryId) => {   
        return await connection.query('UPDATE projects SET main_file_id = ? WHERE id = ?', [entryId, projectId]);
    },

    /** 특정 유저의 프로젝트 전체 목록 조회  */
    findAllByOwner: async (connection, ownerIdBuffer) => {
        const sql = `
            SELECT 
                p.id,
                p.title,
                p.owner_id,
                u.student_id AS owner_student_id,
                u.user_name,
                --  모든 파일 중 가장 최신 수정 시각을 실시간 계산
                MAX(e.updated_at) AS updated_at
            FROM projects p 
            JOIN users u ON p.owner_id = u.id 
            LEFT JOIN entry e ON p.id = e.project_id 
            WHERE p.owner_id = ? 
            GROUP BY p.id, p.owner_id, u.id, u.student_id, u.user_name
            ORDER BY updated_at DESC; -- 최근에 편집한 프로젝트가  맨 위로
        `;

        const [rows] = await connection.query(sql, [ownerIdBuffer]);
        return rows;
    },

    // 공유받은 프로젝트 - 내가 소유자는 아니지만 멤버(협업자)로 등록된 프로젝트 조회
    findAllSharedByUser: async (connection, userIdBuffer) => {
        const sql = `
            SELECT 
                p.id,
                p.title,
                p.owner_id,
                u.student_id AS owner_student_id,
                u.user_name,                         -- 프로젝트 소유자의 이름
                MAX(e.updated_at) AS updated_at     -- 모든 파일 중 가장 최신 수정 시각 실시간 계산
            FROM project_member pm
            JOIN projects p ON pm.project_id = p.id
            JOIN users u ON p.owner_id = u.id 
            LEFT JOIN entry e ON p.id = e.project_id 
            WHERE pm.user_id = ? AND pm.role != 'owner' -- 내가 참여는 하되, 소유자는 아닌 프로젝트
            GROUP BY p.id, p.owner_id, u.id, u.student_id, u.user_name
            ORDER BY updated_at DESC;                -- 최근 편집 순 정렬
        `;

        const [rows] = await connection.query(sql, [userIdBuffer]);
        return rows;
    },

    /** 프로젝트 삭제 */
    deleteProject: async (connection, projectId) => {
        await connection.query('DELETE FROM projects WHERE id = ?', [projectId]);
    },

    /** [UPDATE] 프로젝트 이름 수정 */
    updateTitle: async (connection, { projectId, title }) => {
        const sql = `
            UPDATE projects
            SET title = ?
            WHERE id = ?
        `;
        // 디비에 버퍼 변환된 ID와 잘라낸 title을 순서대로 매핑
        const [result] = await connection.query(sql, [title, projectId]);
        return result;
    },

    /** 프로젝트 owner 조회 및 row lock */
    findProjectOwnerForUpdate: async (connection, projectId) => {
        const [rows] = await connection.query(
            `
            SELECT id, owner_id
            FROM projects
            WHERE id = ?
            FOR UPDATE
            `,
            [projectId]
        );

        return rows[0];
    },

    /** 프로젝트 owner_id 변경 */
    updateProjectOwner: async (connection, { projectId, ownerId }) => {
        const [result] = await connection.query(
            `
            UPDATE projects
            SET owner_id = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            `,
            [ownerId, projectId]
        );

        return result;
    }
};

module.exports = projectModel;