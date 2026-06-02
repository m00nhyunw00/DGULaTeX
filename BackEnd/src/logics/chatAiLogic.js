/**
 * =================================================================
 * [Logic] AI Chat Prompt & Generation Logic
 * 설명: 질문 유형별 시스템 프롬프트 조립과 OpenAI 응답 생성을 처리함
 * =================================================================
 */
const { OpenAI } = require('openai');

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const MAX_MESSAGE_CHARS = 6000;
const MAX_CONTEXT_FILE_CHARS = 20000;
const MAX_CONTEXT_FILES = 8;
const MAX_COMPILE_LOG_CHARS = 16000;

const clipText = (value = '', max = MAX_MESSAGE_CHARS) => {
    const text = String(value || '');
    if (text.length <= max) return text;
    return `${text.slice(0, max)}\n\n[truncated: ${text.length - max} characters omitted]`;
};

const sanitizeMessages = (messages = []) => {
    if (!Array.isArray(messages)) return [];

    return messages
        .filter((message) => message && ['user', 'assistant'].includes(message.role))
        .map((message) => ({
            role: message.role,
            content: clipText(message.content || '')
        }));
};

const formatFileContext = (file, label) => {
    if (!file) return '';

    const filePath = file.path || file.name || 'unknown.tex';
    const content = clipText(file.content || '', MAX_CONTEXT_FILE_CHARS);

    return `### ${label}: ${filePath}\n\n\`\`\`latex\n${content}\n\`\`\``;
};

const formatCompileLogContext = (compileLog) => {
    const text = clipText(compileLog || "", MAX_COMPILE_LOG_CHARS).trim();
    if (!text) return "";

    return "### 최근 컴파일 로그\n\n```text\n" + text + "\n```";
};

const formatLatexContext = (latexContext) => {
    if (typeof latexContext === 'string') {
        return formatFileContext({ path: '현재 파일', content: latexContext }, '현재 활성 파일');
    }

    if (!latexContext || typeof latexContext !== 'object') {
        return '현재 제공된 LaTeX 파일 컨텍스트가 없습니다.';
    }

    const projectTitle = latexContext.project?.title || '무제 프로젝트';
    const activeFile = formatFileContext(latexContext.activeFile, '현재 활성 파일');
    const relatedFiles = Array.isArray(latexContext.relatedFiles)
        ? latexContext.relatedFiles.slice(0, MAX_CONTEXT_FILES)
        : [];

    const relatedText = relatedFiles
        .map((file, index) => {
            const source = file.importSource ? ` (from \\input/include: ${file.importSource})` : '';
            return formatFileContext(file, `참조 파일 ${index + 1}${source}`);
        })
        .filter(Boolean)
        .join('\n\n');

    const compileLogText = formatCompileLogContext(latexContext.compileLog);

    return [
        `프로젝트: ${projectTitle}`,
        latexContext.referencePolicy ? `컨텍스트 정책: ${latexContext.referencePolicy}` : '',
        activeFile,
        relatedText,
        compileLogText
    ].filter(Boolean).join('\n\n');
};

const getRecentConversationText = (messages = []) => {
    if (!Array.isArray(messages)) return '';
    return messages.slice(-6).map((message) => message?.content || '').join('\n').toLowerCase();
};

const includesAny = (text, keywords = []) => keywords.some((keyword) => text.includes(keyword.toLowerCase()));

