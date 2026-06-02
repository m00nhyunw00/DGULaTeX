# Front-End (React + Vite)

DGULaTeX의 사용자 화면을 담당하는 프론트엔드입니다.  
대시보드, 로그인, 에디터, PDF 미리보기, 히스토리, 멤버 관리, AI 채팅 UI를 제공하며 백엔드 API와 Yjs WebSocket 서버를 함께 사용합니다.

이 문서는 프론트엔드 담당자가 화면 구조, 데이터 흐름, 주요 UX 의사결정을 빠르게 이어받기 위한 기술 이양 문서입니다.

## 기술 스택

- React
- Vite
- React Router
- Bootstrap
- Monaco Editor
- PDF.js
- Yjs / y-monaco / y-websocket
- Socket.IO Client

## 폴더 구조 및 역할

| 폴더명 | 역할 | 설명 |
| :--- | :---: | :--- |
| src/api/ | Protocol | 백엔드 API 엔드포인트별 fetch 요청 함수 |
| src/services/ | Service | API 응답을 UI에서 쓰기 좋은 형태로 정리하는 데이터 중계 계층 |
| src/hooks/ | Controller | 화면별 상태 관리와 비즈니스 로직 Custom Hook |
| src/pages/ | View Layout | 라우트 단위 페이지 조립 |
| src/components/ | View UI | 재사용 UI 컴포넌트와 화면 Section |
| src/socket/ | Realtime | Socket.IO 이벤트 상수 및 클라이언트 설정 |
| src/utils/ | Utility | 파일 트리 변환, asset URL, 사용자 색상 등 공통 유틸 |
| src/assets/, public/ | Static | 이미지, favicon, 로고 등 정적 자원 |

## 주요 화면

| 화면 | 주요 파일 | 설명 |
| :--- | :--- | :--- |
| 로그인 | pages/LoginPage.jsx, hooks/useLogin.js | 로그인, 회원가입, 비밀번호 변경, 탈퇴 관련 인증 흐름 |
| 대시보드 | pages/DashboardPage.jsx, hooks/useDashboard.js | 프로젝트 목록, 생성, 수정, 삭제, 다운로드 |
| 에디터 | pages/EditorPage.jsx, hooks/useEditor.js | 파일 트리, Monaco Editor, PDF Preview, AI Chat, 멤버 관리 통합 |
| 히스토리 | pages/HistoryPage.jsx, hooks/useHistory.js | 버전 목록, 파일 내용 조회, 롤백 |

## 데이터 흐름

프론트엔드는 UI와 비즈니스 로직을 분리하기 위해 아래 흐름을 따릅니다.

~~~text
Component -> Page -> Hook -> Service -> API -> BackEnd
~~~

예시:

