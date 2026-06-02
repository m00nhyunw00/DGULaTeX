# Back-End (Node.js Express)

DGULaTeX의 API 서버, DB 접근, 파일 시스템 관리, LaTeX 컴파일, 실시간 협업 서버 연동을 담당하는 백엔드입니다.

이 문서는 백엔드 담당자가 API 구조, DB 연결, 컴파일 파이프라인, 운영 환경을 빠르게 이어받기 위한 기술 이양 문서입니다.

## 기술 스택

- Node.js
- Express
- MySQL / mysql2
- Socket.IO
- y-websocket / Yjs
- Docker 기반 TeX Live 컴파일
- OpenAI API
- bcrypt
- multer
- archiver

## 폴더 구조 및 MVC 역할

| 폴더명 | 역할 | 설명 |
| :--- | :---: | :--- |
| src/server.js | Entry | Express 서버 시작점, 라우터 등록, Socket.IO 설정, 정적 파일 서빙 |
| src/routes/ | Route | API 엔드포인트 정의 및 Controller 연결 |
| src/controllers/ | Controller | 요청 검증, 응답 생성, 서비스/모델 호출 |
| src/models/ | Model | MySQL 쿼리, DB 접근, 초기 스키마 생성 보조 |
| src/logics/ | Logic | 인증/엔트리/프로젝트/AI 등 도메인 유틸과 비즈니스 로직 |
| src/services/ | Service | 세션 저장소 등 서버 내부 서비스 |
| src/compiler/ | Compiler | LaTeX 컴파일 워크스페이스, Docker 실행, 결과 저장 |
| public/compiled/ | Runtime Output | 컴파일된 PDF 산출물 저장 위치 |
| public/uploads/ | Runtime Upload | 업로드한 이미지/바이너리 에셋 저장 위치 |
| runtime/ | Runtime Temp | 자동 컴파일 및 임시 작업 디렉토리 |

## 주요 API 그룹

| Prefix | 설명 |
| :--- | :--- |
| /api/auth | 로그인, 회원가입, 세션 확인, 로그아웃, 비밀번호 변경, 회원 탈퇴 |
| /api/projects | 프로젝트 생성/조회/수정/삭제, 메인 문서 지정, ZIP 다운로드, 초대 코드 |
| /api/projects/:projectId/entries | 파일/폴더 CRUD, 이동, 업로드, 다운로드, 본문 저장/조회, 편집 세션 저장 |
| /api/compile | 수동/자동 컴파일, 최신 PDF 조회, PDF 다운로드 |
| /api/members | 멤버 조회, 권한 변경, 제거, 소유권 이전, 참여 요청 처리 |
| /api/histories | 히스토리 저장/조회, 파일/프로젝트 롤백, 버전 ZIP 다운로드 |
| /api/chat | OpenAI 기반 AI 채팅 응답 생성 |

## 실행 방법

~~~bash
cd BackEnd
npm install
npm start
~~~

Yjs WebSocket 서버:

~~~bash
npm run yws
~~~

`npm run yws`는 BackEnd/.env의 `YJS_HOST`, `YJS_PORT` 값을 읽어 실행됩니다.

루트에서 전체 서비스를 함께 실행:

~~~bash
npm run dev
~~~

이전 개발 서버가 남아 포트가 충돌하면 루트에서 다음 명령으로 정리 후 재실행합니다.

~~~bash
npm run dev:fresh
~~~

## 포트

| 서비스 | 기본 포트 | 설명 |
| :--- | :---: | :--- |
| Express API | 5000 | PORT 환경 변수로 변경 가능 |
| y-websocket | 1234 | BackEnd/.env의 YJS_HOST/YJS_PORT 기준으로 실행 |
| Socket.IO | API 서버와 동일 | 프로젝트 협업 이벤트용 |

server.js는 5000 포트가 사용 중이면 다음 포트로 우회를 시도합니다. 이 경우 프론트엔드의 VITE_API_URL도 실제 백엔드 포트에 맞춰야 합니다. 루트 npm run dev는 5000/1234/5173 포트를 사전 검사하며, 충돌 시 npm run dev:fresh 또는 npm run stop:dev 사용을 안내합니다.

## 환경 변수

BackEnd/.env는 BackEnd/.env.example을 기준으로 생성합니다.

