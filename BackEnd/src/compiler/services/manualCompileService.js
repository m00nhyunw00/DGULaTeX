/**
 * =================================================================
 * [Service] Manual Compile Service
 * 설명: 사용자 요청 기반 LaTeX 컴파일 작업 공간 생성, sanitize, Docker 실행, PDF 저장을 처리함
 * =================================================================
 */
const projectFileService = require('./projectFileService');
const compileWorkspaceService = require('./compileWorkspaceService');
const sanitizeService = require('./sanitizeService');
const dockerCompileService = require('./dockerCompileService');
const localFileService = require('./localFileService');
const compileResultService = require('./compileResultService');

exports.compileManual = async ({ 
  projectId, 
  userId, 
  fileId, 
  editingFileId,
  forceSanitize = true, 
  compileEngine = 'pdflatex',
  snapshotText 
}) => {
  let workspace = null;

  try {
    // 1. [검증] 프로젝트 내 메인 컴파일 타깃 파일 확인
    const compileTargetFileId = fileId;
    await projectFileService.getCompileTargetFile({
      projectId,
      fileId: compileTargetFileId
    });

    const hasEditingSnapshot =
      Boolean(editingFileId) &&
      typeof snapshotText === 'string';

    // 2. [동기화] 작업 전 DB의 본문 데이터를 최신 상태로 백업/저장

    let finalSnapshotText = null;

    if (hasEditingSnapshot) {
      // 현재 편집 중인 파일 검증
      await projectFileService.getCompileTargetFile({
        projectId,
        fileId: editingFileId
      });

      // 3. [데이터 준비] 현재 snapshot 결정 (요청 텍스트 우선, 없으면 DB 로드)

      finalSnapshotText = snapshotText;

      // snapshot이 있을 때만 DB 반영
      await projectFileService.updateCurrentContent({
        projectId,
        fileId: editingFileId,
        content: finalSnapshotText
      });
    }

    // 4. [환경 구축] 컴파일을 위한 고유 작업 디렉토리 생성
    workspace = await compileWorkspaceService.createWorkspace({ projectId });

    // 5. [복원] DB entry 구조를 물리적 작업 디렉토리에 파일로 복원
    const entries = await projectFileService.getProjectEntries(projectId);
    await compileWorkspaceService.restoreEntryTree({ workspacePath: workspace.path, entries });

    // 6. [Asset 준비] 프로젝트 외부 에셋(이미지 등) 작업 디렉토리로 동기화
    await localFileService.copyProjectAssetsToWorkspace({
      projectId,
      entries,
      workspacePath: workspace.path
    });

    // 7. [Snapshot 적용] 수정한 본문을 컴파일 타깃 파일에 실시간 적용
    if (hasEditingSnapshot) {
      await compileWorkspaceService.writeEntrySnapshot({
        workspacePath: workspace.path,
        entries,
        fileId: editingFileId,
        content: finalSnapshotText
      });
    }
    const mainTexPath = compileWorkspaceService.getEntryPath({
      workspacePath: workspace.path,
      entries,
      fileId: compileTargetFileId
    });

    // 8. [보안] 악성 스크립트 제거(Sanitize) 공정 가동 (선택적)
    let sanitizeResult = { sanitized: false, compileLog: '' };
    if (forceSanitize) {
      sanitizeResult = await sanitizeService.sanitizeWorkspace(workspace.path);
    }

    // 9. [컴파일] Docker 컨테이너 내 LaTeX 컴파일 가동
    let compileResult;

    try {
      compileResult = await dockerCompileService.compileLatex({
        workspacePath: workspace.path,
        mainTexPath,
        engine: compileEngine,
        timeoutMs: 30000,
        compilePasses: 2
      });
    } catch (err) {
      err.detail = [
        '[MANUAL COMPILE]',
        '수동 컴파일에 실패했습니다.',
        '',
        sanitizeResult.compileLog,
        '',
        err.detail || err.message || ''
      ].filter(Boolean).join('\n');

      throw err;
    }
    // 10. [업로드] 성공한 결과물(PDF)을 S3/Public 저장소에 사출
    const pdfUrl = await localFileService.uploadCompiledPdf({ 
      projectId, 
      userId, 
      fileId: compileTargetFileId, 
      pdfPath: compileResult.pdfPath,
      compileType: 'manual'
    });

    // 11. [기록] 마지막 작업 세션 및 PDF URL 업데이트
    const updatedAt = await compileResultService.updateLastPdfUrl({
      projectId, userId, fileId: compileTargetFileId, pdfUrl
    });

    // 12. [종료] 컴파일 로그 취합 및 결과 반환
    return { 
      pdfUrl, 
      compileLog: [sanitizeResult.compileLog, compileResult.compileLog].filter(Boolean).join('\n'), 
      updatedAt 
    };

  } finally {
    // 13. [정리] 작업 디렉토리 삭제 및 리소스 해제
    if (workspace) {
      await compileWorkspaceService.cleanupWorkspace(workspace.path);
    }
  }
};