const detectPromptNeeds = (messages = []) => {
    const text = getRecentConversationText(messages);
    const needsLatex = includesAny(text, ['latex', '라텍', '문법', '검사', '오류', '에러', '컴파일', '수식', '표', '그림', '이미지', '패키지', '인용', '참조', '고쳐', '수정', '코드', '본문', '문서', 'preamble', '프리앰블', 'begin', 'end']);
    const needsCompiler = includesAny(text, ['컴파일러', '컴파일 방식', 'pdflatex', 'xelatex', 'lualatex', '한글', '폰트', 'fontspec', 'kotex', 'luatexko', 'xecjk', 'auto', '자동 컴파일']);
    const needsPreview = needsCompiler || includesAny(text, ['preview', '미리보기', 'pdf', '다운로드', '로그', 'compile', '확대', '축소', 'zoom', '보이지', '안 보여', '안보여', '복사', '드래그', '텍스트 선택', 'pdf 갱신']);
    const needsFileTree = includesAny(text, ['파일', '폴더', 'file tree', '파일 트리', '새 파일', '새 폴더', '업로드', '다운로드', '이름 변경', 'rename', 'delete', '삭제', '메인 문서', 'main document', '확장자', 'unsupported', '지원하지 않는', 'mime', '드래그']);
    const needsEditorToolbar = includesAny(text, ['툴바', '버튼', '루트', '제곱근', 'sqrt', '굵게', '기울임', '위첨자', '아래첨자', '분수', '링크', '라벨', 'cite', '인용', '표', '목록', '환경', '수식']);
    const needsCollaboration = includesAny(text, ['공유', '멤버', '권한', '초대', '참가', '요청', 'owner', 'editor', 'viewer', '소유자', '강퇴', '소유권']);
    const needsHistory = includesAny(text, ['history', '히스토리', '롤백', 'rollback', 'restore', '복구', '버전', '이력']);
    const needsDashboard = includesAny(text, ['대시보드', '프로젝트 참가', '신규 프로젝트', '회원가입', '로그인', '비밀번호', '탈퇴']);
    const needsEditSession = includesAny(text, ['커서', '마지막 위치', '마지막 편집', '재입장', '다시 들어', '나갔다', '세션', '열던 파일', '편집하던 파일']);
    const needsUi = needsPreview || needsFileTree || needsEditorToolbar || needsCollaboration || needsHistory || needsDashboard || needsEditSession || includesAny(text, ['어디', '위치', '화면', '클릭', '메뉴', '안 눌', '안 보']);
    return { needsLatex, needsUi, needsCompiler, needsPreview, needsFileTree, needsEditorToolbar, needsCollaboration, needsHistory, needsDashboard, needsEditSession };
};

const BASE_SYSTEM_PROMPT = [
    '당신은 DGULaTeX 안에서 동작하는 한국어 LaTeX/협업 편집 AI 비서입니다.',
    '- 사용자가 한국어로 물으면 한국어로 답합니다.',
    '- 제공된 현재 파일과 참조 파일 컨텍스트에 근거해서 답합니다.',
    '- 답변은 보통 2~5문장으로 짧고 실행 가능하게 씁니다.',
    '- 코드 질문이면 바로 붙여 넣을 수 있는 수정 코드와 넣을 위치를 알려줍니다.',
    '- 컨텍스트에 없는 파일, 보이지 않는 화면 상태, 실행 결과를 본 것처럼 말하지 않습니다.',
    '- 확실하지 않으면 "현재 화면 기준으로는", "화면에 해당 라벨이 보이지 않으면"처럼 조건을 붙입니다.',
    '- 사용자를 탓하지 않고, 막힌 지점을 대신 찾아주는 말투를 씁니다.'
].join('\n');

const LATEX_SYSTEM_PROMPT = [
    'LaTeX 문법 검사/컴파일 오류/코드 생성 지침:',
    '- 현재 활성 파일과 참조 파일을 실제로 검사합니다.',
    '- 최근 컴파일 로그가 제공되면 로그의 파일명/줄번호/에러 메시지를 우선 근거로 진단합니다.',
    '- 먼저 치명적인 컴파일 문제, 누락된 패키지, 문서 구조 문제를 찾습니다.',
    '- 한글 텍스트가 있는데 한글 처리 설정이 없으면 반드시 지적합니다.',
    '- pdfLaTeX 기준은 \\usepackage{kotex}를 확인합니다.',
    '- XeLaTeX/LuaLaTeX 기준은 fontspec, xeCJK, luatexko 계열 설정을 확인합니다.',
    '- 수식, 환경, 중괄호, \\begin/\\end 짝, 이미지/표/참조/인용 패키지 누락을 점검합니다.',
    '- 문제가 있으면 "문제", "이유", "수정 코드" 순서로 간결하게 답합니다.',
    '- 문제가 안 보이면 확인한 범위와 남은 불확실성을 말합니다.'
].join('\n');

const UI_SYSTEM_PROMPT = [
    'DGULaTeX UI 안내 공통 지침:',
    '- 버튼, 툴바, 메뉴, 화면 위치는 실제 UI에 있는 라벨, 아이콘, title, tooltip 기준으로만 안내합니다.',
    '- 아래 제공된 UI 지도에 없는 버튼명이나 아이콘을 새로 만들어 말하지 않습니다.',
    '- 위치를 설명할 때는 "왼쪽 File tree", "중앙 에디터 상단 툴바", "오른쪽 Preview 영역", "상단 네비게이션", "대시보드 왼쪽 사이드바"처럼 실제 구역명을 먼저 말합니다.',
    "- 루트/제곱근 버튼은 √ 아이콘이 아니라 중앙 에디터 상단 툴바의 'sqrt' 텍스트 버튼입니다.",
    '- UI 질문이면 버튼/패널/메뉴 이름과 위치를 먼저 안내하고, 필요한 경우에만 LaTeX 명령어를 덧붙입니다.'
].join('\n');

