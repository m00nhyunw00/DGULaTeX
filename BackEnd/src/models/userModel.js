/**
 * =================================================================
 * [Model] User Model Data Access
 * 설명: MySQL 테이블 조회와 변경 쿼리를 캡슐화하여 상위 계층에 제공함
 * =================================================================
 */
const db = require('./db');

const userModel = {
    /** 학번과 비밀번호가 일치하는 사용자 조회 */
    
    findByStudentIdAndPassword: async (studentId, password) => {
        const [rows] = await db.query(
            'SELECT * FROM users WHERE student_id = ? AND password = ?', 
            [studentId, password]
        );
        return rows[0];
    },

    findByStudentId: async (studentId) => {
        const [rows] = await db.query(
            'SELECT * FROM users WHERE student_id = ?',
            [studentId]
        );
        return rows[0];
    },

    findByStudentIdForUpdate: async (connection, studentId) => {
        const [rows] = await connection.query(
            'SELECT * FROM users WHERE student_id = ? FOR UPDATE',
            [studentId]
        );
        return rows[0];
    },

    findUserIdByStudentId: async (connection, studentId) => {
        const [rows] = await connection.query(
            'SELECT id FROM users WHERE student_id = ?', 
            [studentId]
        );
        return rows[0]; 
    },

    findById: async (connection, userIdBuffer) => {
        const [rows] = await connection.query(
            'SELECT id, student_id, user_name FROM users WHERE id = ?',
            [userIdBuffer]
        );
        return rows[0];
    },

    /** 새 사용자 생성 */
    createUser: async (connection, { id, studentId, password, userName }) => {
        const sql = `
            INSERT INTO users (id, student_id, password, user_name)
            VALUES (?, ?, ?, ?)
        `;
        const [result] = await connection.query(sql, [id, studentId, password, userName]);
        return result;
    },

    updatePasswordByStudentId: async (connection, { studentId, password }) => {
        const sql = `UPDATE users SET password = ? WHERE student_id = ?`;
        const [result] = await connection.query(sql, [password, studentId]);
        return result;
    },

    checkUserExistsById: async (connection, userIdBuffer) => {
        const sql = `SELECT 1 FROM users WHERE id = ?`;
        const [rows] = await connection.query(sql, [userIdBuffer]);
        return rows.length > 0; // 존재하면 true, 없으면 false 반환
    },

    /** 탈퇴 전 사용자가 소유한 프로젝트 삭제 */
    deleteOwnedProjects: async (connection, userIdBuffer) => {
        const sql = `DELETE FROM projects WHERE owner_id = ?`;
        const [result] = await connection.query(sql, [userIdBuffer]);
        return result;
    },

    /** 탈퇴 전 사용자의 참여 멤버십 삭제 */
    deleteProjectMemberships: async (connection, userIdBuffer) => {
        const sql = `DELETE FROM project_member WHERE user_id = ?`;
        const [result] = await connection.query(sql, [userIdBuffer]);
        return result;
    },

    /** 더 이상 어떤 히스토리 구조에서도 참조하지 않는 본문 스냅숏 삭제 */
    deleteOrphanHistoryContents: async (connection) => {
        const sql = `
            DELETE hc
            FROM history_contents hc
            LEFT JOIN history_structure hs ON hs.content_id = hc.content_id
            WHERE hs.content_id IS NULL
        `;
        const [result] = await connection.query(sql);
        return result;
    },

    /** 사용자 계정 삭제 */
    deleteUser: async (connection, userIdBuffer) => {
        const sql = `DELETE FROM users WHERE id = ?`;
        const [result] = await connection.query(sql, [userIdBuffer]);
        return result;
    }
};

module.exports = userModel;