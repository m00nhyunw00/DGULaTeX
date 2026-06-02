/**
 * =================================================================
 * [Controller] Auth Controller
 * 설명: 요청 값 검증, 도메인 로직 호출, HTTP 응답 생성을 담당함
 * =================================================================
 */
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const userModel = require("../models/userModel");
const db = require("../models/db");
const sessionStore = require("../services/sessionStore");
const memberLogic = require("../logics/memberLogic");

const authController = {
    login: async (req, res) => {
        const { studentId, password } = req.body;

        try {
            const user = await userModel.findByStudentId(studentId);

            if (!user) {
                return res.status(401).json({ success: false, message: "존재하지 않는 학번입니다." });
            }

            const isPasswordMatched = await bcrypt.compare(password, user.password);

            if (!isPasswordMatched) {
                return res.status(401).json({ success: false, message: "비밀번호가 일치하지 않습니다." });
            }

            const authUser = {
                id: user.student_id,            // 프론트 대시보드 호환용 식별자 (학번)
                studentId: user.student_id,     // 화면 표시용 식별자
                uuid: user.id.toString("hex"),  // 내부 로직용 주 식별자 (Hex UUID)
                name: user.user_name
            };
            const sessionResult = sessionStore.createSession(authUser);

            if (!sessionResult.ok && sessionResult.reason === "ALREADY_LOGGED_IN") {
                return res.status(409).json({ success: false, message: "이미 로그인 중입니다." });
            }

            console.log(`[AUTH SUCCESS] 로그인 성공`);

            return res.status(200).json({
                success: true,
                user: authUser,
                sessionToken: sessionResult.session.token,
                expiresAt: new Date(sessionResult.session.expiresAt).toISOString()
            });
        } catch (fatalError) {
            console.error('[FATAL LOGIN ERROR]', fatalError.message);
            return res.status(500).json({ success: false, message: "인증 처리 중 서버 오류가 발생했습니다." });
        }
    },

    register: async (req, res) => {
        const { studentId, password, userName } = req.body;
        let connection;

        try {
            connection = await db.getConnection();

            if (!studentId || !password || !userName) {
                return res.status(400).json({ success: false, message: "학번, 비밀번호, 이름은 필수 입력값입니다." });
            }

            await connection.beginTransaction();

            const existingUser = await userModel.findUserIdByStudentId(connection, studentId);
            if (existingUser) {
                await connection.rollback();
                return res.status(409).json({ success: false, message: "이미 존재하는 학번입니다." });
            }

            const hashedPassword = await bcrypt.hash(password, 10);
            const newUserId = crypto.randomBytes(16);

            await userModel.createUser(connection, {
                id: newUserId,
                studentId,
                password: hashedPassword,
                userName
            });

            await connection.commit();

            return res.status(201).json({ success: true, message: "회원가입이 성공적으로 완료되었습니다." });
        } catch (error) {
            if (connection) await connection.rollback();
            console.error('[REGISTER ERROR]', error.message);
            return res.status(500).json({ success: false, message: "회원가입 중 오류가 발생했습니다." });
        } finally {
            if (connection) connection.release();
        }
    },

    verifyWithdrawal: async (req, res) => {
        const { studentId, password, passwordConfirm } = req.body;
        const trimmedStudentId = String(studentId || "").trim();

        if (!trimmedStudentId || !password || !passwordConfirm) {
            return res.status(400).json({
                success: false,
                message: "학번, 비밀번호, 비밀번호 확인은 필수 입력값입니다."
            });
        }

        if (password !== passwordConfirm) {
            return res.status(400).json({ success: false, message: "비밀번호 확인이 일치하지 않습니다." });
        }

        try {
            const user = await userModel.findByStudentId(trimmedStudentId);

            if (!user) {
                return res.status(404).json({ success: false, message: "존재하지 않는 학번입니다." });
            }

            const isPasswordMatched = await bcrypt.compare(password, user.password);

            if (!isPasswordMatched) {
                return res.status(401).json({ success: false, message: "비밀번호가 일치하지 않습니다." });
            }

            return res.status(200).json({
                success: true,
                message: "VERIFICATION_SUCCESS"
            });
        } catch (error) {
            console.error('[VERIFY WITHDRAWAL ERROR]', error.message);
            return res.status(500).json({ success: false, message: "탈퇴 정보 확인 중 오류가 발생했습니다." });
        }
    },

    changePassword: async (req, res) => {
        const { studentId, oldPassword, newPassword, newPasswordConfirm } = req.body;
        const trimmedStudentId = String(studentId || "").trim();
        let connection;

        if (!trimmedStudentId || !oldPassword || !newPassword || !newPasswordConfirm) {
            return res.status(400).json({
                success: false,
                message: "학번, 기존 비밀번호, 새 비밀번호, 새 비밀번호 확인은 필수 입력값입니다."
            });
        }

        if (newPassword !== newPasswordConfirm) {
            return res.status(400).json({ success: false, message: "새 비밀번호 확인이 일치하지 않습니다." });
        }

        if (oldPassword === newPassword) {
            return res.status(400).json({ success: false, message: "새 비밀번호는 기존 비밀번호와 달라야 합니다." });
        }

        try {
            connection = await db.getConnection();
            await connection.beginTransaction();

            const user = await userModel.findByStudentIdForUpdate(connection, trimmedStudentId);

            if (!user) {
                await connection.rollback();
                return res.status(404).json({ success: false, message: "존재하지 않는 학번입니다." });
            }

            const isPasswordMatched = await bcrypt.compare(oldPassword, user.password);

            if (!isPasswordMatched) {
                await connection.rollback();
                return res.status(401).json({ success: false, message: "기존 비밀번호가 일치하지 않습니다." });
            }

            const hashedPassword = await bcrypt.hash(newPassword, 10);
            await userModel.updatePasswordByStudentId(connection, {
                studentId: trimmedStudentId,
                password: hashedPassword
            });

            await connection.commit();

            return res.status(200).json({ success: true, message: "비밀번호가 성공적으로 변경되었습니다." });
        } catch (error) {
            if (connection) await connection.rollback();
            console.error('[CHANGE PASSWORD ERROR]', error.message);
            return res.status(500).json({ success: false, message: "비밀번호 변경 중 오류가 발생했습니다." });
        } finally {
            if (connection) connection.release();
        }
    },

    me: async (req, res) => {
        const token = sessionStore.extractToken(req);
        const session = sessionStore.getSession(token);

        if (!session) {
            const message = token
                ? "로그인 유지 시간이 만료되었습니다."
                : "로그인이 필요합니다.";

            return res.status(401).json({ success: false, message });
        }

        return res.status(200).json({
            success: true,
            user: session.user,
            expiresAt: new Date(session.expiresAt).toISOString()
        });
    },

    logout: async (req, res) => {
        const token = sessionStore.extractToken(req);

        if (token) {
            sessionStore.deleteSession(token);
        }

        return res.status(200).json({ success: true, message: "로그아웃되었습니다." });
    },

    deleteUser: async (req, res) => {
        const { userId } = req.params;
        const token = sessionStore.extractToken(req);
        const session = sessionStore.getSession(token, { refresh: false });
        const requesterId = session?.user?.uuid || memberLogic.resolveRequesterId(req);
        const targetUserId = memberLogic.normalizeId(userId);
        const cleanRequesterId = memberLogic.normalizeId(requesterId);
        if (!targetUserId || !cleanRequesterId || targetUserId !== cleanRequesterId) {
            return res.status(403).json({
                success: false,
                message: "본인 계정만 탈퇴 처리가 가능합니다."
            });
        }

        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();

            const bUserId = memberLogic.hexToBuffer(targetUserId);

            // 2. 탈퇴 대상 사용자의 소유 프로젝트와 멤버십을 먼저 명시적으로 정리
            await userModel.deleteOwnedProjects(connection, bUserId);
            await userModel.deleteProjectMemberships(connection, bUserId);

            // 3. 유저 삭제 실행 (남은 연관 데이터는 DB Cascade 설정에 의해 자동 삭제)
            const result = await userModel.deleteUser(connection, bUserId);

            if (result.affectedRows === 0) {
                await connection.rollback();
                return res.status(404).json({
                    success: false,
                    message: "삭제할 사용자 정보를 찾을 수 없습니다."
                });
            }

            await userModel.deleteOrphanHistoryContents(connection);

            // 4. 탈퇴 성공 시 현재 세션 무효화
            if (token) {
                sessionStore.deleteSession(token);
            }

            await connection.commit();
            return res.status(200).json({
                success: true,
                message: "회원 탈퇴가 완료되었습니다. 그동안 이용해주셔서 감사합니다."
            });
        } catch (error) {
            if (connection) await connection.rollback();
            console.error('[USER WITHDRAWAL ERROR]', error.message);
            return res.status(500).json({ success: false, message: "탈퇴 처리 중 서버 오류가 발생했습니다." });
        } finally {
            if (connection) connection.release();
        }
    }
};

module.exports = authController;
