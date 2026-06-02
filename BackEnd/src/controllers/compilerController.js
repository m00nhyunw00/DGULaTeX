/**
 * =================================================================
 * [Controller] Compiler Controller
 * 설명: 요청 값 검증, 도메인 로직 호출, HTTP 응답 생성을 담당함
 * =================================================================
 */
const manualCompileService = require('../compiler/services/manualCompileService');
const autoCompileService = require('../compiler/services/autoCompileService');
const userModel = require('../models/userModel');
const db = require('../models/db');
const path = require('path');
const compileResultService = require('../compiler/services/compileResultService');
const localFileService = require('../compiler/services/localFileService');

/* ---------------------------------------------------------
 * SECTION 1: Request Identity Helpers
 * --------------------------------------------------------- */
const resolveUserId = async (studentId) => {
  // 이미 UUID 형태(하이픈 포함)라면 그대로 반환
  if (studentId.includes('-')) return studentId;
  
  // 학번인 경우 DB에서 UUID 조회
  const connection = await db.getConnection();
  try {
    const user = await userModel.findUserIdByStudentId(connection, studentId);
    return user ? user.id : studentId; // 못 찾으면 원래 값 반환 (에러 발생 예상)
  } finally {
    connection.release();
  }
};

exports.manualCompile = async (req, res, next) => {
  try {
    const { projectId } = req.params;

    const {
      fileId,          // 컴파일 대상 main file
      editingFileId,   // 현재 Yjs 편집 파일
      forceSanitize = true,
      compileEngine = 'pdflatex',
      snapshotText
    } = req.body;

    let userId = req.user?.id || req.body.userId;

    if (!projectId || !fileId || !userId) {
      return res.status(400).json({
        success: false,
        statusCode: 400,
        message: 'MISSING_IDS',
        compileLog: ''
      });
    }

    const resolvedUserId = await resolveUserId(userId);

    const result = await manualCompileService.compileManual({
      projectId,
      userId: resolvedUserId,
      fileId,
      editingFileId,
      forceSanitize,
      compileEngine,
      snapshotText
    });

    return res.status(200).json({
      success: true,
      pdfUrl: result.pdfUrl,
      compileLog: result.compileLog,
      updatedAt: result.updatedAt
    });
  } catch (err) {
    next(err);
  }
};

exports.autoCompile = async (req, res, next) => {
  try {
    const { projectId } = req.params;

    const {
      fileId,          // 컴파일 대상 main file
      editingFileId,   // 현재 Yjs 편집 파일
      snapshotText,
      snapshotVersion,
      compileEngine = 'pdflatex',
      updateLastPdfUrl = false
    } = req.body;

    let userId = req.user?.id || req.body.userId;

    if (!projectId || !fileId || !userId) {
      return res.status(400).json({
        success: false,
        statusCode: 400,
        message: 'MISSING_IDS',
        compileLog: ''
      });
    }

    const resolvedUserId = await resolveUserId(userId);

    const result = await autoCompileService.compileAuto({
      projectId,
      userId: resolvedUserId,
      fileId,
      editingFileId,
      snapshotText,
      snapshotVersion,
      compileEngine,
      updateLastPdfUrl
    });

    return res.status(200).json({
      success: true,
      pdfUrl: result.pdfUrl,
      compileLog: result.compileLog,
      updatedAt: result.updatedAt
    });
  } catch (err) {
    next(err);
  }
};

/* ---------------------------------------------------------
 * SECTION 2: Compile Request Handlers
 * --------------------------------------------------------- */

// 컴파일된 PDF 다운로드 요청 처리
exports.downloadCompiledPdf = async (req, res, next) => {
  try {
    const { projectId } = req.params;

    const {
      downloadTarget = 'mine',
      userId: bodyUserId,
      fileName
    } = req.body;

    const userId = req.user?.id || bodyUserId;

    if (!projectId) {
      return res.status(400).json({
        success: false,
        statusCode: 400,
        message: 'PROJECT_ID_REQUIRED'
      });
    }

    if (!['mine', 'latest'].includes(downloadTarget)) {
      return res.status(400).json({
        success: false,
        statusCode: 400,
        message: 'INVALID_DOWNLOAD_TARGET'
      });
    }

    let pdfRecord = null;

    if (downloadTarget === 'mine') {
      if (!userId) {
        return res.status(400).json({
          success: false,
          statusCode: 400,
          message: 'USER_ID_REQUIRED'
        });
      }

      const resolvedUserId = await resolveUserId(userId);

      pdfRecord = await compileResultService.getMyLatestPdfUrl({
        projectId,
        userId: resolvedUserId
      });
    }

    if (downloadTarget === 'latest') {
      pdfRecord = await compileResultService.getProjectLatestPdfUrl({
        projectId
      });
    }

    if (!pdfRecord || !pdfRecord.last_pdf_url) {
      return res.status(404).json({
        success: false,
        statusCode: 404,
        message: 'COMPILED_PDF_NOT_FOUND'
      });
    }

    const pdfPath = localFileService.resolveCompiledPdfPath(
      pdfRecord.last_pdf_url
    );

    const downloadName =
      fileName && String(fileName).trim()
        ? `${String(fileName).replace(/[\\/:*?"<>|]/g, '_')}.pdf`
        : 'compiled.pdf';

    return res.download(pdfPath, downloadName);
  } catch (err) {
    next(err);
  }
};

// 마지막 컴파일 PDF 조회
exports.getLastCompiledPdf = async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const queryUserId = req.query.userId;
    const userId = req.user?.id || queryUserId;

    if (!projectId) {
      return res.status(400).json({
        success: false,
        statusCode: 400,
        message: 'PROJECT_ID_REQUIRED'
      });
    }

    if (!userId) {
      return res.status(400).json({
        success: false,
        statusCode: 400,
        message: 'USER_ID_REQUIRED'
      });
    }

    const resolvedUserId = await resolveUserId(userId);

    const pdfRecord = await compileResultService.getMyLatestPdfUrl({
      projectId,
      userId: resolvedUserId
    });

    if (!pdfRecord || !pdfRecord.last_pdf_url) {
      return res.status(200).json({
        success: true,
        pdfUrl: null,
        message: 'LAST_PDF_NOT_FOUND'
      });
    }

    /**
     * DB에는 last_pdf_url이 있는데 실제 로컬 PDF 파일이 삭제된 경우를 방지한다.
     * 파일이 없으면 깨진 iframe을 띄우지 않도록 pdfUrl: null을 반환한다.
     */
    try {
      localFileService.resolveCompiledPdfPath(pdfRecord.last_pdf_url);
    } catch (error) {
      return res.status(200).json({
        success: true,
        pdfUrl: null,
        message: error.message || 'PDF_FILE_NOT_FOUND'
      });
    }

    return res.status(200).json({
      success: true,
      pdfUrl: pdfRecord.last_pdf_url,
      updatedAt: pdfRecord.updated_at
    });
  } catch (err) {
    next(err);
  }
};