/**
 * =================================================================
 * [API] Rename Entry Request Module
 * 설명: 백엔드 API 호출, 요청 payload 구성, 응답 오류 처리를 담당함
 * =================================================================
 */
const API_BASE_URL = import.meta.env.VITE_API_URL;

export const renameEntryRequest = async (projectId, entryId, renameData) => {
    try {
        const response = await fetch(`${API_BASE_URL}/api/projects/${projectId}/entries/${entryId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            // 백엔드가 newTitle 키를 기다리므로 { newTitle: "..." } 형태로 전송
            body: JSON.stringify(renameData),
        });
        const data = await response.json();
        if (response.ok && data.status === "success") return data;
        throw new Error(data.message || "이름 변경 실패");
    } catch (error) { throw error; }
};