/**
 * =================================================================
 * [Model] Init Data Access
 * 설명: MySQL 테이블 조회와 변경 쿼리를 캡슐화하여 상위 계층에 제공함
 * =================================================================
 */
const mysql = require('mysql2/promise');
const fs = require('fs/promises');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

async function initialize() {
  let connection;
  try {
    console.log("서버 내 물리적 파일(이미지, PDF) 초기화 중...");
    
    // 업로드된 이미지 및 에셋 폴더 삭제
    const uploadDir = path.join(process.cwd(), 'public', 'uploads');
    await fs.rm(uploadDir, { recursive: true, force: true });

    // 컴파일된 PDF 결과물 폴더 삭제
    const compiledDir = path.join(process.cwd(), 'public', 'compiled');
    await fs.rm(compiledDir, { recursive: true, force: true });

    console.log("물리 파일 삭제 완료.");

    // DB 서버 연결 설정(mysql-client 설치 후 연결 필요--설치 완료)
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD || '',
    });

    console.log("DB 서버 접속 중...");

    if (!process.env.DB_USER || !process.env.DB_NAME) {
      throw new Error('DB_USER and DB_NAME must be set in BackEnd/.env before initialization.');
    }
    // 2. 데이터베이스 생성 (이미 존재하면 무시)
    const databaseName = mysql.escapeId(process.env.DB_NAME);
    await connection.query(`CREATE DATABASE IF NOT EXISTS ${databaseName} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await connection.query(`USE ${databaseName}`);

    //일단 기존 방식대로 구현, 추후 동국대 서버에서 넘어오는 정보에 따라 수정 필요
    //
    await connection.query(`
      CREATE TABLE IF NOT EXISTS users (
        id BINARY(16) PRIMARY KEY,
        student_id VARCHAR(50) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        user_name VARCHAR(50)
      ) ENGINE=InnoDB
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS projects (
        id BINARY(16) PRIMARY KEY,    
        title VARCHAR(255) NOT NULL,
        owner_id BINARY(16),
        main_file_id BINARY(16),
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS entry (
        id BINARY(16) PRIMARY KEY,    
        project_id BINARY(16),
        parent_id BINARY(16),
        is_folder TINYINT,
        title VARCHAR(255),
        current_content LONGTEXT,
        content_hash BINARY(32),
        asset_url VARCHAR(1024),
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY (parent_id) REFERENCES entry(id) ON DELETE CASCADE
      ) ENGINE=InnoDB
    `);
    
    try {
      await connection.query(`ALTER TABLE projects DROP FOREIGN KEY fk_main_file`);
    } catch (err) {
      // 제약 조건이 없는 경우 무시
    }

    // projects 테이블의 main_file_id 외래 키 설정 (순환 참조 방지)
    await connection.query(`
      ALTER TABLE projects 
        ADD CONSTRAINT fk_main_file
        FOREIGN KEY (main_file_id) REFERENCES entry(id) ON DELETE SET NULL
    `);
    
    await connection.query(`
        CREATE TABLE IF NOT EXISTS history_contents (
          content_id BINARY(32) PRIMARY KEY,
          content LONGTEXT
        ) ENGINE=InnoDB
    `);

    await connection.query(`
        CREATE TABLE IF NOT EXISTS history (
          version_id BINARY(16) PRIMARY KEY,
          restore_from_ver BINARY(16) DEFAULT NULL,
	        restore_file_name VARCHAR(255) DEFAULT NULL,
          action_type VARCHAR(20) DEFAULT NULL,
          created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
          project_id BINARY(16),
          main_file_id BINARY(16) DEFAULT NULL,
          user_id BINARY(16) DEFAULT NULL,
          FOREIGN KEY (restore_from_ver) REFERENCES history(version_id) ON DELETE CASCADE,
          FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
        ) ENGINE=InnoDB
    `);

    await connection.query(`
        CREATE TABLE IF NOT EXISTS history_structure (
          version_id BINARY(16),
          entry_id BINARY(16),          
          entry_name VARCHAR(255),
          parent_id BINARY(16),
          is_folder TINYINT(1),
          content_id BINARY(32),
          PRIMARY KEY (version_id, entry_id),
          FOREIGN KEY (version_id) REFERENCES history(version_id) ON DELETE CASCADE,
          FOREIGN KEY (content_id) REFERENCES history_contents(content_id) ON DELETE CASCADE 
        ) ENGINE=InnoDB
    `);

    await connection.query(`
        CREATE TABLE IF NOT EXISTS history_contributor (
          history_id BINARY(16),
          user_id BINARY(16),
          entry_id BINARY(16),
          edited_at TIMESTAMP(3),
          PRIMARY KEY (history_id, user_id, entry_id),
          FOREIGN KEY (history_id) REFERENCES history(version_id) ON DELETE CASCADE,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          FOREIGN KEY (entry_id) REFERENCES entry(id) ON DELETE CASCADE
        ) ENGINE=InnoDB
    `);

    await connection.query(`
        CREATE TABLE IF NOT EXISTS invite_code (
          invite_code char(6) NOT NULL UNIQUE,
          project_id BINARY(16) NOT NULL, 
          role ENUM('owner', 'editor', 'viewer') NOT NULL,
          PRIMARY KEY (project_id, role),
          FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
        ) ENGINE=InnoDB
    `); 

    await connection.query(`
        CREATE TABLE IF NOT EXISTS project_member (
          project_id BINARY(16),
          user_id BINARY(16), 
          role ENUM('owner', 'editor', 'viewer') NOT NULL,
          status VARCHAR(50),                         
          last_seen_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP, 
          current_file_id BINARY(16),
          PRIMARY KEY (project_id, user_id),
          FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          FOREIGN KEY (current_file_id) REFERENCES entry(id) ON DELETE CASCADE
        ) ENGINE=InnoDB
    `);

    await connection.query(`
        CREATE TABLE IF NOT EXISTS last_edit_session (
          session_id BINARY(16) PRIMARY KEY,
          project_id BINARY(16) NOT NULL, 
          user_id BINARY(16) NOT NULL, 
          file_id BINARY(16) DEFAULT NULL,
          cursor_line INT DEFAULT 0,
          cursor_column INT DEFAULT 0,
          last_pdf_url VARCHAR(512),
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE(project_id, user_id),
          FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          FOREIGN KEY (file_id) REFERENCES entry(id) ON DELETE CASCADE
    ) ENGINE=InnoDB
    `);

    await connection.query(`
        CREATE TABLE IF NOT EXISTS join_request (
          request_id BINARY(16) PRIMARY KEY,
          project_id BINARY(16) DEFAULT NULL, 
          user_id BINARY(16) DEFAULT NULL, 
          request_role ENUM('owner', 'editor', 'viewer') NOT NULL, 
          status ENUM('PENDING', 'ACCEPTED', 'REJECTED') DEFAULT 'PENDING',
          created_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB
    `);
    
    console.log("DB 생성 성공");

  } catch (err) {
    console.error("에러 발생:", err.message);
  } finally {
    if (connection) await connection.end();
  }
}

initialize();