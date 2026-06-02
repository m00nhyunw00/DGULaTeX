/**
 * =================================================================
 * [Service] Editor Client Service
 * 설명: 파일 트리, 파일 본문, 마지막 편집 세션 API를 에디터 화면에 맞게 정규화함
 * =================================================================
 */
import { getEntriesRequest } from '../api/editor/fileTree/getEntries';
import { createEntryRequest } from '../api/editor/fileTree/createEntry';
import { deleteEntryRequest } from '../api/editor/fileTree/deleteEntry';
import { moveEntryRequest } from '../api/editor/fileTree/moveEntry';
import { renameEntryRequest } from '../api/editor/fileTree/renameEntry';
import { setMainDocumentRequest } from '../api/editor/fileTree/setMainDocument';
import { getFileContentRequest } from '../api/editor/textEditor/getFileContent'; 
import { updateFileContentRequest } from '../api/editor/textEditor/updateFileContent';
import { uploadEntryRequest } from '../api/editor/fileTree/uploadEntry';
import { downloadFileRequest } from '../api/editor/fileTree/downloadFile';
import { saveEditSessionRequest } from '../api/editor/session/saveEditSession';
import { getEditSessionRequest } from '../api/editor/session/getEditSession';

const handleServiceError = (error) => ({
    success: false,
    message: error.message || "요청 중 오류가 발생했습니다."
});

const normalizeEntry = (item) => ({
    fileId: item.fileId || item.entryId || item.id,

    parentId:
        item.parentId ||
        item.parent_id ||
        null,

    type:
        (
            item.isFolder ||
            item.is_folder ||
            item.type === 'folder'
        )
            ? 'folder'
            : 'file',

    fileName:
        item.fileName ||
        item.title,

    // 이미지/PDF 실제 파일 접근용
    assetUrl:
        item.assetUrl ||
        item.asset_url ||
        item.url ||
        null
});

export const EditorService = {
    // 1. 트리 조회
    async getEntries(projectId) {
        try {
            const result = await getEntriesRequest(projectId);
            const formatted = result.data.map(item => normalizeEntry(item));
            return { success: true, data: formatted };
        } catch (e) { return handleServiceError(e); }
    },

    // 2. 항목 생성
    async create(projectId, data) {
        try {
            const result = await createEntryRequest(projectId, data);
            if (result && result.status === "success" && result.data) {
                return { success: true, data: normalizeEntry(result.data) };
            }
            return { success: false, message: "생성 실패" };
        } catch (e) { return handleServiceError(e); }
    },

    // 3. 항목 삭제
    async delete(projectId, idOrIds) {
        try {
            const result = await deleteEntryRequest(projectId, idOrIds);
            if (result && result.status === "success") return { success: true };
            return { success: false, message: "삭제 실패" };
        } catch (e) { return handleServiceError(e); }
    },

    // 4. 위치 이동
    async move(projectId, idOrIds, { targetId }) {
        try {
            const result = await moveEntryRequest(projectId, idOrIds, { parentId: targetId });
            if (result && result.status === "success") return { success: true };
            return { success: false, message: result.message };
        } catch (e) { return handleServiceError(e); }
    },

    // 5. 이름 변경
    async rename(projectId, entryId, { title }) {
        try {
            const result = await renameEntryRequest(projectId, entryId, { newTitle: title });
            if (result && result.status === "success") return { success: true };
            return { success: false, message: result.message };
        } catch (e) { return handleServiceError(e); }
    },

    // 6. 프로젝트 메인 문서 변경
    async setMainDocument(projectId, entryId) {
        try {
            const result = await setMainDocumentRequest(projectId, entryId);
            return result; 
        } catch (e) { return handleServiceError(e); }
    },

    // 🎯 7. 특정 파일 내용 불러오기 (GET)
    async getFileContent(projectId, entryId) {
        try {
            const result = await getFileContentRequest(projectId, entryId);
            return { success: true, data: result.data };
        } catch (e) { return handleServiceError(e); }
    },

    // 🎯 8. 특정 파일 내용 저장하기 (PATCH)
    async updateFileContent(projectId, entryId, content) {
        try {
            const result = await updateFileContentRequest(projectId, entryId, content);
            return { success: true, message: result.message };
        } catch (e) { return handleServiceError(e); }
    },

    // 🎯 9. 특정 파일 및 폴더 업로드하기 (POST)
    async upload(projectId, formData) {
    try {
        const result = await uploadEntryRequest(projectId, formData);

        if (result && result.status === "success") {
            return {
                success: true,
                message: result.message,
                data: result.data
            };
        }

        return {
            success: false,
            message: result.message || "업로드 실패",
            errorLog: result.errorLog || ""
        };
        } catch (e) {
            return {
                success: false,
                message: e.message || "요청 중 오류가 발생했습니다.",
                statusCode: e.statusCode || 500,
                errorLog: e.errorLog || ""
            };
        }  
    },

    // 🎯 10. 특정 파일 다운로드하기 (GET)
    async downloadFile(projectId, entryId, fallbackFileName) {
        try {
            const result = await downloadFileRequest(projectId, entryId, fallbackFileName);

            return {
                success: true,
                blob: result.blob,
                fileName: result.fileName
            };
        } catch (e) {
            return handleServiceError(e);
        }
    },

    async saveEditSession(projectId, sessionData) {
        try {
            await saveEditSessionRequest(projectId, sessionData);
            return { success: true };
        } catch (e) {
            return handleServiceError(e);
        }
    },

    async getEditSession(projectId, userId) {
        try {
            const result = await getEditSessionRequest(projectId, userId);
            return { success: true, data: result.data || null };
        } catch (e) {
            return handleServiceError(e);
        }
    }
};