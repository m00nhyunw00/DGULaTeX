/**
 * =================================================================
 * [Service] Compiler Client Service
 * 설명: 수동/자동 컴파일 API 결과와 로그 구조를 화면에서 쓰기 좋은 형태로 정규화함
 * =================================================================
 */
import { manualCompileRequest } from '../api/editor/compiler/manualCompileRequest'; 
import { autoCompileRequest } from '../api/editor/compiler/autoCompileRequest';
import { downloadCompiledPdfRequest } from "../api/editor/compiler/downloadCompiledPdfRequest";
import { getLastCompiledPdfRequest } from '../api/editor/compiler/getLastCompiledPdfRequest';

const handleCompileError = (error) => ({
    success: false,
    message: error.message || "컴파일 중 예기치 못한 오류가 발생했습니다.",
    statusCode: error.statusCode || 500,
    compileLog: error.compileLog || "실행 로그를 인출할 수 없습니다."
});

export const CompilerService = { 
    // 1. 수동 컴파일 액션 조율
    async manualCompile(projectId, compileData) {
        try {
            // 🎯 [수정 완료]: 다른 파일들과 네이밍 규칙이 부합하도록 실물 함수를 정확히 찌릅니다.
            const result = await manualCompileRequest(projectId, compileData);
            return {
                success: true,
                pdfUrl: result.pdfUrl,
                compileLog: result.compileLog,
                updatedAt: result.updatedAt
            };
        } catch (e) {
            return handleCompileError(e);
        }
    },

    // // 2. 자동 컴파일 액션 조율
    // async autoCompile(projectId, autoCompileData) {
    //     try {
    //         const result = await autoCompileRequest(projectId, autoCompileData);
    //         return {
    //             success: true,
    //             pdfUrl: result.pdfUrl,
    //             compileLog: result.compileLog,
    //             updatedAt: result.updatedAt
    //         };
    //     } catch (e) {
    //         return handleCompileError(e);
    //     }
    // }

    // async autoCompile(projectId, autoCompileData) {
    //     try {
    //         const result = await autoCompileRequest(projectId, autoCompileData);

    //         return {
    //             success: true,
    //             pdfUrl: result.pdfUrl || result.pdf_url || result.data?.pdfUrl || result.data?.pdf_url,
    //             compileLog: result.compileLog,
    //             updatedAt: result.updatedAt
    //         };
    //     } catch (e) {
    //         return handleCompileError(e);
    //     }
    // }

    async autoCompile(projectId, autoCompileData) {
        try {
            const result = await autoCompileRequest(projectId, autoCompileData);

            return {
                success: true,
                pdfUrl: result.pdfUrl || result.pdf_url || result.data?.pdfUrl || result.data?.pdf_url,
                compileLog: result.compileLog,
                updatedAt: result.updatedAt
            };
        } catch (e) {
            return handleCompileError(e);
        }
    },

    // 3. PDF 다운로드 액션 조율
    async downloadCompiledPdf(projectId, downloadData) {
        try {
            await downloadCompiledPdfRequest(projectId, downloadData);

            return {
                success: true
            };
        } catch (e) {
            return {
                success: false,
                message: e.message || "PDF 다운로드 중 예기치 못한 오류가 발생했습니다.",
                statusCode: e.statusCode || 500
            };
        }
    },

    async getLastCompiledPdf(projectId, userId) {
        try {
            return await getLastCompiledPdfRequest(projectId, userId);
        } catch (e) {
            return {
                success: false,
                message: e.message || '마지막 컴파일 PDF 조회 실패'
            };
        }
    }
};