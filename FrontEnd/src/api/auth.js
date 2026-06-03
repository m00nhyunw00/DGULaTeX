/**
 * =================================================================
 * [API] Auth Request Module
 * 설명: 백엔드 API 호출, 요청 payload 구성, 응답 오류 처리를 담당함
 * =================================================================
 */
const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";
const AUTH_TOKEN_KEY = "dgu_latex_session_token";
const AUTH_LOGOUT_EVENT_KEY = "dgu_latex_logout_event";

// 같은 브라우저의 탭들은 하나의 로그인 상태를 공유하도록 localStorage를 사용합니다.
export const getStoredSessionToken = () => localStorage.getItem(AUTH_TOKEN_KEY) || "";

export const setStoredSessionToken = (token) => {
    if (token) localStorage.setItem(AUTH_TOKEN_KEY, token);
};

export const clearStoredSessionToken = () => {
    localStorage.removeItem(AUTH_TOKEN_KEY);
};

export const broadcastLogoutEvent = () => {
    localStorage.setItem(AUTH_LOGOUT_EVENT_KEY, String(Date.now()));
};

export const getLogoutEventKey = () => AUTH_LOGOUT_EVENT_KEY;

const authHeaders = () => {
    const token = getStoredSessionToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
};

const parseAuthResponse = async (response, fallbackMessage) => {
    const result = await response.json();

    if (!response.ok) {
        throw new Error(result.message || fallbackMessage);
    }

    return result;
};

const handleAuthNetworkError = (error, fallbackMessage) => {
    if (error.message.includes("Failed to fetch") || error.message.includes("NetworkError")) {
        throw new Error("네트워크 에러: 인증 서버 연결 확인 필요");
    }

    throw new Error(error.message || fallbackMessage);
};

export const loginRequest = async (studentId, password) => {
    try {
        const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ studentId, password })
        });

        return await parseAuthResponse(response, "로그인 처리 중 서버 오류가 발생했습니다.");
    } catch (error) {
        handleAuthNetworkError(error, "로그인 요청에 실패했습니다.");
    }
};

export const getCurrentUserRequest = async () => {
    try {
        const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
            method: "GET",
            headers: {
                "Content-Type": "application/json",
                ...authHeaders()
            }
        });

        return await parseAuthResponse(response, "로그인 상태 확인에 실패했습니다.");
    } catch (error) {
        handleAuthNetworkError(error, "로그인 상태 확인에 실패했습니다.");
    }
};

export const logoutRequest = async () => {
    try {
        const response = await fetch(`${API_BASE_URL}/api/auth/logout`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...authHeaders()
            }
        });

        return await parseAuthResponse(response, "로그아웃 처리 중 서버 오류가 발생했습니다.");
    } catch (error) {
        handleAuthNetworkError(error, "로그아웃 요청에 실패했습니다.");
    }
};

export const changePasswordRequest = async ({ studentId, oldPassword, newPassword, newPasswordConfirm }) => {
    try {
        const response = await fetch(API_BASE_URL + "/api/auth/change-password", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ studentId, oldPassword, newPassword, newPasswordConfirm })
        });

        return await parseAuthResponse(response, "비밀번호 변경 처리 중 서버 오류가 발생했습니다.");
    } catch (error) {
        handleAuthNetworkError(error, "비밀번호 변경 요청에 실패했습니다.");
    }
};

export const deleteUserRequest = async (userId) => {
    if (!userId) {
        throw new Error("사용자 식별 정보가 없습니다.");
    }

    try {
        const cleanUserId = String(userId).replace(/^0x/i, '');
        const response = await fetch(`${API_BASE_URL}/api/auth/withdraw/${cleanUserId}`, {
            method: "DELETE",
            headers: {
                "Content-Type": "application/json",
                ...authHeaders()
            }
        });

        return await parseAuthResponse(response, "회원 탈퇴 처리 중 서버 오류가 발생했습니다.");
    } catch (error) {
        handleAuthNetworkError(error, "회원 탈퇴 요청에 실패했습니다.");
    }
};

export const verifyWithdrawalRequest = async ({ studentId, password, passwordConfirm }) => {
    try {
        const response = await fetch(API_BASE_URL + "/api/auth/verify-withdrawal", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ studentId, password, passwordConfirm })
        });

        return await parseAuthResponse(response, "탈퇴 정보 확인 중 서버 오류가 발생했습니다.");
    } catch (error) {
        handleAuthNetworkError(error, "탈퇴 정보 확인 요청에 실패했습니다.");
    }
};

export const registerRequest = async ({ studentId, password, userName }) => {
    try {
        const response = await fetch(`${API_BASE_URL}/api/auth/register`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ studentId, password, userName })
        });

        return await parseAuthResponse(response, "회원가입 처리 중 서버 오류가 발생했습니다.");
    } catch (error) {
        handleAuthNetworkError(error, "회원가입 요청에 실패했습니다.");
    }
};
