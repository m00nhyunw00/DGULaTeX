/**
 * =================================================================
 * [Service] Project File Query Service
 * 설명: 컴파일에 필요한 프로젝트 엔트리, 메인 문서, 파일 본문 조회와 저장을 담당함
 * =================================================================
 */
const crypto = require('crypto');
const db = require('../../models/db');
const ApiError = require('../utils/apiError');
const testFixture = require('../test/compilerTestFixture');

function isTestMode() {
  return process.env.COMPILER_TEST_MODE === 'true';
}

exports.getCompileTargetFile = async ({ projectId, fileId }) => {
  if (isTestMode()) {
    console.log('[compiler] using test fixture');
    return testFixture.getCompileTargetFile({ projectId, fileId });
  }

  //const cleanProjectId = projectId.replace(/^0x/i, '');
  //const cleanFileId = fileId.replace(/^0x/i, '');

  const [rows] = await db.query(
    `
    SELECT 
      BIN_TO_UUID(id) AS id,
      BIN_TO_UUID(project_id) AS project_id,
      BIN_TO_UUID(parent_id) AS parent_id,
      is_folder,
      title,
      current_content,
      content_hash,
      asset_url
    FROM entry
    WHERE id = UUID_TO_BIN(?)
      AND project_id = UUID_TO_BIN(?)
      AND is_folder = 0
    `,
    [fileId, projectId]
  );

  if (rows.length === 0) {
    throw new ApiError(404, 'MAIN_DOCUMENT_NOT_FOUND');
  }

  const file = rows[0];

  if (!file.title || !file.title.toLowerCase().endsWith('.tex')) {
    throw new ApiError(422, 'MAIN_DOCUMENT_NOT_TEX');
  }

  return file;
};

exports.updateCurrentContent = async ({ projectId, fileId, content }) => {
  if (isTestMode()) {
    return testFixture.updateCurrentContent({
      projectId,
      fileId,
      content
    });
  }

  // const cleanProjectId = projectId.replace(/^0x/i, '');
  //const cleanFileId = fileId.replace(/^0x/i, '');

  const normalizedContent = String(content ?? "").replace(/\r\n/g, "\n");

  const contentHash = crypto
    .createHash('sha256')
    .update(normalizedContent, 'utf8')
    .digest();

  await db.query(
    `
    UPDATE entry
    SET current_content = ?,
        content_hash = ?
    WHERE id = UUID_TO_BIN(?)
      AND project_id = UUID_TO_BIN(?)
      AND is_folder = 0
    `,
    [normalizedContent, contentHash, fileId, projectId]
  );
};

exports.getProjectEntries = async (projectId) => {
  if (isTestMode()) {
    return testFixture.getProjectEntries(projectId);
  }

  const cleanProjectId = projectId.replace(/^0x/i, '');

  const [rows] = await db.query(
    `
    SELECT
      BIN_TO_UUID(id) AS id,
      BIN_TO_UUID(project_id) AS project_id,
      BIN_TO_UUID(parent_id) AS parent_id,
      is_folder,
      title,
      current_content,
      content_hash,
      asset_url
    FROM entry
    WHERE project_id = UUID_TO_BIN(?)
    ORDER BY is_folder DESC, title ASC
    `,
    [projectId]
  );

  return rows;
};
