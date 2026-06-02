# DguLaTeX

DguLaTeX는 동국대학교 학생을 위한 웹 기반 LaTeX 편집 및 실시간 협업 플랫폼입니다.  
브라우저에서 프로젝트 생성, 파일 트리 관리, Monaco Editor 기반 LaTeX 편집, Yjs 기반 공동 편집, Docker 기반 PDF 컴파일, 히스토리 롤백, AI 보조 기능까지 하나의 작업 흐름으로 제공합니다.

이 문서는 프로젝트 소개서이자 기술 이양 문서입니다. 처음 프로젝트를 넘겨받는 사람은 이 README를 통해 실행 환경과 전체 구조를 파악하고, 포트폴리오 검토자는 어떤 문제를 어떤 기술로 해결했는지 빠르게 확인할 수 있습니다.

## Team

**2026-1-종설1-8조**

| 구분 | 이름 | 전공 | 역할 | 깃허브 아이디 |
| :--- | :--- | :--- | :--- | :--- |
| 팀장 | 문현우 | 컴퓨터·AI학부 | 풀스택 개발 | m00nhyunw00 |
| 팀원 | 정서영 | 컴퓨터·AI학부 | 백엔드 개발 및 DB 설계 | standupnow |
| 팀원 | 오재원 | 멀티미디어공학과 | 협업 환경 및 컴파일러 개발 | K1N01 |

## 프로젝트 개요

- 강의명: 2026-1 종합설계프로젝트1
- 기간: 2026.03.06 ~ 2026.06.19
- 목표: Overleaf와 유사한 온라인 LaTeX 편집 경험을 동국대학교 프로젝트 환경에 맞게 구현
- 핵심 가치: 설치 부담 없는 문서 작성, 공동 편집, 컴파일 결과 확인, 버전 복구, AI 도움말 제공

## Portfolio Summary

DguLaTeX는 단순 CRUD 웹앱이 아니라 편집기, 실시간 동기화, 파일 시스템, PDF 컴파일, 권한 관리, 히스토리, AI 보조가 결합된 통합 협업 도구입니다.

| 관점 | 구현 내용 |
| :--- | :--- |
| 제품 경험 | 대시보드 -> 프로젝트 -> 파일 편집 -> 컴파일 -> PDF 확인 -> 히스토리 복구까지 이어지는 작업 흐름 구현 |
| 실시간 협업 | Yjs, y-monaco, y-websocket으로 공동 편집과 원격 커서 표시 구현 |
| 컴파일 시스템 | Docker 기반 TeX Live 컴파일 파이프라인과 pdflatex/xelatex/lualatex 선택 지원 |
| 데이터 설계 | MySQL 기반 프로젝트, 파일 트리, 권한, 히스토리, 마지막 편집 세션 저장 구조 설계 |
| UX 개선 | PDF 텍스트 선택/복사, 즉시 확대/축소, 카드형 컴파일 로그, 마지막 커서 위치 복원 |
| 운영 편의 | 루트 npm run dev로 프론트엔드, 백엔드, Yjs 서버 동시 실행, dev:fresh/stop:dev로 포트 충돌 정리 |
| AI 활용 | 질문 유형에 따라 필요한 페르소나만 조립하는 토큰 절약형 OpenAI 연동 |

## 주요 기능

| 영역 | 기능 |
| :--- | :--- |
| 인증 | 회원가입, 로그인, 세션 유지, 로그아웃, 비밀번호 변경, 회원 탈퇴 |
| 프로젝트 | 프로젝트 생성/조회/이름 변경/삭제, 프로젝트 ZIP 다운로드 |
| 파일 트리 | 파일/폴더 생성, 이름 변경, 이동, 삭제, 업로드, 다운로드, 메인 문서 지정 |
| 편집기 | Monaco Editor 기반 LaTeX 편집, 툴바 스니펫, 자동 저장, 마지막 편집 파일과 커서 위치 복원 |
| 협업 | Yjs + y-websocket 기반 실시간 공동 편집, 사용자별 원격 커서 표시 |
| 권한 | 프로젝트 초대 코드, 참여 요청 승인/거절, 멤버 권한 변경, 소유권 이전 |
| 컴파일 | Docker 기반 LaTeX 컴파일, 수동/자동 컴파일, pdflatex/xelatex/lualatex 선택, 2-pass 컴파일 |
| PDF 미리보기 | PDF.js 기반 미리보기, 텍스트 선택/복사, CSS scale 기반 확대/축소 |
| 컴파일 로그 | 성공/실패 시간 표시, Engine/Passes 요약, Pass/Result/Warning/Error 카드 UI |
| 히스토리 | 코드/구조 변경 히스토리 저장, 파일 단위/프로젝트 단위 롤백 |
| AI 도우미 | OpenAI API 기반 LaTeX/프로젝트 보조, 질문 유형별 페르소나 컨텍스트 선택 적용 |

