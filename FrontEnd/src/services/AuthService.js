/**
 * =================================================================
 * [Service] Authentication Client Service
 * 설명: 로그인, 로그아웃, 회원가입, 세션 확인 API 응답을 인증 화면 상태로 정규화함
 * =================================================================
 */
import {
    broadcastLogoutEvent,
    changePasswordRequest,
    clearStoredSessionToken,
    deleteUserRequest,
    getCurrentUserRequest,
    getStoredSessionToken,
    loginRequest,
    logoutRequest,
    registerRequest,
    verifyWithdrawalRequest,
    setStoredSessionToken
} from "../api/auth";

const getAuthErrorMessage = (error, fallbackMessage) => {
    return error.response?.data?.message || error.message || fallbackMessage;
};

// 같은 브라우저의 탭들이 동일한 로그인 사용자를 보도록 localStorage에 저장합니다.
const setStoredUserUuid = (userId) => {
    if (userId) localStorage.setItem('user_uuid', userId);
};

const clearStoredUserUuid = () => {
    localStorage.removeItem('user_uuid');
};

const normalizeUser = (user = {}) => ({
    id: user.studentId || user.id || "",        // 대시보드 API 요청용 (학번)
    studentId: user.studentId || user.id || "", // 화면 표시용 (학번)
    uuid: user.uuid || user.id || "",    // API 요청용 (Hex UUID)
    name: user.name || "사용자"
});

export const AuthService = {
    async login(studentId, password) {
        try {
            const data = await loginRequest(studentId, password);

            if (data && data.success) {
                setStoredSessionToken(data.sessionToken);
                if (data.user?.uuid || data.user?.id) {
                    setStoredUserUuid(data.user.uuid || data.user.id);
                }

                return {
                    success: true,
                    user: normalizeUser(data.user)
                };
            }

            return {
                success: false,
                message: data.message || "잘못된 응답 형식입니다."
            };
        } catch (error) {
            const serverMessage = getAuthErrorMessage(
                error,
                "인증 서버와의 통신에 실패했습니다."
            );

            throw new Error(serverMessage);
        }
    },

    async refreshSession() {
        if (!getStoredSessionToken()) {
            return { success: false, message: "저장된 세션이 없습니다." };
        }

        try {
            const data = await getCurrentUserRequest();

            if (data && data.success) {
                if (data.user?.uuid || data.user?.id) {
                    setStoredUserUuid(data.user.uuid || data.user.id);
                }
                return {
                    success: true,
                    user: normalizeUser(data.user)
                };
            }

            clearStoredSessionToken();
            return { success: false, message: data.message || "세션이 만료되었습니다." };
        } catch (error) {
            clearStoredSessionToken();
            return { success: false, message: error.message || "세션 복구에 실패했습니다." };
        }
    },

    async restoreSession() {
        if (!getStoredSessionToken()) {
            return { success: false, message: "저장된 세션이 없습니다." };
        }

        try {
            const data = await getCurrentUserRequest();

            if (data && data.success) {
                if (data.user?.uuid || data.user?.id) {
                    setStoredUserUuid(data.user.uuid || data.user.id);
                }
                return {
                    success: true,
                    user: normalizeUser(data.user)
                };
            }

            clearStoredSessionToken();
            return { success: false, message: data.message || "세션이 만료되었습니다." };
        } catch (error) {
            clearStoredSessionToken();
            return { success: false, message: error.message || "세션 복구에 실패했습니다." };
        }
    },

    async logout() {
        try {
            if (getStoredSessionToken()) {
                await logoutRequest();
            }
        } finally {
            clearStoredSessionToken();
            clearStoredUserUuid();
            broadcastLogoutEvent();
        }

        return { success: true };
    },

    async changePassword({ studentId, oldPassword, newPassword, newPasswordConfirm }) {
        try {
            const data = await changePasswordRequest({
                studentId,
                oldPassword,
                newPassword,
                newPasswordConfirm
            });

            if (data && data.success) {
                return {
                    success: true,
                    message: data.message || "비밀번호가 변경되었습니다."
                };
            }

            return {
                success: false,
                message: data.message || "잘못된 응답 형식입니다."
            };
        } catch (error) {
            const serverMessage = getAuthErrorMessage(
                error,
                "비밀번호 변경 서버와의 통신에 실패했습니다."
            );

            throw new Error(serverMessage);
        }
    },

    async verifyWithdrawal({ studentId, password, passwordConfirm }) {
        try {
            const data = await verifyWithdrawalRequest({ studentId, password, passwordConfirm });

            if (data && data.success) {
                return {
                    success: true,
                    message: data.message || "탈퇴 정보 확인이 완료되었습니다."
                };
            }

            return {
                success: false,
                message: data.message || "잘못된 응답 형식입니다."
            };
        } catch (error) {
            const serverMessage = getAuthErrorMessage(
                error,
                "탈퇴 정보 확인 서버와의 통신에 실패했습니다."
            );

            throw new Error(serverMessage);
        }
    },

    async deleteUser(userId) {
        try {
            const data = await deleteUserRequest(userId);

            if (data && (data.success || data.status === 'success')) {
                return {
                    success: true,
                    message: data.message || "회원 탈퇴가 완료되었습니다."
                };
            }

            return {
                success: false,
                message: data.message || "잘못된 응답 형식입니다."
            };
        } catch (error) {
            const serverMessage = getAuthErrorMessage(
                error,
                "회원 탈퇴 서버와의 통신에 실패했습니다."
            );

            throw new Error(serverMessage);
        }
    },

    async register({ studentId, password, userName }) {
        try {
            const data = await registerRequest({ studentId, password, userName });

            if (data && data.success) {
                return {
                    success: true,
                    message: data.message || "회원가입이 완료되었습니다."
                };
            }

            return {
                success: false,
                message: data.message || "잘못된 응답 형식입니다."
            };
        } catch (error) {
            const serverMessage = getAuthErrorMessage(
                error,
                "회원가입 서버와의 통신에 실패했습니다."
            );

            throw new Error(serverMessage);
        }
    }
};
