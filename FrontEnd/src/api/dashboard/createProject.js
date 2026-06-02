/**
 * =================================================================
 * [API] Create Project Request Module
 * 설명: 백엔드 API 호출, 요청 payload 구성, 응답 오류 처리를 담당함
 * =================================================================
 */
const API_BASE_URL = import.meta.env.VITE_API_URL;

/**
 * 서버에 프로젝트 생성 요청을 보냄
 * @param {string} title - 프로젝트 제목
 * @param {string} ownerId - 생성자 아이디
 */
export const createProjectRequest = async (title, ownerId) => {
    try {
        const response = await fetch(`${API_BASE_URL}/api/projects`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, ownerId }),
        });

        const data = await response.json();

        // 서버 응답이 200번대(ok)이고 success가 true인 경우만 데이터 반환
        if (response.ok && data.success) {
            return data;
        } else {
            // 서버에서 보낸 에러 메시지와 디버그 코드를 포함한 에러 객체 생성
            const serverError = new Error(data.message || "프로젝트 생성 실패");
            serverError.debugCode = data.debugCode; 
            throw serverError;
        }
    } catch (error) {
        // 이미 가공된 서버 에러라면 그대로 던짐
        if (error.debugCode) throw error;
        
        // 그 외의 네트워크 장애 등은 일반 에러로 처리
        throw new Error("네트워크 에러: 프로젝트 서버 연결을 확인하세요.");
    }
};