const EDITOR_TOOLBAR_UI_PROMPT = [
    '중앙 LaTeX 에디터 툴바:',
    '- 텍스트 파일이 열렸을 때만 LaTeX 툴바가 보입니다. 이미지 파일을 열면 이미지 뷰어가 보입니다.',
    '- viewer 권한이거나 읽기 전용 상태면 툴바 버튼이 비활성화될 수 있습니다.',
    '- 버튼: ↶ Undo, ↷ Redo, T Heading, B Bold, I Italic, x^2 Superscript, x_2 Subscript, omega, sum, sqrt, a/b, link, + Comment, tag, cite, img, tbl, list.',
    '- sqrt 버튼(title Square root)은 \\sqrt{}를 삽입합니다. 루트/제곱근 기능은 이 버튼이며 √ 아이콘은 없습니다.',
    '- Env 드롭다운(title/tooltip Insert environment)은 Figure, Table, Equation, Align, Itemize, Enumerate, Description, Matrix를 삽입합니다.',
    '- Ctrl/Cmd+S는 저장이 아니라 현재 문서 수동 컴파일을 실행합니다.'
].join('\n');

const PREVIEW_UI_PROMPT = [
    '오른쪽 Preview 영역:',
    '- Preview 영역 상단 툴바 왼쪽에는 ▶ Compile 버튼, Auto 스위치, 컴파일 방식 드롭다운이 있습니다.',
    '- ▶ Compile 버튼(title/tooltip Compile)은 현재 프로젝트의 메인 문서를 현재 선택된 컴파일 방식으로 컴파일합니다. 실행 중에는 Compiling...으로 바뀝니다.',
    '- Auto 스위치(title/tooltip Auto compile)는 자동 컴파일을 켜거나 끕니다.',
    '- 컴파일 방식 드롭다운(title 컴파일 방식, aria-label 컴파일 방식)은 pdflatex, xelatex, lualatex 중 컴파일 엔진을 선택합니다.',
    '- Auto가 켜져 있으면 편집 후 자동 컴파일도 현재 선택된 컴파일 방식을 사용합니다.',
    '- PDF 미리보기에서는 PDF 안의 텍스트를 드래그해서 복사할 수 있습니다.',
    '- Zoom 컨트롤은 − 축소, 퍼센트 버튼 화면 너비 맞추기, + 확대입니다. 일반적으로 확대/축소는 새 컴파일 없이 즉시 반영됩니다.',
    '- PDF가 새로 컴파일되거나 처음 렌더링되는 동안에는 컴파일 중... 또는 PDF 갱신 중... 오버레이가 보일 수 있습니다.',
    '- ! 컴파일 로그 버튼은 로그 화면을 열고, ↓ PDF 다운로드 버튼은 생성된 PDF를 다운로드합니다.',
    '- 로그 보기 상태의 ↩ PDF로 돌아가기 버튼은 PDF 보기로 돌아갑니다.'
].join('\n');

const COMPILER_UI_PROMPT = [
    '컴파일러 선택/한글/폰트/로그 안내:',
    '- 사용자가 컴파일러 위치, XeLaTeX, 한글 깨짐, 폰트 문제를 물으면 먼저 오른쪽 Preview 영역 상단의 pdflatex/xelatex/lualatex 드롭다운을 안내합니다.',
    '- 기본값은 pdflatex입니다.',
    '- 한글 문서에서 pdfLaTeX를 쓰는 경우 \\usepackage{kotex} 필요성을 먼저 확인합니다.',
    '- 시스템 폰트 지정이 필요한 문서나 유니코드/한글/일부 특수문자 문제가 있으면 xelatex 또는 lualatex 선택을 권할 수 있습니다.',
    '- 기존 pdfLaTeX 전용 패키지나 설정이 있으면 XeLaTeX/LuaLaTeX로 바꿀 때 충돌 가능성을 짧게 경고합니다.',
    '- 컴파일 로그는 요약 카드와 세부 카드로 나뉘며, 상태는 성공/실패/로그로 표시됩니다.',
    '- 로그 요약에는 Engine, Passes, 컴파일 성공/실패 시간이 표시될 수 있습니다.',
    '- 세부 카드는 Sanitize, Result, Warnings, Errors, STDERR, Pass 1/2 같은 섹션으로 구분됩니다.'
].join('\n');

