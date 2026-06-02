/**
 * =================================================================
 * [Utility] Compiler API Error Helper
 * 설명: 컴파일러 API에서 사용하는 표준 에러 객체와 상태 코드를 생성함
 * =================================================================
 */
class ApiError extends Error {
  constructor(statusCode, message, detail = '') {
    super(message);

    this.statusCode = statusCode;
    this.message = message;
    this.detail = detail;
  }
}

module.exports = ApiError;