~~~env
PORT=5000
SESSION_TTL_MS=3600000
CORS_ORIGIN=http://localhost:5173
YJS_HOST=0.0.0.0
YJS_PORT=1234
OPENAI_API_KEY=your_openai_api_key
AUTH_MODE=DB
LDAP_URL=ldap://your_ldap_host
LDAP_PORT=389
COMPILER_TEST_MODE=false
LATEX_DOCKER_IMAGE=dgu-latex-compiler
UPLOADS_ROOT=public
DB_HOST=localhost
DB_USER=your_mysql_user
DB_PASSWORD=your_mysql_password
DB_NAME=dgu_latex
DB_CONNECTION_LIMIT=10
~~~

DB pool은 src/models/db.js에서 설정하며, DB 접속 정보는 BackEnd/.env에서 읽습니다. 공개 저장소에는 실제 .env를 올리지 말고 BackEnd/.env.example만 공유하세요.

~~~js
host: process.env.DB_HOST || 'localhost'
user: process.env.DB_USER
password: process.env.DB_PASSWORD || ''
database: process.env.DB_NAME
~~~

## DB

- 기본 스키마는 루트 schema.sql을 기준으로 합니다.
- 추가 설명은 루트 database.md를 참고합니다.
- UUID는 MySQL BINARY(16)과 프론트용 hex 문자열을 변환하여 사용합니다.
- entries 계열 테이블은 파일/폴더 트리와 텍스트 파일 본문을 관리합니다.
- project_member 계열 테이블은 owner/editor/viewer 권한과 참여 요청 흐름을 관리합니다.
- history 계열 테이블은 코드 변경과 구조 변경 버전을 저장합니다.
- last_edit_session 테이블은 사용자별 마지막 편집 파일, 커서 위치, 최신 PDF URL을 저장합니다.

## 인증 및 세션

- 현재 활성 로그인은 DB 기반 인증입니다.
- users.student_id로 사용자를 조회하고 bcrypt.compare로 비밀번호를 검증합니다.
- sessionStore는 메모리 기반 세션 토큰을 관리합니다.
- LDAP 관련 authLogic은 남아 있지만 현재 컨트롤러의 활성 로그인 흐름에서는 사용하지 않습니다.
- 개발 중 사용하던 우회 로그인 기능은 제거되어 일반 로그인 API만 사용합니다.

## 보안 및 로그 관리

- `CORS_ORIGIN`으로 허용 프론트엔드 출처를 제한합니다.
- DB 접속 정보, OpenAI API Key, Yjs Host/Port, Docker 이미지명, 업로드 루트는 `.env`에서만 관리합니다.
- 실제 `.env`는 GitHub에 업로드하지 않고, 공유 문서는 `.env.example`만 사용합니다.
- 서버 로그에는 학번, 비밀번호, 세션 토큰, UUID, 프로젝트 내부 ID, 요청 payload, 절대 파일 경로를 직접 출력하지 않습니다.
- 컨트롤러/서비스 에러 로그는 고정 태그와 최소 메시지 중심으로 남기며, 에러 객체 전체를 그대로 출력하지 않습니다.
- 파일 다운로드/업로드 경로 검증 실패 시 내부 서버 경로가 로그나 응답으로 노출되지 않도록 유지합니다.

## 파일/엔트리 저장 방식

- .tex, .bib 등 텍스트 파일은 DB current_content 중심으로 저장합니다.
- 이미지/바이너리 에셋은 public/uploads/projects/... 아래에 저장하고 DB에는 메타데이터와 경로를 저장합니다.
- 파일/폴더 구조는 entries 계열 테이블과 parent_id 관계를 통해 트리로 복원합니다.
- 메인 문서는 projects.main_entry_id로 관리합니다.
- 메인 문서를 삭제하지 못하게 하는 1차 UX 방어는 프론트엔드에서 처리합니다.

## 컴파일러

컴파일은 src/compiler/services/dockerCompileService.js를 통해 Docker에서 수행합니다.

지원 엔진:

- pdflatex
- xelatex
- lualatex

주요 특징:

- 수동 컴파일과 자동 컴파일 분리
- DB 기준 프로젝트 파일 트리를 임시 워크스페이스로 복원
- main 문서 기준 컴파일
- 2-pass 컴파일 지원
- 성공/실패 시간 로그 표시
- [COMPILE ENGINE], [COMPILE PASSES], [COMPILE PASS], [COMPILE TIME] 등 구조화 로그 생성
- 컴파일 결과 PDF를 public/compiled/에 저장
- last_edit_session.last_pdf_url에 최신 PDF 경로 반영

