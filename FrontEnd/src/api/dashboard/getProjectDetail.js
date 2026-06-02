/**
 * =================================================================
 * [API] Get Project Detail Request Module
 * 설명: 백엔드 API 호출, 요청 payload 구성, 응답 오류 처리를 담당함
 * =================================================================
 */
const API_BASE_URL = import.meta.env.VITE_API_URL;

export const getProjectDetailRequest = async (projectId) => {
    try {
        const response = await fetch(`${API_BASE_URL}/api/projects/${projectId}`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
        });

        const result = await response.json();

        if (response.ok && result.status === "success") {
            return result.data; // 명세서 규격의 상세 데이터 반환
        } else {
            throw new Error(result.message || "프로젝트 상세 정보를 가져오는데 실패했습니다.");
        }
    } catch (error) {
        throw new Error("네트워크 에러: 프로젝트 서버 연결을 확인하세요.");
    }
};