~~~text
EditorUI -> useEditor -> EditorService -> src/api/editor/* -> BackEnd API
~~~

- Component는 렌더링과 사용자 이벤트 수집에 집중합니다.
- Hook은 상태, 비동기 흐름, 저장/컴파일/복구 등 복합 로직을 담당합니다.
- Service는 API 응답을 UI 친화적 형태로 정리합니다.
- API 파일은 fetch 요청과 엔드포인트 조립만 담당합니다.

## 에디터 주요 기능

- Monaco Editor 기반 LaTeX 편집
- Yjs + y-monaco 기반 실시간 공동 편집
- 사용자별 원격 커서 색상 표시
- 파일/폴더 생성, 이름 변경, 이동, 삭제, 업로드, 다운로드
- 메인 문서 지정 및 메인 문서 삭제 메뉴 숨김
- 다중 선택에 메인 문서가 포함되면 삭제 메뉴 숨김
- 마지막 편집 파일과 커서 위치 DB 저장 및 재입장 시 복원
- 저장된 마지막 파일이 삭제된 경우 메인 문서 1행 1열로 fallback
- 이미지/PDF 파일 전용 뷰어
- PDF 파일 텍스트 선택/복사 지원
- 자동 저장 및 자동 컴파일 연동
- Ctrl/Cmd+S로 수동 컴파일 실행

## PDF Preview

- 컴파일 결과 PDF와 업로드된 PDF 파일을 PDF.js로 렌더링
- Text Layer를 활성화하여 PDF 텍스트 드래그/복사 지원
- 확대/축소는 CSS scale 기반으로 처리하여 불필요한 재렌더링 최소화
- PDF가 새로 생성되거나 최초 렌더링될 때만 갱신 오버레이 표시
- 컴파일 로그는 상태별 카드 UI로 표시
- 성공/실패 시간, Engine, Passes, Pass별 로그 정보를 함께 표시

## 컴파일 UI

에디터 우측 Preview 섹션 상단에서 다음 기능을 제공합니다.

- Compile 버튼
- Auto compile 토글
- 컴파일러 선택: pdflatex, xelatex, lualatex
- PDF 다운로드
- 확대/축소
- 컴파일 로그 보기
- PDF로 돌아가기

컴파일 요청은 CompilerService를 통해 BackEnd /api/compile 계열 API로 전달됩니다.

## 협업 및 권한 UI

- 초대 코드 생성
- 초대 코드로 참여 요청
- 참여 요청 승인/거절
- 멤버 목록 조회
- 멤버 권한 변경
- 멤버 제거
- 프로젝트 소유권 이전
- viewer 권한은 편집/저장/구조 변경 제한

## AI Chat UI

- src/hooks/useChatAi.js와 src/services/ChatAiService.js를 통해 /api/chat 호출
- 현재 편집 파일, 프로젝트 문맥, 컴파일 로그, UI 질문 여부에 따라 백엔드에서 필요한 페르소나 컨텍스트를 선택적으로 구성
- LaTeX 문법, 프로젝트 사용법, 컴파일 문제 해결 보조에 사용
- 사용자가 보는 화면 기준으로 안내하며 내부 API/DB 구조 설명은 일반 사용자 질문 답변에 노출하지 않음

## 보안 관련 프론트엔드 기준

- 로그인/회원가입/비밀번호 변경/탈퇴 실패 시 서버 응답 상세를 브라우저 콘솔에 출력하지 않습니다.
- 사용자 학번, UUID, 세션 토큰, 프로젝트 ID, Yjs payload, API payload를 `console.log`/`console.warn`/`console.error`에 함께 남기지 않습니다.
- 세션 토큰은 `src/api/auth.js`의 공통 인증 헤더 유틸을 통해 API 요청에만 사용합니다.
- 개발 중 디버깅 로그가 필요하면 고정된 상태 태그만 남기고, 실제 사용자/프로젝트 데이터는 포함하지 않습니다.
- 로그인 화면은 일반 인증 흐름만 사용하며, 별도 우회 로그인 화면은 제공하지 않습니다.

## 환경 변수

FrontEnd/.env는 FrontEnd/.env.example을 기준으로 생성합니다.

~~~env
VITE_API_URL=http://localhost:5000
VITE_YJS_URL=ws://localhost:1234
~~~

SSH Remote 환경에서는 브라우저 기준 localhost가 로컬 PC이므로, VS Code 포트 포워딩에서 5173, 5000, 1234가 모두 열려 있어야 합니다.

## 실행 방법

~~~bash
cd FrontEnd
npm install
npm run dev
~~~

루트에서 전체 서비스를 함께 실행할 수도 있습니다.

~~~bash
npm run dev
~~~

이전 개발 서버가 남아 화면이 계속 로딩되거나 포트 충돌이 발생하면 루트에서 다음 명령을 사용합니다.

~~~bash
npm run dev:fresh
~~~

개발 서버 종료만 필요하면 다음 명령을 사용합니다.

~~~bash
npm run stop:dev
~~~

## 빌드 및 검사

~~~bash
npm run build
npm run lint
~~~

Vite 빌드 결과물은 FrontEnd/dist/에 생성되며 GitHub에는 업로드하지 않습니다.

## 프론트엔드 인수인계 체크리스트

- VITE_API_URL이 실제 백엔드 포트와 일치하는지 확인
- VITE_YJS_URL이 y-websocket 서버 포트와 일치하는지 확인. 누락되면 Yjs 협업 연결을 시작하지 않습니다.
- 루트 통합 실행에서 EADDRINUSE 또는 로딩 고착이 발생하면 npm run dev:fresh로 이전 개발 프로세스 정리
- EditorPage에서 useEditor의 반환값이 EditorUI props로 모두 전달되는지 확인
- PreviewUI 변경 시 PDF.js canvas layer와 textLayer가 함께 유지되는지 확인
- 이미지/PDF를 열었을 때 Monaco Editor 대신 전용 뷰어가 표시되는지 확인
- 파일 트리 변경 시 mainFileId 삭제 방지 로직이 깨지지 않는지 확인
- viewer 권한에서 편집/저장/구조 변경이 막히는지 확인
- 히스토리 롤백 후 Yjs와 DB 내용 동기화가 맞는지 확인

## 포트폴리오 관점의 구현 포인트

- 복잡한 에디터 화면을 FileTree, MonacoEditor, Preview, AIChat, MemberModal 등 Section 단위로 분해
- API, Service, Hook, Component 계층을 분리해 유지보수 가능한 화면 구조 설계
- PDF.js textLayer와 CSS scale을 조합해 PDF 복사 가능성과 빠른 확대/축소 UX 개선
- last_edit_session을 활용해 사용자별 마지막 편집 위치 복원 경험 구현
- Yjs 기반 실시간 협업과 권한 기반 readOnly UI를 함께 처리

## 개발 주의사항

- UI 컴포넌트는 가능한 한 props 기반으로 유지하고, API 호출은 hooks/services/api 계층에 둡니다.
- .env는 GitHub에 올리지 않습니다.
- VITE_API_URL을 변경한 뒤에는 프론트 dev 서버를 재시작해야 합니다.
- 마지막 편집 세션 저장은 백엔드 `PUT /entries/session` 요청에 의존하므로, CORS 설정에 PUT이 빠지면 재입장 복원이 동작하지 않습니다.
- VITE_YJS_URL을 변경한 뒤에도 프론트 dev 서버를 재시작해야 합니다.
- 백엔드 포트가 5001/5002로 우회되면 FrontEnd/.env 또는 npm run dev:5001 스크립트를 맞춰 사용합니다.
- Yjs 서버가 꺼져 있으면 편집기는 열려도 실시간 협업 동기화가 되지 않습니다.
- 루트 npm run dev는 5000/1234/5173 포트를 사전 검사하므로 충돌 안내가 나오면 npm run dev:fresh를 사용합니다.