const FILE_TREE_UI_PROMPT = [
    '왼쪽 File tree:',
    '- 헤더의 📄+ 버튼(title 새 파일)은 새 파일, 📁+ 버튼(title 새 폴더)은 새 폴더, 📤 버튼(title 업로드)은 업로드 모달을 엽니다.',
    '- 파일 또는 폴더 클릭은 항목 선택입니다. 텍스트 파일은 중앙 에디터에 열리고, 이미지 파일과 PDF 파일은 중앙 뷰어에 열립니다.',
    '- PDF 파일을 열면 페이지 미리보기와 텍스트 선택/복사를 사용할 수 있습니다.',
    '- 업로드 실패 메시지에 확장자와 MIME이 표시되면, 해당 값 기준으로 지원 여부를 확인하도록 안내합니다.',
    '- 확장자가 없는 latexmkrc, bcf 같은 보조/산출물 파일은 일반적으로 업로드 대상이 아니며, 컴파일에 반드시 필요한 소스 파일인지 먼저 확인하도록 안내합니다.',
    '- 우클릭 메뉴는 Rename, Download, 👑 Set as main document, Delete, New file, New folder, Upload입니다.',
    '- 현재 메인 문서로 지정된 파일은 우클릭 메뉴에서 Delete가 보이지 않습니다.',
    '- 여러 항목 선택 상태에서도 선택 목록에 메인 문서가 포함되어 있으면 Delete N items 옵션이 보이지 않습니다.',
    '- Set as main document는 .tex 파일이고 아직 메인 문서가 아닌 경우에만 보입니다.',
    '- 삭제 확인 모달 제목은 삭제 확인이고 버튼은 취소와 확인입니다.',
    '- 업로드 방식 모달 제목은 업로드 방식 선택이고 버튼은 파일 업로드, 폴더 업로드, 취소입니다.'
].join('\n');

const EDIT_SESSION_UI_PROMPT = [
    '마지막 편집 파일/커서 위치 복원:',
    '- DGULaTeX는 사용자별 마지막 편집 파일과 커서 위치를 기억합니다.',
    '- 프로젝트에 다시 들어오면 마지막으로 편집하던 텍스트 파일을 우선 열고 저장된 커서 위치로 이동합니다.',
    '- 그 사이 다른 사람이 파일을 편집했으면 현재 파일의 실제 줄 수와 컬럼 범위 안으로 커서 위치를 보정합니다.',
    '- 저장된 마지막 파일이 삭제되었거나 열 수 없는 파일이면 메인 문서의 1행 1열로 이동합니다.',
    '- 이미지/PDF 파일은 텍스트 커서 복원 대상이 아니며 전용 뷰어로 열립니다.'
].join('\n');

const COLLABORATION_UI_PROMPT = [
    '공유/멤버/권한:',
    '- 역할은 owner, editor, viewer입니다.',
    '- owner와 editor는 편집/파일 작업/히스토리 저장/컴파일을 할 수 있고, viewer는 읽기 전용입니다.',
    '- 상단 공유하기 버튼은 owner에게만 보일 수 있고 프로젝트 공유하기 모달을 엽니다.',
    '- 공유 모달에는 Editor 초대 코드, Viewer 초대 코드, ↻ 재발급 버튼, 복사, 닫기, ×가 있습니다.',
    '- 상단 멤버 버튼은 프로젝트 멤버 모달을 엽니다.',
    '- 멤버 모달 탭은 멤버 목록과 owner 전용 참가 요청입니다.',
    '- owner는 권한 select에서 viewer, editor, owner로 권한을 바꿀 수 있고, 강퇴 버튼으로 owner가 아닌 멤버를 제거할 수 있습니다.',
    '- 참가 요청은 수락 또는 거절할 수 있습니다.',
    '- 실시간 공동 편집은 자동으로 동기화되며, 연결이 불안정하면 새로고침하거나 프로젝트 관리자에게 문의하도록 안내합니다.'
].join('\n');

