/**
 * =================================================================
 * [Server] Express Application Bootstrap
 * 설명: Express, Socket.IO, 정적 파일, API 라우터 및 포트 실행을 구성함
 * =================================================================
 */
/* ---------------------------------------------------------
 * SECTION 0: 핵심 모듈 및 설정 로드
 * --------------------------------------------------------- */
require('dotenv').config(); 
const express = require('express');
const cors = require('cors');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

/* ---------------------------------------------------------
 * SECTION 1: API 라우터 모듈 임포트
 * --------------------------------------------------------- */
const authRoutes = require('./routes/authRoutes');     
const chatRoutes = require('./routes/chatAiRoutes');   
const projectRoutes = require('./routes/projectRoutes'); 
const entryRoutes = require('./routes/entryRoutes');     
const compilerRoutes = require('./routes/compilerRoutes'); 
const memberRoutes = require('./routes/memberRoutes');
const historyRoutes = require('./routes/historyRoutes');
const registerProjectSocket = require('./socket/projectSocket');

const app = express();
const frontendDistPath = path.resolve(__dirname, '../../FrontEnd/dist');

const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

const corsOptions = {
    origin(origin, callback) {
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
            return;
        }

        callback(new Error('CORS origin is not allowed'));
    },
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-user-id']
};

const httpServer = http.createServer(app);

const io = new Server(httpServer, {
    cors: corsOptions
});

app.set('io', io);

registerProjectSocket(io);

/* ---------------------------------------------------------
 * SECTION 2: 전역 미들웨어 설정
 * --------------------------------------------------------- */
app.use(cors(corsOptions)); // 허용된 프론트엔드 origin만 API 접근 허용
app.use(express.json()); // JSON 본문 파싱 (req.body 활성화)

app.use('/compiled', express.static('public/compiled'));    //S3가 없기 때문에 PDF를 로컬에 저장
app.use('/uploads', express.static('public/uploads'));  //이미지 역시 로컬에 저장

/* ---------------------------------------------------------
 * SECTION 3: API 라우트 통합 (Route Integration)
 * --------------------------------------------------------- */

/** [3-1] 인증 및 사용자 계정 관리 */
app.use('/api/auth', authRoutes);

/** [3-2] AI 협업 어시스턴트 (ChatGPT 연동) */
app.use('/api/chat', chatRoutes);

/** [3-3] 프로젝트 메타데이터 관리 */
app.use('/api/projects', projectRoutes);

/** * [3-4] 엔트리(파일 시스템) 관리 
 * [중요] :projectId 파라미터가 entryRoutes 내부에서 동일한 명칭으로 호출되어야 함.
 */
app.use('/api/projects/:projectId/entries', entryRoutes);

/** [3-5] LaTeX 소스 컴파일 및 PDF 생성 */
app.use('/api/compile', compilerRoutes);

// 프로젝트 멤버 관리 
app.use('/api/members', memberRoutes);

// 히스토리 관리 
app.use('/api/histories', historyRoutes);



// 에러 핸들러
app.use((err, req, res, next) => {
  console.error('[SERVER ERROR]', err.message || 'INTERNAL_SERVER_ERROR');

  const statusCode = err.statusCode || 500;

  return res.status(statusCode).json({
    success: false,
    statusCode,
    message: err.message || 'INTERNAL_SERVER_ERROR',
    compileLog: err.detail || ''
  });
});

/* ---------------------------------------------------------
 * SECTION 4: 서버 기동 (Server Start - 자동 증가 포트 스위칭)
 * --------------------------------------------------------- */
// .env에 설정된 PORT(5000)를 기본 시작점으로 파싱합니다.
let targetPort = parseInt(process.env.PORT, 10) || 5000;

/**
 * 포트 충돌을 감지하여 사용 가능한 빈 포트를 찾을 때까지 재귀 구동하는 함수
 */
function startServer(port) {
    const onListening = () => {
        httpServer.off('error', onError);

        console.log(`
    ========================================================
    🚀 DGULaTeX Backend Server is running!
    📍 GPU Server URL: http://localhost:${port}
    📅 Time: ${new Date().toLocaleString()}
    📝 Status: Column 'project_id' NULL Check Ready
    💡 중요: 이 백엔드와 연결할 프론트엔드 명령어는 [ npm run dev:${port} ] 입니다.
    ========================================================
        `);
    };

    const onError = (err) => {
        httpServer.off('listening', onListening);

        if (err.code === 'EADDRINUSE') {
            console.log(`⚠️  포트 ${port}번은 이미 팀원이 사용 중입니다. ${port + 1}번 포트로 우회를 시도합니다...`);

            startServer(port + 1);
        } else {
            console.error('❌ 서버 기동 중 예외 에러 발생:', err.message);
        }
    };

    httpServer.once('listening', onListening);
    httpServer.once('error', onError);

    httpServer.listen(port);
}

// 최초 서버 가동 프로세스 실행
startServer(targetPort);