## 보안 및 운영 기준

- 로그인은 일반 사용자 인증 흐름만 유지하며, 개발 중 사용하던 우회 로그인 기능은 제거했습니다.
- 세션 토큰은 프론트엔드에서 API 요청 시 Authorization 헤더로 전달하고, 백엔드는 sessionStore에서 토큰 유효성을 검증합니다.
- CORS 허용 출처는 `CORS_ORIGIN` 환경 변수로 제한합니다. 개발 기본값은 `http://localhost:5173`입니다.
- `VITE_API_URL`, `VITE_YJS_URL`, DB 접속 정보, OpenAI Key, Yjs 포트는 `.env.example` 기준으로 환경 변수화했습니다.
- 브라우저 콘솔에는 로그인 실패 상세, 학번, UUID, 프로젝트 ID, API payload, 세션 관련 값이 직접 출력되지 않도록 정리했습니다.
- 백엔드 로그도 에러 객체 전체나 내부 파일 경로를 그대로 출력하지 않고, 운영 확인에 필요한 고정 태그와 최소 메시지 중심으로 남깁니다.
- 실제 `.env`, 업로드 파일, 컴파일 PDF, 런타임 로그는 GitHub에 올리지 않습니다.

## 기술 스택

**Front-End**

- React
- Vite
- React Router
- Bootstrap
- Monaco Editor
- PDF.js
- Yjs / y-monaco / y-websocket
- Socket.IO Client

**Back-End**

- Node.js
- Express
- MySQL / mysql2
- Socket.IO
- Docker 기반 TeX Live 컴파일
- OpenAI API
- y-websocket
- bcrypt, multer, archiver

## 아키텍처 개요

~~~text
Browser
  +- React + Vite FrontEnd
  |  +- Dashboard / Login / Editor / History UI
  |  +- Monaco Editor + PDF.js Preview
  |  +- API Service Layer
  |
  +- y-websocket :1234
  |  +- Yjs shared document synchronization
  |
  +- Express BackEnd :5000
     +- Auth / Project / Entry / Member / History / Chat API
     +- MySQL persistence
     +- Socket.IO collaboration events
     +- Docker LaTeX compile pipeline
     +- public/compiled, public/uploads runtime files
~~~

## 프로젝트 구조

| 경로 | 설명 |
| :--- | :--- |
| FrontEnd/ | React + Vite 클라이언트 |
| BackEnd/ | Express API 서버, 컴파일러, Socket.IO, Yjs 서버 스크립트 |
| scripts/dev-all.js | 루트에서 프론트/백엔드/Yjs를 한 번에 실행하고 필수 포트 충돌을 사전 검사하는 개발 스크립트 |
| scripts/stop-dev.js | 1234/5000/5173 등 개발 포트를 점유한 이전 DguLaTeX 프로세스 정리 스크립트 |
| schema.sql | MySQL 테이블 생성 스키마 |
| database.md | DB 설계 및 테이블 설명 문서 |
| package.json | 루트 통합 실행 스크립트 |

## 빠른 실행

### 1. 의존성 설치

~~~bash
npm --prefix FrontEnd install
npm --prefix BackEnd install
~~~

### 2. 환경 변수 준비

FrontEnd/.env는 FrontEnd/.env.example을 참고합니다.

~~~env
VITE_API_URL=http://localhost:5000
VITE_YJS_URL=ws://localhost:1234
~~~

BackEnd/.env는 BackEnd/.env.example을 참고합니다.

~~~env
PORT=5000
SESSION_TTL_MS=3600000
CORS_ORIGIN=http://localhost:5173
YJS_HOST=localhost
YJS_PORT=1234
OPENAI_API_KEY=your_openai_api_key
AUTH_MODE=DB
LDAP_URL=ldap://a.mme.dongguk.edu
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

실제 .env 파일은 GitHub에 업로드하지 않습니다.

### 3. DB 준비

~~~bash
mysql -u [user] -p < schema.sql
~~~

DB 구조 설명은 database.md를 참고하세요.

### 4. 개발 서버 실행

루트에서 한 번에 실행:

~~~bash
npm run dev
~~~

이전 실행이 완전히 종료되지 않아 5000, 1234, 5173 포트가 남아 있으면 아래 명령으로 정리 후 재실행합니다.

