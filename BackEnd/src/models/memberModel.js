/**
 * =================================================================
 * [Model] Member Model Data Access
 * 설명: MySQL 테이블 조회와 변경 쿼리를 캡슐화하여 상위 계층에 제공함
 * =================================================================
 */
const memberModel = {

    /** 초대 코드 생성 또는 새로고침 (UPSERT) */
    upsertInviteCode: async (connection, { projectId, role, inviteCode }) => {
        const sql = `
            INSERT INTO invite_code (project_id, role, invite_code)
            VALUES (?, ?, ?)
            ON DUPLICATE KEY UPDATE invite_code = VALUES(invite_code); 
            --  이미 (project_id, role) 조합이 있으면 새 코드로 UPDATE
        `;
        const [result] = await connection.query(sql, [projectId, role, inviteCode]);
        return result;
    },

    /** 특정 프로젝트와 권한에 대한 기존 초대 코드 조회 */
    findInviteCodeByProjectRole: async (connection, { projectId, role }) => {
        const sql = `
            SELECT project_id, role, invite_code
            FROM invite_code
            WHERE project_id = ? AND role = ?;
        `;
        const [rows] = await connection.query(sql, [projectId, role]);
        return rows[0];
    },

    /** 2. 사용자가 입력한 6자리 코드로 프로젝트 및 권한 정보 찾기 */
    findProjectByInviteCode: async (connection, inviteCode) => {
        const sql = `
            SELECT project_id, role 
            FROM invite_code 
            WHERE invite_code = ?;
        `;
        const [rows] = await connection.query(sql, [inviteCode]);
        return rows[0]; // 찾으면 객체 반환, 없으면 undefined
    },

    /** 특정 프로젝트 구성원의 권한(Role) 조회 */
    findMemberRole: async (connection, projectId, userId) => {
        const [rows] = await connection.query(
            `SELECT role 
             FROM project_member 
             WHERE project_id = ? AND user_id = ?`,
            [projectId, userId]
        );
        return rows[0]; // 존재하면 { role: 'owner' | 'editor' | 'viewer' }, 없으면 undefined 반환
    },

     /** 신규 프로젝트 구성원(멤버) 추가 */
    insertProjectMember: async (connection, { projectId, userId, role }) => {
        await connection.query(
            `INSERT INTO project_member (project_id, user_id, role) 
             VALUES (?, ?, ?)`,
            [projectId, userId, role]
        );
    },

    /** 이미 신청해서 승인 대기 중(PENDING)인지 확인 (중복 신청 방지) */
    findExistingRequest: async (connection, bProjectId, bUserId) => {
        const query = `
            SELECT request_id, status 
            FROM join_request 
            WHERE project_id = ? AND user_id = ? AND status = 'PENDING'
        `;
        const [rows] = await connection.execute(query, [bProjectId, bUserId]);
        
        // 대기 중인 신청이 있으면 { request_id: ..., status: 'PENDING' } 반환, 없으면 null 반환
        return rows.length > 0 ? rows[0] : null;
    },

    /** 초대 수락 시 참여 신청 데이터 삽입 (PENDING 상태 진입) */
    insertJoinRequest: async (connection, { requestId, projectId, userId, requestRole }) => {
        const query = `
            INSERT INTO join_request (request_id, project_id, user_id, request_role, status) 
            VALUES (?, ?, ?, ?, 'PENDING')
        `;
        const [result] = await connection.execute(query, [requestId, projectId, userId, requestRole]);
        return result;
    },

    /** 참여 신청 상세 조회 (승인/거절 처리 전 검증용) */
    findJoinRequest: async (connection, bRequestId) => {
        const query = `
            SELECT request_id, project_id, user_id, request_role, status 
            FROM join_request 
            WHERE request_id = ?
        `;
        const [rows] = await connection.execute(query, [bRequestId]);
        return rows.length > 0 ? rows[0] : null;
    },

    /** 참여 신청 상태 업데이트 (ACCEPTED, REJECTED) */
    updateJoinRequestStatus: async (connection, bRequestId, status) => {
        const query = `
            UPDATE join_request 
            SET status = ? 
            WHERE request_id = ?
        `;
        await connection.execute(query, [status, bRequestId]);
    },

    /** 특정 프로젝트의 블랙리스트에 차단 유저 등록 */
    insertBlacklist: async (connection, { id, projectId, targetId, reason, expiresAt }) => {
        const query = `
            INSERT INTO blacklist (id, project_id, target_id, reason, expires_at) 
            VALUES (?, ?, ?, ?, ?)
        `;
        // 예외 처리를 통해 값이 넘어오지 않으면 DB에 NULL로  처리
        await connection.execute(query, [
            id, 
            projectId, 
            targetId, 
            reason || null, 
            expiresAt || null
        ]);
    },

    /** 특정 프로젝트의 모든 참여자(멤버) 목록 조회 */
    findMembersByProjectId: async (connection, projectIdBuffer) => {
        const sql = `
            SELECT 
                u.id AS user_id,
                u.student_id,
                u.user_name,
                pm.role,
                pm.status,
                pm.last_seen_at,
                pm.current_file_id
            FROM project_member pm
            JOIN users u ON pm.user_id = u.id
            WHERE pm.project_id = ?
            ORDER BY FIELD(pm.role, 'owner', 'editor', 'viewer'), u.user_name ASC;
        `;

        const [rows] = await connection.query(sql, [projectIdBuffer]);
        return rows;
    },

    /** 특정 멤버 row lock 조회 */
    findMemberForUpdate: async (connection, { projectId, userId }) => {
        const [rows] = await connection.query(
            `
            SELECT project_id, user_id, role
            FROM project_member
            WHERE project_id = ?
              AND user_id = ?
            FOR UPDATE
            `,
            [projectId, userId]
        );

        return rows[0];
    },

    /** 멤버 role 변경 */
    updateMemberRole: async (connection, { projectId, userId, role, clearCurrentFile = false }) => {
        if (clearCurrentFile) {
            const [result] = await connection.query(
                `
                UPDATE project_member
                SET role = ?,
                    current_file_id = NULL,
                    last_seen_at = CURRENT_TIMESTAMP
                WHERE project_id = ?
                  AND user_id = ?
                `,
                [role, projectId, userId]
            );

            return result;
        }

        const [result] = await connection.query(
            `
            UPDATE project_member
            SET role = ?,
                last_seen_at = CURRENT_TIMESTAMP
            WHERE project_id = ?
              AND user_id = ?
            `,
            [role, projectId, userId]
        );

        return result;
    },

    /** last_edit_session 조회 및 lock */
    findLastEditSessionForUpdate: async (connection, { projectId, userId }) => {
        const [rows] = await connection.query(
            `
            SELECT last_pdf_url
            FROM last_edit_session
            WHERE project_id = ?
              AND user_id = ?
            FOR UPDATE
            `,
            [projectId, userId]
        );

        return rows[0];
    },

    /** last_edit_session 생성 또는 갱신 */
    upsertLastEditSession: async (connection, { sessionId, projectId, userId }) => {
        const [result] = await connection.query(
            `
            INSERT INTO last_edit_session (
                session_id,
                project_id,
                user_id,
                file_id,
                cursor_line,
                cursor_column
            )
            VALUES (?, ?, ?, NULL, 0, 0)
            ON DUPLICATE KEY UPDATE
                updated_at = CURRENT_TIMESTAMP
            `,
            [sessionId, projectId, userId]
        );

        return result;
    },

    /** last_edit_session 삭제 */
    deleteLastEditSession: async (connection, { projectId, userId }) => {
        const [result] = await connection.query(
            `
            DELETE FROM last_edit_session
            WHERE project_id = ?
              AND user_id = ?
            `,
            [projectId, userId]
        );

        return result;
    },

    /** 참여 요청 삭제 */
    deleteJoinRequestByProjectAndUser: async (connection, { projectId, userId }) => {
        const [result] = await connection.query(
            `
            DELETE FROM join_request
            WHERE project_id = ?
              AND user_id = ?
            `,
            [projectId, userId]
        );

        return result;
    },

    /** project_member 삭제 */
    deleteProjectMember: async (connection, { projectId, userId }) => {
        const [result] = await connection.query(
            `
            DELETE FROM project_member
            WHERE project_id = ?
              AND user_id = ?
            `,
            [projectId, userId]
        );

        return result;
    }
}

module.exports = memberModel;