Docker 이미지가 없다면 src/compiler/docker/Dockerfile을 기준으로 TeX Live 이미지 빌드가 필요합니다.

## AI Chat

- src/logics/chatAiLogic.js에서 OpenAI API를 호출합니다.
- OPENAI_API_KEY가 필요합니다.
- 질문 유형에 따라 UI 설명 페르소나, LaTeX 보조 페르소나, 실행 환경 페르소나, 일반 코드 설명 컨텍스트를 선택적으로 구성합니다.
- UI 관련 질문이 아닐 때는 긴 UI 페르소나를 생략하여 토큰 사용량을 줄입니다.
- 현재 활성 파일과 참조 파일 컨텍스트를 함께 전달해 LaTeX 문법/컴파일 문제를 보조합니다.

## 히스토리

- 코드 편집과 파일 구조 변경을 별도 action으로 저장합니다.
- 파일 단위 롤백과 프로젝트 단위 롤백을 지원합니다.
- 롤백 시 Yjs 문서와 DB 내용 불일치를 줄이기 위해 프론트에서 강제 동기화 플래그를 사용합니다.

## 백엔드 인수인계 체크리스트

- BackEnd/.env 생성 및 DB 접속 정보 확인
- schema.sql 적용 여부 확인
- npm start 실행 후 실제 API 포트 확인
- npm run yws 실행 후 1234 포트 확인
- 루트 통합 실행에서 EADDRINUSE가 발생하면 npm run dev:fresh로 이전 프로세스 정리
- Docker daemon과 컴파일 이미지 준비 여부 확인
- public/compiled, public/uploads, runtime 디렉토리 권한 확인
- OPENAI_API_KEY 설정 여부 확인
- CORS_ORIGIN이 실제 프론트엔드 주소와 일치하는지 확인
- 신규 디버깅 로그 추가 시 사용자 식별자, 세션 토큰, payload, 내부 경로가 포함되지 않는지 확인
- SSH Remote 환경이면 5000, 1234 포트 포워딩 확인

## 포트폴리오 관점의 구현 포인트

- Express 라우터를 Auth, Project, Entry, Compile, Member, History, Chat 도메인으로 분리
- MySQL BINARY(16) UUID와 프론트용 hex 문자열 변환 계층 구현
- Docker 격리 환경에서 LaTeX 컴파일을 수행해 서버 안정성 확보
- 텍스트 파일은 DB, 이미지/바이너리는 디스크로 분리 저장하는 하이브리드 파일 관리 구조
- last_edit_session으로 최신 PDF와 사용자 편집 위치를 저장해 에디터 UX 개선
- OpenAI 프롬프트를 질문 유형별로 조립해 불필요한 토큰 사용 감소

## GitHub 업로드 주의사항

업로드하지 말아야 할 항목:

- node_modules/
- .env
- public/compiled/
- public/uploads/
- runtime/
- compiler output/log/pdf/aux 파일
- 개인 테스트 파일, 로컬 HTTP 테스트 결과

package-lock.json은 의존성 재현을 위해 유지하는 것을 권장합니다.

## 문제 해결

### 로그인 요청이 계속 pending인 경우

- 브라우저 Network에서 POST /api/auth/login 상태 확인
- SSH Remote 환경이면 5000 포트가 포워딩되어 있는지 확인
- 백엔드가 5001 등 다른 포트로 우회 실행되지 않았는지 로그 확인
- FrontEnd/.env의 VITE_API_URL과 실제 백엔드 포트 일치 확인

### PDF 컴파일이 실패하는 경우

- Docker daemon 실행 여부 확인
- 컴파일 Docker 이미지 존재 여부 확인
- main_entry_id가 실제 .tex 파일을 가리키는지 확인
- 업로드 이미지 경로가 public/uploads 아래에 존재하는지 확인
- compileLog의 [COMPILE ENGINE], [COMPILE PASS], [COMPILE TIME] 구간 확인

### npm run dev 또는 yws 실행 시 EADDRINUSE가 발생하는 경우

- 루트에서 npm run dev:fresh 실행
- 종료만 필요하면 npm run stop:dev 실행
- SSH Remote 환경에서 이전 터미널 세션이 남아 있지 않은지 확인

### 실시간 협업이 되지 않는 경우

- npm run yws 실행 여부 확인
- VITE_YJS_URL이 ws://localhost:1234인지 확인
- SSH Remote 환경이면 1234 포트 포워딩 확인