~~~bash
npm run dev:fresh
~~~

정리만 수행할 때는 다음 명령을 사용합니다.

~~~bash
npm run stop:dev
~~~

개별 실행:

~~~bash
npm --prefix BackEnd start
npm --prefix BackEnd run yws
npm --prefix FrontEnd run dev
~~~

기본 포트:

| 서비스 | 기본 주소 |
| :--- | :--- |
| FrontEnd | http://localhost:5173 |
| BackEnd API | http://localhost:5000 |
| Yjs WebSocket | ws://localhost:1234 |

SSH Remote 또는 GPU 서버 환경에서는 VS Code Ports 탭에서 5173, 5000, 1234 포트가 모두 포워딩되어야 합니다. 포트가 이미 사용 중이면 npm run dev는 새 서버를 띄우지 않고 dev:fresh/stop:dev 안내를 출력합니다.

## 컴파일 환경

LaTeX 컴파일은 BackEnd/src/compiler/services/dockerCompileService.js에서 Docker 컨테이너를 통해 수행합니다.

지원 엔진:

- pdflatex
- xelatex
- lualatex

주요 특징:

- 메인 문서 기준 컴파일
- 한글/폰트 요구에 따라 컴파일러 선택 가능
- 2-pass 컴파일로 참조/목차/라벨 갱신 안정화
- 컴파일 성공/실패 시간 기록
- 컴파일 로그 카드 UI를 위한 구조화 로그 생성

컴파일 Docker 이미지가 없는 경우 BackEnd/src/compiler/docker/Dockerfile을 기준으로 이미지를 빌드해야 합니다. 실제 이미지명과 빌드 명령은 dockerCompileService.js의 설정과 맞춰 확인하세요.

## 인수인계 체크리스트

- FrontEnd/.env와 BackEnd/.env를 .env.example 기준으로 생성했는지 확인
- MySQL DB 생성 후 schema.sql 적용 여부 확인
- BackEnd/src/models/db.js가 환경 변수를 정상적으로 읽는지 확인
- Docker daemon과 LaTeX 컴파일 이미지 준비 여부 확인
- npm run dev 실행 시 backend, yws, frontend 세 프로세스가 모두 뜨는지 확인
- EADDRINUSE 또는 로딩 고착이 발생하면 npm run dev:fresh로 이전 개발 프로세스 정리 후 재실행
- SSH Remote 환경이면 5173, 5000, 1234 포트 포워딩 확인
- public/uploads, public/compiled, runtime은 런타임 산출물이므로 운영 서버에서만 관리
- OpenAI 기능을 사용할 경우 OPENAI_API_KEY 설정 확인

## GitHub 업로드 전 확인

- node_modules/는 업로드하지 않습니다.
- .env 파일은 업로드하지 않습니다.
- BackEnd/runtime/, BackEnd/public/compiled/, BackEnd/public/uploads/는 런타임 산출물이므로 업로드하지 않습니다.
- 테스트용 PDF, LaTeX 산출물, 로그 파일은 필요할 때만 별도 샘플로 정리합니다.
- package-lock.json은 재현 가능한 설치를 위해 유지하는 것을 권장합니다.
- 개발자 도구 콘솔 또는 서버 로그에 학번, 비밀번호, 세션 토큰, UUID, 프로젝트 내부 ID, 절대 경로가 찍히는 새 로그를 추가하지 않습니다.

## 문제 해결

### npm run dev 실행 시 EADDRINUSE가 발생하는 경우

이전 실행에서 backend, y-websocket, Vite 프로세스가 남아 있으면 5000, 1234, 5173 포트 충돌이 발생할 수 있습니다. 루트에서 다음 명령을 실행합니다.

~~~bash
npm run dev:fresh
~~~

이미 떠 있는 개발 서버를 종료만 하고 싶다면 다음 명령을 사용합니다.

~~~bash
npm run stop:dev
~~~

## 현재 한계 및 개선 후보

- DB 접속 설정은 환경 변수 기반으로 정리했지만, 배포 환경에서는 별도 secret manager 사용을 권장합니다.
- sessionStore는 메모리 기반이므로 서버 재시작 시 세션이 초기화됩니다. 운영 배포 시 Redis 등 외부 세션 저장소 도입을 고려할 수 있습니다.
- public/uploads와 public/compiled는 로컬 디스크 기반입니다. 운영 환경에서는 S3 호환 스토리지로 분리할 수 있습니다.
- Docker 컴파일 이미지는 서버 환경에 따라 사전 빌드/배포 전략을 정해야 합니다.
