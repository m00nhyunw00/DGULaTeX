/**
 * =================================================================
 * [Utility] Compiler Path Safety Helper
 * 설명: 컴파일 작업 중 파일 경로 정규화와 프로젝트 루트 이탈 방지를 처리함
 * =================================================================
 */
function safeFileName(name) {
  const value = String(name || 'untitled')
    .replace(/[\/\\]/g, '_')
    .replace(/\0/g, '')
    .trim();

  if (value === '' || value === '.' || value === '..') {
    return 'untitled';
  }

  return value.replace(/\.\./g, '__');
}

module.exports = {
  safeFileName
};