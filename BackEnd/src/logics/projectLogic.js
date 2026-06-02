/**
 * =================================================================
 * [Logic] Project Core Logic
 * 설명: 프로젝트 생성, 조회, 삭제, 권한 검증 및 메인 문서 설정 규칙을 처리함
 * =================================================================
 */
const projectLogic = {
    /** * UUID(Hex)를 DB용 바이너리로 변환 */
    hexToBuffer: (hex) => {
        if (!hex) return null;

        const cleanHex = hex.startsWith('0x') || hex.startsWith('0X') 
            ? hex.substring(2) 
            : hex;

        return Buffer.from(cleanHex.toLowerCase(), 'hex');
    },

    /** * 새로운 바이너리 ID 생성 */
    generateBinaryId: () => {
        const crypto = require('crypto');
        return crypto.randomBytes(16);
    },

    /** *무작위 영어 대문자 + 숫자 조합의 6자리 고정 초대 코드 생성 */
    generateAlphaNumericCode: () => {
        const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let result = '';
        for (let i = 0; i < 6; i++) {
            result += characters.charAt(Math.floor(Math.random() * characters.length));
        }
        return result;
    },

    /** * 목록 조회 응답 규격 포맷팅 
     * useDashboard.js에서 가공하기 편하도록 필드명을 최적화함
     */
    formatProjectResponse: (project, studentId) => {
        if (!project) return null;
        return {
            // [변경] projectId 대신 id로 직접 명명하여 UI 전달 과정의 혼선 방지
            id: project.id.toString('hex'), 
            title: project.title,
            ownerName: project.user_name || "사용자", 
            updatedAt: project.updated_at,          
            ownerId: project.owner_student_id || studentId,
            ownerUuid: project.owner_id ? project.owner_id.toString("hex") : null
        };
    },

    /** * 상세 조회 응답 규격 포맷팅 (에디터 입장용) */
    formatProjectDetailResponse: (project, entries) => {
        if (!project) return null;

        // 메인 파일 ID를 미리 변수에 할당 (null 체크를 위함)
        const mainFileId = project.main_file_id;

        return {
            projectId: project.id.toString('hex'),
            title: project.title,
            ownerId: project.owner_id ? project.owner_id.toString('hex') : null,
            ownerName: project.owner_name || project.user_name, 
            lastOpenedFileId: mainFileId ? mainFileId.toString('hex') : null,
            lastPdfURL: `/api/projects/${project.id.toString('hex')}/download/pdf`,
            files: entries.map(e => {
                const isMainFile = (e.id && mainFileId) 
                    ? e.id.equals(mainFileId) 
                    : false;

                return {
                    fileId: e.id.toString('hex'),
                    fileName: e.title,
                    type: e.is_folder ? 'folder' : 'file',
                    parentId: e.parent_id ? e.parent_id.toString('hex') : null,
                    content: e.current_content,
                    isMain: isMainFile
                };
            })
        };
    },

    
};

module.exports = projectLogic;