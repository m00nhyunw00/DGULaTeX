/**
 * =================================================================
 * [TestData] Compiler Test Fixture
 * 설명: 컴파일러 테스트 모드에서 DB와 파일 저장소를 대체하는 메모리 Fixture를 제공함
 * =================================================================
 */
// 컴파일 테스트를 위한 데이터
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const TEST_USER_ID = '0d8f3c7a-2c4e-4f91-9b7a-91f7a6c2e301';
const TEST_PROJECT_ID = '7a1b9e2c-6f42-4d83-a5b8-3c0e9f7d2a14';
const TEST_MAIN_FILE_ID = 'b4e6a1f9-8c31-4e2a-9d75-f0a3c6b8d912';
const TEST_SECTION_FOLDER_ID = '1c92f6a5-30fb-4e9c-bc72-8c379df40a91';
const TEST_SECTION_FILE_ID = '8fd35219-f04e-45e8-bf31-40d3d2c707a6';

const TEST_TEX_PATH = path.join(
  process.cwd(),
  'src',
  'compiler',
  'latexTest',
  'test.tex'
);

let mainCurrentContent = fs.existsSync(TEST_TEX_PATH)
  ? fs.readFileSync(TEST_TEX_PATH, 'utf8')
  : [
      '\\documentclass{article}',
      '\\usepackage{kotex}',
      '\\begin{document}',
      'Compiler test fallback document.',
      '\\end{document}'
    ].join('\n');

let lastPdfUrl = null;

function contentHash(content) {
  return crypto
    .createHash('sha256')
    .update(content || '')
    .digest('hex');
}

function getCompileTargetFile({ projectId, fileId }) {
  
  if (projectId !== TEST_PROJECT_ID || fileId !== TEST_MAIN_FILE_ID) {
    const err = new Error('TEST_MAIN_DOCUMENT_NOT_FOUND');
    err.statusCode = 404;
    throw err;
  }
  

  return {
    id: TEST_MAIN_FILE_ID,
    project_id: TEST_PROJECT_ID,
    parent_id: null,
    is_folder: 0,
    title: 'main.tex',
    current_content: mainCurrentContent,
    content_hash: contentHash(mainCurrentContent)
  };
}

function updateCurrentContent({ projectId, fileId, content }) {
  if (projectId === TEST_PROJECT_ID && fileId === TEST_MAIN_FILE_ID) {
    mainCurrentContent = content || '';
  }

  return {
    affectedRows: 1
  };
}

function getProjectEntries(projectId) {
  if (projectId !== TEST_PROJECT_ID) {
    return [];
  }

  return [
    {
      id: TEST_SECTION_FOLDER_ID,
      project_id: TEST_PROJECT_ID,
      parent_id: null,
      is_folder: 1,
      title: 'sections',
      current_content: null,
      content_hash: null
    },
    {
      id: TEST_SECTION_FILE_ID,
      project_id: TEST_PROJECT_ID,
      parent_id: TEST_SECTION_FOLDER_ID,
      is_folder: 0,
      title: 'sec_01.tex',
      current_content: 'This text came from sections/sec_01.tex.',
      content_hash: contentHash('This text came from sections/sec_01.tex.')
    },
    {
      id: TEST_MAIN_FILE_ID,
      project_id: TEST_PROJECT_ID,
      parent_id: null,
      is_folder: 0,
      title: 'main.tex',
      current_content: mainCurrentContent,
      content_hash: contentHash(mainCurrentContent)
    }
  ];
}

function updateLastPdfUrl({ pdfUrl }) {
  lastPdfUrl = pdfUrl;

  return new Date();
}

function getLastPdfUrl() {
  return lastPdfUrl;
}

module.exports = {
  TEST_USER_ID,
  TEST_PROJECT_ID,
  TEST_MAIN_FILE_ID,
  getCompileTargetFile,
  updateCurrentContent,
  getProjectEntries,
  updateLastPdfUrl,
  getLastPdfUrl
};