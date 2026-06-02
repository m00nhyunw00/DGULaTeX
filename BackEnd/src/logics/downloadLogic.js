/**
 * =================================================================
 * [Logic] Download Archive Logic
 * 설명: 프로젝트, 폴더, 파일 다운로드를 위한 ZIP 스트림과 파일 수집 로직을 처리함
 * =================================================================
 */
// 프로젝트, 폴더, 파일 여러 개 zip 파일로 다운로드 시 로직


const archiver = require('archiver');
const path = require('path');
const fs = require('fs');

module.exports = {
    /**
     * ZIP 다운로드 응답 헤더 설정
     */
    setZipHeaders: (res, downloadName) => {
        const encodedName = encodeURIComponent(downloadName).replace(/['()]/g, escape);
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodedName}.zip`);
    },

    /**
     * 엔트리 리스트를 순회하며 실시간 ZIP 압축 및 전송
     */
    pipeEntriesToZip: async (res, entries, projectIdStr) => {
        let archive;

        // 포획한 속성들을 바탕으로 환경에 맞게 압축기 인스턴스 생성
        if (typeof archiver === 'function') {
            archive = archiver('zip', { zlib: { level: 9 } });
        } else if (archiver.ZipArchive) {
            // ZipArchive 클래스로 직접 인스턴스 생성
            archive = new archiver.ZipArchive({ zlib: { level: 9 } });
        } else if (archiver.Archiver) {
            archive = new archiver.Archiver('zip', { zlib: { level: 9 } });
        } else {
            const factory = archiver.default || archiver.create;
            if (!factory) throw new Error("archiver 모듈의 유효한 생성자를 찾을 수 없습니다.");
            archive = factory === archiver.create 
                ? archiver.create('zip', { zlib: { level: 9 } }) 
                : factory('zip', { zlib: { level: 9 } });
        }

        // 압축 스트림 에러 핸들링 및 응답 파이프 연결
        archive.on('error', (err) => { throw err; });
        archive.pipe(res);
        
        //  id와 parent_id를 이용해 메모리상에 전체 경로(Path) 맵 구축하기
        const entryMap = {};
        entries.forEach(e => {
            const hexId = e.id.toString('hex').toUpperCase();
            entryMap[hexId] = e;
        });

        const calculateFullPath = (entry) => {
            let parts = [entry.title];
            let current = entry;

            // 부모가 존재하면 타고 올라가면서 폴더명을 앞에 추가
            while (current.parent_id) {
                const hexParentId = current.parent_id.toString('hex').toUpperCase();
                const parent = entryMap[hexParentId];
                if (!parent) break;
                
                parts.unshift(parent.title);
                current = parent;
            }
            return parts.join('/');
        };

        // 집어넣기 시작
        for (const entry of entries) {
            if (entry.is_folder === 1) continue; // 폴더 자체는 파일 경로 빌드할 때 자동 생성되므로 스킵

            // 위 함수로 'src/chapters/intro.tex' 같은  상대 경로 획득!
            const archivePath = calculateFullPath(entry); 
            
            const ext = path.extname(entry.title).toLowerCase();
            const isTextExtension = ['.tex', '.bib', '.txt', '.toc', '.sty', '.cls', '.md'].includes(ext);

            // Case A: 가상 텍스트 파일 (.tex, .bib 등 DB 기반)
            if ((entry.current_content !== undefined && entry.current_content !== null) || isTextExtension) {
                const textPayload = entry.current_content || ''; 
                archive.append(textPayload, { name: archivePath });
            } 
            // Case B: 서버 디스크의 물리 파일 (이미지, PDF 등)
            else {
                const entryIdHex = entry.id.toString('hex');
                const physicalPath = path.join(
                    process.cwd(), 'public', 'uploads', 'projects',
                    projectIdStr.toUpperCase(), 'assets', entryIdHex.toUpperCase(), entry.title
                );

                if (fs.existsSync(physicalPath)) {
                    archive.file(physicalPath, { name: archivePath });
                }
            }
        }

        // 압축 마감 및 전송
        await archive.finalize();
    }
};