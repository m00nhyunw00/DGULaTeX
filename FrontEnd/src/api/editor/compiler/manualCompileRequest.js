/**
 * =================================================================
 * [API] Manual Compile Request Module
 * 설명: 백엔드 API 호출, 요청 payload 구성, 응답 오류 처리를 담당함
 * =================================================================
 */
const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

export const manualCompileRequest = async (projectId, compileData) => {
    try {
        const url = `${API_BASE_URL}/api/compile/${projectId}`;
        const options = {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(compileData)
        };

        const response = await fetch(url, options);
        const data = await response.json();
        
        if (response.ok && data.success === true) {
            return data;
        }
        
        const error = new Error(data.message || "LaTeX 문서 컴파일에 실패했습니다.");
        error.success = false;
        error.statusCode = data.statusCode || response.status;
        error.compileLog = data.compileLog || "로그가 존재하지 않습니다.";
        
        throw error;
    } catch (error) {
        throw error;
    }
};