const HISTORY_UI_PROMPT = [
    'History 화면:',
    '- 상단 🕒 History 버튼으로 히스토리 화면에 들어갑니다.',
    '- History 화면 상단 왼쪽 ← 버튼은 에디터 화면으로 돌아갑니다.',
    '- Restore this file 버튼은 owner에게만 보일 수 있고 현재 보고 있는 과거 파일 버전으로 파일 롤백을 시작합니다.',
    '- 오른쪽 히스토리 목록 제목은 Recent Activity입니다.',
    '- 히스토리 항목의 ⋮ 메뉴에는 Download version과 owner 전용 Rollback Project가 있습니다.',
    '- 파일 롤백 확인 모달 제목은 파일 롤백 확인이고, 프로젝트 롤백 확인 모달 제목은 프로젝트 롤백 확인입니다.',
    '- 이미지/PDF 파일은 히스토리 코드 뷰어에 표시되지 않고 현재 파일 롤백 대상에서 제외될 수 있습니다.'
].join('\n');

const DASHBOARD_UI_PROMPT = [
    '로그인/대시보드:',
    '- 로그인 화면에는 로그인과 회원가입 탭이 있습니다.',
    '- 로그인 입력 라벨은 학번/사번, 비밀번호입니다.',
    '- 비밀번호를 변경하시겠습니까?를 누르면 비밀번호 변경 화면으로 이동합니다.',
    '- 대시보드 왼쪽 사이드바에는 + 신규 프로젝트, 프로젝트 참가, 전체 프로젝트, 나의 프로젝트, 공유받은 프로젝트, 탈퇴하기가 있습니다.',
    '- 프로젝트 참가 모달에서는 초대 코드 입력 후 요청을 눌러 참가 요청을 보냅니다.',
    '- 프로젝트 표 실행 버튼은 Zip, PDF, 이름 변경, owner 프로젝트의 삭제입니다.'
].join('\n');

const AI_CHAT_UI_PROMPT = [
    'AI 채팅:',
    '- 우측 하단 플로팅 버튼은 닫힌 상태에서 ✨, 열린 상태에서 ×로 보입니다. title은 AI 비서 열기입니다.',
    '- 채팅 팝업 헤더에는 ✨와 Chat DGULaTeX가 보입니다.',
    '- 입력창 placeholder는 무엇이든 물어보세요...이고 전송 버튼 텍스트는 전송입니다.'
].join('\n');


const buildAdaptiveSystemPrompt = (messages = []) => {
    const needs = detectPromptNeeds(messages);
    const sections = [BASE_SYSTEM_PROMPT];
    if (needs.needsLatex) sections.push(LATEX_SYSTEM_PROMPT);
    if (needs.needsUi) {
        sections.push(UI_SYSTEM_PROMPT);
        sections.push(AI_CHAT_UI_PROMPT);
    }
    if (needs.needsEditorToolbar) sections.push(EDITOR_TOOLBAR_UI_PROMPT);
    if (needs.needsPreview) sections.push(PREVIEW_UI_PROMPT);
    if (needs.needsCompiler) sections.push(COMPILER_UI_PROMPT);
    if (needs.needsFileTree) sections.push(FILE_TREE_UI_PROMPT);
    if (needs.needsEditSession) sections.push(EDIT_SESSION_UI_PROMPT);
    if (needs.needsCollaboration) sections.push(COLLABORATION_UI_PROMPT);
    if (needs.needsHistory) sections.push(HISTORY_UI_PROMPT);
    if (needs.needsDashboard) sections.push(DASHBOARD_UI_PROMPT);
    return sections.join('\n\n');
};
/**
 * 클라이언트의 대화 문맥을 분석하여 AI 답변을 생성함
 */
async function generateAIReply(messages, latexContext, options = {}) {
    const memorySummary = clipText(options.memorySummary || '', 4000);
    const contextText = formatLatexContext(latexContext);

    const finalMessages = [
        {
            role: 'system',
            content: buildAdaptiveSystemPrompt(messages)
        },
        {
            role: 'system',
            content: [
                memorySummary ? `[이전 대화 압축 메모리]\n${memorySummary}` : '',
                `[현재 LaTeX 작업 컨텍스트]\n${contextText}`
            ].filter(Boolean).join('\n\n')
        },
        ...sanitizeMessages(messages)
    ];

    const response = await openai.chat.completions.create({
        model: 'gpt-5.1',
        messages: finalMessages,
        reasoning_effort: 'medium',
    });

    return response.choices[0].message.content;
}

module.exports = { generateAIReply };
