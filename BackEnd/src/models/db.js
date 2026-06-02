/**
 * =================================================================
 * [Model] Database Pool Configuration
 * 설명: 환경 변수 기반 MySQL 커넥션 풀을 생성하고 백엔드 전역 DB 연결을 제공함
 * =================================================================
 */
// 계속해서 DB에 연결해주는 파일
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const mysql = require('mysql2/promise');

const requiredEnv = ['DB_USER', 'DB_NAME'];
const missingEnv = requiredEnv.filter((key) => !process.env[key]);

if (missingEnv.length > 0) {
  throw new Error('Missing required DB environment variables: ' + missingEnv.join(', '));
}

const db = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 10)
});

module.exports = db;
