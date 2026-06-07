/**
 * =================================================================
 * [Service] Project Client Service
 * 설명: 대시보드 프로젝트 조회, 생성, 수정, 삭제, 다운로드 API를 화면 모델로 변환함
 * =================================================================
 */
import { getProjectsRequest } from '../api/dashboard/getProject';
import { getProjectDetailRequest } from '../api/dashboard/getProjectDetail';
import { updateProjectTitleRequest } from '../api/dashboard/updateProjectTitle'; 
import { downloadProjectRequest } from '../api/dashboard/downloadProject';
import { downloadPdfRequest } from '../api/dashboard/downloadPdf';

export const ProjectService = {

    /** 프로젝트 전체 목록 조회 */
    async getAll(ownerId) {
        const data = await getProjectsRequest(ownerId);
        return data || { projects: [] };
    },

    /** 특정 프로젝트 상세 조회 (에디터 입장용) */
    async getById(projectId) {
        try {
            const data = await getProjectDetailRequest(projectId);
            return { success: true, data };
        } catch (error) {
            throw error;
        }
    },

    /** 신규 프로젝트 생성 */
    async create(title, ownerId) {
        const response = await fetch(`${import.meta.env.VITE_API_URL}/api/projects`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, ownerId })
        });
        const result = await response.json();
        
        return { 
            success: result.status === "success", 
            projectId: result.data?.projectId 
        };
    },

    /** 프로젝트 삭제 (단일 및 일괄 대응) */
    async delete(projectIds, requesterId) {
        const idsArray = Array.isArray(projectIds) ? projectIds : [projectIds];
        const cleanRequesterId = String(requesterId || '').replace(/^0x/i, '').replace(/-/g, '').toLowerCase().trim();
        
        try {
            const deletePromises = idsArray.map(id => 
                fetch(`${import.meta.env.VITE_API_URL}/api/projects/${id}`, {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ requesterId: cleanRequesterId })
                }).then(async (res) => {
                    const data = await res.json();
                    if (!res.ok || data.status !== "success") {
                        throw new Error(data.message || "프로젝트 삭제 실패");
                    }
                    return data;
                })
            );

            await Promise.all(deletePromises);

            return { 
                success: true, 
                message: `${idsArray.length}개의 프로젝트가 삭제되었습니다.`
            };
        } catch (error) {
            throw new Error(error.message || "서버 통신 중 오류가 발생했습니다.");
        }
    },

    // 🎯 프로젝트 이름 변경
    async renameProject(projectId, newTitle) {
        try {
            const result = await updateProjectTitleRequest(projectId, newTitle);
            return { success: true, message: result.message };
        } catch (error) {
            return { success: false, message: error.message || "이름 변경 중 오류가 발생했습니다." };
        }
    },

    // 🎯 프로젝트 압축파일 다운로드
    async downloadProject(projectId, fallbackFileName) {
        try {
            const result = await downloadProjectRequest(projectId, fallbackFileName);

            return {
                success: true,
                blob: result.blob,
                fileName: result.fileName
            };
        } catch (error) {
            return {
                success: false,
                message: error.message || "프로젝트 다운로드 중 오류가 발생했습니다."
            };
        }
    },

    async downloadProjectPdf(projectId, options = {}) {
        try {
            const result = await downloadPdfRequest(projectId, options);

            if (!result?.success) {
                return {
                    success: false,
                    message: result?.message || 'PDF 다운로드 중 오류가 발생했습니다.'
                };
            }

            return {
                success: true,
                blob: result.blob,
                fileName: result.fileName
            };
        } catch (error) {
            return {
                success: false,
                message: error.message || 'PDF 다운로드 중 오류가 발생했습니다.'
            };
        }
    }
};
