/**
 * =================================================================
 * [Service] Docker LaTeX Compile Service
 * 설명: Docker 컨테이너에서 선택된 LaTeX 엔진을 실행하고 로그와 PDF 결과를 수집함
 * =================================================================
 */
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ApiError = require('../utils/apiError');
const compileLogService = require('./compileLogService');

const DEFAULT_IMAGE = process.env.LATEX_DOCKER_IMAGE || 'dgu-latex-compiler';
const ALLOWED_ENGINES = new Set(['pdflatex', 'xelatex', 'lualatex']);

function normalizeLatexEngine(engine) {
  const normalizedEngine = String(engine || '').trim().toLowerCase();
  return ALLOWED_ENGINES.has(normalizedEngine) ? normalizedEngine : 'pdflatex';
}

function toPosixPath(p) {
  return p.split(path.sep).join('/');
}



function runProcess(command, args, options = {}) {
  const {
    timeoutMs = 30000,
    cwd = process.cwd()
  } = options;

  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const child = spawn(command, args, {
      cwd,
      shell: false
    });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });

    child.on('close', (code) => {
      clearTimeout(timer);

      resolve({
        code,
        stdout,
        stderr,
        timedOut
      });
    });
  });
}

exports.compileLatex = async ({
  workspacePath,
  mainTexPath,
  engine = 'pdflatex',
  timeoutMs = 30000,
  compilePasses = 1,
  lineMaps = {}
}) => {
  if (!workspacePath || !mainTexPath) {
    throw new ApiError(400, 'MISSING_COMPILE_PATHS');
  }

  if (!fs.existsSync(workspacePath)) {
    throw new ApiError(
      404,
      'WORKSPACE_NOT_FOUND',
      "Workspace not found."
    );
  }

  if (!fs.existsSync(mainTexPath)) {
    throw new ApiError(
      404,
      'MAIN_TEX_NOT_FOUND',
      "Main tex file not found."
    );
  }

  /*
  const mainDir = path.dirname(mainTexPath);
  const mainFileName = path.basename(mainTexPath);
  const pdfFileName = path.basename(mainTexPath, path.extname(mainTexPath)) + '.pdf';
  const pdfPath = path.join(mainDir, pdfFileName);

  const relativeMainDir = path.relative(workspacePath, mainDir);
  const containerWorkDir = relativeMainDir
    ? `/work/${toPosixPath(relativeMainDir)}`
    : '/work';
  */

  const compileEngine = normalizeLatexEngine(engine);
  const normalizedCompilePasses = Math.max(1, Math.min(3, Number.parseInt(compilePasses, 10) || 1));
  const relativeMainTexPath = path.relative(workspacePath, mainTexPath);

  if (
    !relativeMainTexPath ||
    relativeMainTexPath.startsWith('..') ||
    path.isAbsolute(relativeMainTexPath)
  ) {
    throw new ApiError(
      400,
      'INVALID_MAIN_TEX_PATH',
      'Main tex file must be inside compile workspace.'
    );
  }

  const containerMainTexPath = toPosixPath(relativeMainTexPath);

  const containerMainDir = path.posix.dirname(containerMainTexPath);

  const latexSearchPath =
    containerMainDir && containerMainDir !== '.'
      ? `/work/${containerMainDir}//:/work//:`
      : `/work//:`;
  // PDF는 pdflatex를 /work에서 실행하면 /work 기준에 생성됨.
  // main.tex가 하위 폴더에 있어도 output-directory를 /work로 지정해서
  // 결과 PDF를 항상 workspace root에서 찾도록 통일한다.
  const pdfFileName =
    path.basename(mainTexPath, path.extname(mainTexPath)) + '.pdf';

  const pdfPath = path.join(workspacePath, pdfFileName);

  const containerWorkDir = '/work';

  const dockerArgs = [
    'run',
    '--rm',

    // 보안/격리
    '--network', 'none',
    '--security-opt', 'no-new-privileges=true',

    // 리소스 제한
    '--memory', '512m',
    '--cpus', '1',
    '--pids-limit', '128',

    // 작업 디렉토리 마운트
    '-v', `${workspacePath}:/work:rw`,
    '-w', containerWorkDir,

    // main.tex 위치 기준 + 프로젝트 루트 기준 둘 다 탐색
    '-e', `TEXINPUTS=${latexSearchPath}`,
    '-e', `BIBINPUTS=${latexSearchPath}`,

    // TeX 로그가 좁은 줄폭에서 잘려 보이지 않도록 출력 폭 확장
    '-e', 'max_print_line=1000',

    DEFAULT_IMAGE,

    compileEngine,
    '-interaction=nonstopmode',
    '-halt-on-error',
    '-file-line-error',
    // 결과물을 항상 /work에 생성
    '-output-directory=/work',
    // 메인 파일은 workspace root 기준 상대 경로로 전달
    containerMainTexPath
  ];

  const compileLogs = [];
  let finalResult = null;

  for (let pass = 1; pass <= normalizedCompilePasses; pass += 1) {
    const result = await runProcess('docker', dockerArgs, {
      timeoutMs
    });

    finalResult = result;

    const latexCompileLog = compileLogService.buildUserCompileLog({
      stdout: result.stdout,
      stderr: result.stderr,
      failed: result.timedOut || result.code !== 0,
      workspacePath,
      lineMaps,
      mainTexPath: containerMainTexPath
    });

    compileLogs.push(compileLogService.buildCompilePassLog({
      compilePasses: normalizedCompilePasses,
      pass,
      compileLog: latexCompileLog
    }));

    const failedAt = new Date();
    const currentUserCompileLog = compileLogService.buildCompileLog({
      compileEngine,
      compilePasses: normalizedCompilePasses,
      compileLogs,
      status: 'failed',
      completedAt: failedAt
    });

    if (result.timedOut) {
      throw new ApiError(
        408,
        'TIMEOUT',
        currentUserCompileLog || '컴파일 시간이 초과되었습니다.'
      );
    }

    if (result.code !== 0) {
      throw new ApiError(
        422,
        'LATEX_SYNTAX_ERROR',
        currentUserCompileLog || 'LaTeX 문법 오류로 컴파일에 실패했습니다.'
      );
    }
  }

  const successAt = new Date();
  const userCompileLog = compileLogService.buildCompileLog({
    compileEngine,
    compilePasses: normalizedCompilePasses,
    compileLogs,
    status: 'success',
    completedAt: successAt
  });

  if (!fs.existsSync(pdfPath)) {
    const pdfMissingLog = compileLogService.buildCompileLog({
      compileEngine,
      compilePasses: normalizedCompilePasses,
      compileLogs,
      status: 'failed',
      completedAt: new Date()
    });

    throw new ApiError(
      500,
      'PDF_NOT_CREATED',
      pdfMissingLog || '컴파일은 종료되었지만 PDF가 생성되지 않았습니다.'
    );
  }

  return {
    success: true,
    pdfPath,
    compileEngine,
    compileLog: userCompileLog
  };
};