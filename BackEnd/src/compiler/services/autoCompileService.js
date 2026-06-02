/**
 * =================================================================
 * [Service] Auto Compile Service
 * 설명: 에디터 자동 미리보기를 위한 LaTeX 컴파일과 최신성 검증을 처리함
 * =================================================================
 */
const projectFileService = require('./projectFileService');
const autoCompileCacheService = require('./autoCompileCacheService');
const sanitizeService = require('./sanitizeService');
const dockerCompileService = require('./dockerCompileService');
const localFileService = require('./localFileService');
const compileResultService = require('./compileResultService');

exports.compileAuto = async ({
  projectId,
  userId,
  fileId,
  editingFileId,
  snapshotText,
  snapshotVersion,
  compileEngine = 'pdflatex',
  updateLastPdfUrl = false  // 현재 자동 컴파일은 db를 업데이트하지 않는 것이 정책이니 가급적 false 그대로 사용할 것
}) => {
  // 1. 컴파일 대상 파일 확인
  const compileTargetFileId = fileId;
  const snapshotFileId = editingFileId || fileId;
  await projectFileService.getCompileTargetFile({
    projectId,
    fileId: compileTargetFileId
  });

  // 2. 최신 Y.Doc 텍스트 결정
  // 현재는 Yjs 미구현이므로 snapshotText 우선 사용
  const snapshotFile = await projectFileService.getCompileTargetFile({
    projectId,
    fileId: snapshotFileId
  });
  const finalSnapshotText =
    typeof snapshotText === 'string'
      ? snapshotText
      : snapshotFile.current_content || '';

  // 3. 백업용 DB 업데이트
  await projectFileService.updateCurrentContent({
    projectId,
    fileId: snapshotFileId,
    content: finalSnapshotText
  });

  // 4. 기존 자동 컴파일 캐시 디렉토리 확인 또는 생성
  const workspace = await autoCompileCacheService.getAutoCompileWorkspace({
    projectId,
    userId,
    fileId: compileTargetFileId
  });

  // 5. DB 기준 프로젝트 파일/폴더 구조 조회
  const entries = await projectFileService.getProjectEntries(projectId);

  // 6. 최신 텍스트와 기존 파일 비교 후 변경된 파일만 write
  const syncResult = await autoCompileCacheService.syncChangedEntriesToWorkspace({
    workspacePath: workspace.path,
    entries,
    targetFileId: snapshotFileId,
    targetContent: finalSnapshotText
  });
  const assetCopyResult = await localFileService.copyProjectAssetsToWorkspace({
    projectId,
    entries,
    workspacePath: workspace.path
  });

  // 7. main tex 경로 확인
  const mainTexPath = autoCompileCacheService.getMainTexPath({
    workspacePath: workspace.path,
    entries,
    fileId: compileTargetFileId
  });

  // 8. sanitize 실행
  const sanitizeResult = await sanitizeService.sanitizeWorkspace(workspace.path);

  // 9. Docker 컨테이너에서 LaTeX 컴파일
  let compileResult;

  try {
    compileResult = await dockerCompileService.compileLatex({
      workspacePath: workspace.path,
      mainTexPath,
      engine: compileEngine,
      timeoutMs: 20000
    });
  } catch (err) {
    if (sanitizeResult.compileLog) {
      err.detail = [
        '자동 컴파일에 실패했습니다.',
        `변경 파일: ${syncResult.changedFiles.join(', ') || 'none'}`,
        '',
        sanitizeResult.compileLog,
        '',
        err.detail || err.message || ''
      ].filter(Boolean).join('\n');
    }

    throw err;
  }

  // 10. 성공 시 PDF를 로컬 임시 URL로 변환
  const pdfUrl = await localFileService.uploadCompiledPdf({
    projectId,
    userId,
    fileId: compileTargetFileId,
    pdfPath: compileResult.pdfPath,
    compileType: 'auto'
  });

  // 11. 자동 컴파일 결과를 last_pdf_url에 반영할지 선택
  let updatedAt = new Date();

  if (updateLastPdfUrl) {
    updatedAt = await compileResultService.updateLastPdfUrl({
      projectId,
      userId,
      fileId: compileTargetFileId,
      pdfUrl
    });
  }

  return {
    pdfUrl,
    compileLog: [
      '[AUTO COMPILE]',
      `changedFiles: ${syncResult.changedFiles.join(', ') || 'none'}`,
      '',
      sanitizeResult.compileLog,
      '',
      compileResult.compileLog
    ].filter(Boolean).join('\n'),
    updatedAt
  };
};