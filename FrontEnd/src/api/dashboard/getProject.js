/**
 * =================================================================
 * [API] Get Project Request Module
 * 설명: 백엔드 API 호출, 요청 payload 구성, 응답 오류 처리를 담당함
 * =================================================================
 */
const API_BASE_URL = import.meta.env.VITE_API_URL;

/**
 * 서버에 특정 사용자의 프로젝트 목록 조회를 요청함
 * @param {string} ownerId - 조회를 요청하는 사용자의 학번/ID
 */
export const getProjectsRequest = async (ownerId) => {
    try {
        const response = await fetch(`${API_BASE_URL}/api/projects?ownerId=${ownerId}`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
        });

        const result = await response.json();

        if (response.ok && result.status === "success") {
            return result.data; // { projects: [...] }
        } else {
            throw new Error(result.message || "프로젝트 목록 로드 실패");
        }
    } catch (error) {
        throw new Error("네트워크 에러: 프로젝트 서버 연결을 확인하세요.");
    }
};