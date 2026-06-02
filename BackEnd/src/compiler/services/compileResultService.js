/**
 * =================================================================
 * [Service] Compile Result Service
 * 설명: 컴파일 성공 후 최신 PDF URL과 편집 세션 결과를 DB에 반영함
 * =================================================================
 */
const crypto = require('crypto');
const db = require('../../models/db');
const testFixture = require('../test/compilerTestFixture');

/**
 * 환경 변수를 통해 테스트 모드 여부를 확인
 */
function isTestMode() {
  return process.env.COMPILER_TEST_MODE === 'true';
}

exports.updateLastPdfUrl = async ({ projectId, userId, fileId, pdfUrl }) => {
  // 1. [테스트] 테스트 모드일 경우 가짜 Fixture 로직 실행
  if (isTestMode()) {
    return testFixture.updateLastPdfUrl({ projectId, userId, fileId, pdfUrl });
  }

  // 2. [타입 정류] 데이터베이스 호출 전, 모든 ID가 Hex 문자열임을 보장
  // DB에서 Buffer로 읽힌 값들이 path.join이나 UUID_TO_BIN에서 터지지 않도록 예방
  const pId = Buffer.isBuffer(projectId) ? projectId.toString('hex') : projectId;
  const uId = Buffer.isBuffer(userId) ? userId.toString('hex') : userId;
  const fId = Buffer.isBuffer(fileId) ? fileId.toString('hex') : fileId;

  const sessionId = crypto.randomUUID();

  // 3. [저장/갱신] last_edit_session 테이블에 PDF 정보 기록 (UPSERT)
  await db.query(
    `
    INSERT INTO last_edit_session (
      session_id, 
      project_id, 
      user_id, 
      file_id, 
      last_pdf_url
    )
    VALUES (UUID_TO_BIN(?), UUID_TO_BIN(?), UUID_TO_BIN(?), UUID_TO_BIN(?), ?)
    ON DUPLICATE KEY UPDATE
      file_id = VALUES(file_id),
      last_pdf_url = VALUES(last_pdf_url),
      updated_at = CURRENT_TIMESTAMP
    `,
    [sessionId, pId, uId, fId, pdfUrl]
  );

  // 4. [조회] 방금 업데이트된 레코드의 시간 정보 취득
  const [rows] = await db.query(
    `
    SELECT updated_at 
    FROM last_edit_session 
    WHERE project_id = UUID_TO_BIN(?) 
      AND user_id = UUID_TO_BIN(?)
    `,
    [pId, uId]
  );

  // 5. [결과] 최종 수정 시간 반환 (데이터 없으면 현재 시간으로 보정)
  return rows[0]?.updated_at || new Date();
};

// 내 수동 컴파일 PDF 조회
exports.getMyLatestPdfUrl = async ({
  projectId,
  userId
}) => {
  const [rows] = await db.query(
    `
    SELECT last_pdf_url, updated_at
    FROM last_edit_session
    WHERE project_id = UUID_TO_BIN(?)
      AND user_id = UUID_TO_BIN(?)
      AND last_pdf_url IS NOT NULL
    ORDER BY updated_at DESC
    LIMIT 1
    `,
    [projectId, userId]
  );

  return rows[0] || null;
};

// 프로젝트 전체 최신 PDF 조회
exports.getProjectLatestPdfUrl = async ({
  projectId
}) => {
  const [rows] = await db.query(
    `
    SELECT last_pdf_url, user_id, updated_at
    FROM last_edit_session
    WHERE project_id = UUID_TO_BIN(?)
      AND last_pdf_url IS NOT NULL
    ORDER BY updated_at DESC
    LIMIT 1
    `,
    [projectId]
  );

  return rows[0] || null;
};