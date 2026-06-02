/**
 * =================================================================
 * [API] Delete Project Request Module
 * 설명: 백엔드 API 호출, 요청 payload 구성, 응답 오류 처리를 담당함
 * =================================================================
 */
const API_BASE_URL = import.meta.env.VITE_API_URL;

/**
 * 서버에 특정 프로젝트의 삭제 요청을 보냄
 * @param {string} projectId - 삭제할 프로젝트의 고유 ID (UUID)
 */
export const deleteProjectRequest = async (projectId) => {
    try {
        /* ---------------------------------------------------------
         * SECTION 1: Fetch Request Configuration
         * --------------------------------------------------------- */
        // URL 경로 끝에 ${projectId}를 포함시켜 명세서의 :id 자리를 동적으로 채움
        const response = await fetch(`${API_BASE_URL}/api/projects/${projectId}`, {
            method: 'DELETE', // 삭제를 의미하는 HTTP 메서드 설정
            headers: { 'Content-Type': 'application/json' },
        });

        // 응답 데이터 파싱
        const data = await response.json();

        /* ---------------------------------------------------------
         * SECTION 2: Response Validation & Result Extraction
         * --------------------------------------------------------- */
        // 서버 응답이 200번대(ok)이고 비즈니스 로직상 삭제 성공 시 데이터 반환
        if (response.ok && data.success) {
            return data;
        } else {
            // 서버에서 전달한 실패 사유를 포함한 에러 객체 생성 및 던짐
            const serverError = new Error(data.message || "프로젝트 삭제 실패");
            serverError.debugCode = data.debugCode; 
            throw serverError;
        }
    } catch (error) {
        /* ---------------------------------------------------------
         * SECTION 3: Exception Propagation
         * --------------------------------------------------------- */
        // 이미 가공된 서버 발 에러(debugCode 존재)는 그대로 상위로 전파
        if (error.debugCode) throw error;
        
        // 네트워크 단절 등 통신 자체에 실패한 경우의 예외 처리
        throw new Error("네트워크 에러: 프로젝트 서버 연결을 확인하세요.");
    }
};