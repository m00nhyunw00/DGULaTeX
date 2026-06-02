/**
 * =================================================================
 * [Service] Compile Log Formatter Service
 * 설명: LaTeX 컴파일 로그를 사용자 UI에서 읽기 좋은 구조로 분류하고 요약함
 * =================================================================
 */
function basenameFromPath(value) {
  const normalized = String(value || '').replace(/\\/g, '/');
  return normalized.split('/').filter(Boolean).pop() || 'path';
}

function redactSensitivePaths(line, { workspacePath = '' } = {}) {
  let nextLine = String(line || '');
  const normalizedWorkspacePath = String(workspacePath || '')
    .replace(/\\/g, '/')
    .replace(/\/+$/, '');

  if (normalizedWorkspacePath) {
    nextLine = nextLine.split(normalizedWorkspacePath + '/').join('');
    nextLine = nextLine.split(normalizedWorkspacePath).join('[hidden-path]/' + basenameFromPath(normalizedWorkspacePath));
  }

  nextLine = nextLine.replace(/\/work\/([^\s:)\]\"]+)/g, '$1');
  nextLine = nextLine.replace(/\/work(?=[:\s)\]\"]|$)/g, '.');

  nextLine = nextLine.replace(/(^|[\s(])\/[^\s:)\]\"]+/g, (match, prefix) => {
    const pathValue = match.slice(prefix.length);
    return prefix + '[hidden-path]/' + basenameFromPath(pathValue);
  });

  nextLine = nextLine.replace(/[A-Za-z]:\\[^\s:)\]\"]+/g, (pathValue) => {
    return '[hidden-path]/' + basenameFromPath(pathValue);
  });

  return nextLine;
}

function normalizeLogPath(value = '') {
  return String(value || '')
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/^\/+/, '');
}

function findLineMap(lineMaps = {}, filePath = '') {
  const normalizedPath = normalizeLogPath(filePath);
  if (!normalizedPath) return null;

  if (lineMaps[normalizedPath]) return lineMaps[normalizedPath];

  const matchedKey = Object.keys(lineMaps).find((key) => {
    const normalizedKey = normalizeLogPath(key);
    return normalizedKey === normalizedPath || normalizedKey.endsWith('/' + normalizedPath);
  });

  return matchedKey ? lineMaps[matchedKey] : null;
}

function resolveOriginalLine(lineMap, compiledLine) {
  const lineNumber = Number.parseInt(compiledLine, 10);
  if (!lineMap || !Number.isFinite(lineNumber) || lineNumber <= 0) return lineNumber;

  const direct = lineMap[lineNumber];
  if (Number.isFinite(direct) && direct > 0) return direct;

  for (let line = lineNumber - 1; line >= 1; line -= 1) {
    const previous = lineMap[line];
    if (Number.isFinite(previous) && previous > 0) return previous;
  }

  for (let line = lineNumber + 1; line <= lineNumber + 20; line += 1) {
    const next = lineMap[line];
    if (Number.isFinite(next) && next > 0) return next;
  }

  return lineNumber;
}

function applyOriginalLineMap(lines = [], { lineMaps = {}, mainTexPath = '' } = {}) {
  const mainTexKey = normalizeLogPath(mainTexPath);
  let currentFileKey = mainTexKey;

  return lines.map((line) => {
    let nextLine = String(line || '');

    nextLine = nextLine.replace(/(^|[\s(])([^:\s()\[\]"]+\.tex):(\d+):/gi, (match, prefix, filePath, lineNumber) => {
      const lineMap = findLineMap(lineMaps, filePath);
      currentFileKey = normalizeLogPath(filePath);

      if (!lineMap) return match;

      const originalLine = resolveOriginalLine(lineMap, lineNumber);
      return prefix + filePath + ':' + originalLine + ':';
    });

    nextLine = nextLine.replace(/(^|\s)l\.(\d+)(?=\s|$)/g, (match, prefix, lineNumber) => {
      const lineMap = findLineMap(lineMaps, currentFileKey || mainTexKey);
      if (!lineMap) return match;

      const originalLine = resolveOriginalLine(lineMap, lineNumber);
      return prefix + 'l.' + originalLine;
    });

    return nextLine;
  });
}

function formatCompileTimestamp(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;

  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).format(safeDate) + ' KST';
}

function buildCompilePassLog({ compilePasses = 1, pass = 1, compileLog = '' }) {
  return [
    compilePasses > 1 ? '[COMPILE PASS] ' + pass + '/' + compilePasses : '',
    compileLog
  ].filter(Boolean).join('\n');
}

function buildCompileLog({
  compileEngine,
  compilePasses,
  compileLogs,
  status = 'success',
  completedAt = new Date()
}) {
  const isFailed = status === 'failed';

  return [
    '[COMPILE ENGINE] ' + compileEngine,
    compilePasses > 1 ? '[COMPILE PASSES] ' + compilePasses : '',
    '',
    '[COMPILE TIME]',
    '컴파일 ' + (isFailed ? '실패' : '성공') + ' 시간: ' + formatCompileTimestamp(completedAt),
    '',
    compileLogs.filter(Boolean).join('\n\n')
  ].filter(Boolean).join('\n');
}

function extractUsefulLatexLines(stdout = '', stderr = '') {
    const lines = String(stdout || '').split(/\r?\n/);
    const picked = [];
    const pickedIndexes = new Set();

    const addLine = (index) => {
        if (index < 0 || index >= lines.length) return;
        if (pickedIndexes.has(index)) return;

        pickedIndexes.add(index);
        picked.push(lines[index]);
    };

    const isUsefulWarning = (trimmed) => {
        return (
            trimmed.includes('LaTeX Warning:') ||
            (trimmed.includes('Package ') && trimmed.includes('Warning:')) ||
            trimmed.includes('Overfull \\hbox') ||
            trimmed.includes('Underfull \\hbox')
        );
    };

    const isLatexErrorLine = (trimmed) => {
        return (
            trimmed.startsWith('!') ||

            // -file-line-error 사용 시 나올 수 있는 형태
            // main.tex:13: Missing } inserted.
            /^[^:\s]+\.tex:\d+:/i.test(trimmed) ||

            // 일반 LaTeX 에러 문맥
            trimmed.includes('Runaway argument') ||
            trimmed.includes('Paragraph ended before') ||
            trimmed.includes('File ended while scanning') ||
            trimmed.includes('Emergency stop') ||
            trimmed.includes('Fatal error') ||
            trimmed.includes('Undefined control sequence') ||
            trimmed.includes('Missing } inserted') ||
            trimmed.includes('Extra }, or forgotten') ||
            trimmed.includes('Missing \\begin') ||
            trimmed.includes('LaTeX Error:')
        );
    };

    const isLatexLinePointer = (trimmed) => {
        return /^l\.\d+/.test(trimmed);
    };

    for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();

        if (isUsefulWarning(trimmed)) {
            addLine(i);
            continue;
        }

        if (trimmed.includes('Output written on')) {
            addLine(i);
            continue;
        }

        if (isLatexErrorLine(trimmed) || isLatexLinePointer(trimmed)) {
            // 에러 위치만 나오면 원인 메시지가 앞에 있을 수 있으므로 앞뒤 문맥 포함
            for (let j = i - 4; j <= i + 4; j++) {
                addLine(j);
            }
        }
    }

    if (String(stderr || '').trim()) {
        picked.push('');
        picked.push('[STDERR]');
        picked.push(String(stderr).trim());
    }

    return picked.filter(line => line.trim() !== '');
}

function buildUserCompileLog({ stdout = '', stderr = '', failed = false, workspacePath = '', lineMaps = {}, mainTexPath = '' }) {
  const usefulLines = applyOriginalLineMap(
    extractUsefulLatexLines(stdout, stderr)
      .map(line => redactSensitivePaths(line, { workspacePath })),
    { lineMaps, mainTexPath }
  );

  const outputLine = usefulLines.find(line =>
    line.includes('Output written on')
  );

  const hasErrors =
    failed ||
    usefulLines.some(line =>
      line.trim().startsWith('!') ||
      /^l\.\d+/.test(line.trim()) ||
      line.includes('[ERROR]')
    );

  const hasWarnings = usefulLines.some(line =>
    line.includes('Warning:') ||
    line.includes('Overfull \\hbox') ||
    line.includes('Underfull \\hbox')
  );

  const sections = [];

  sections.push('[RESULT]');

  if (hasErrors) {
    sections.push('컴파일 실패: LaTeX 오류가 발생했습니다.');
  } else if (outputLine) {
    sections.push('컴파일 성공: PDF가 생성되었습니다.');
    sections.push(outputLine);
  } else {
    sections.push('컴파일이 완료되었습니다.');
  }

  if (hasWarnings) {
    sections.push('');
    sections.push('[WARNINGS]');
    sections.push(
      ...usefulLines.filter(line =>
        line.includes('Warning:') ||
        line.includes('Overfull \\hbox') ||
        line.includes('Underfull \\hbox')
      )
    );
  }

  const isErrorContextLine = (line) => {
    const trimmed = line.trim();

    return (
        trimmed.startsWith('!') ||
        /^l\.\d+/.test(trimmed) ||
        /^[^:\s]+\.tex:\d+:/i.test(trimmed) ||
        trimmed.includes('Runaway argument') ||
        trimmed.includes('Paragraph ended before') ||
        trimmed.includes('File ended while scanning') ||
        trimmed.includes('Emergency stop') ||
        trimmed.includes('Fatal error') ||
        trimmed.includes('Undefined control sequence') ||
        trimmed.includes('Missing } inserted') ||
        trimmed.includes('Extra }, or forgotten') ||
        trimmed.includes('LaTeX Error:') ||
        trimmed.includes('Package ') && trimmed.includes(' Error:')
    );
  };

  const errorLineIndexes = usefulLines.reduce((indexes, line, index) => {
    if (isErrorContextLine(line)) indexes.push(index);
    return indexes;
  }, []);

  const errorIndexesToInclude = new Set();
  for (const index of errorLineIndexes) {
    for (let offset = -3; offset <= 4; offset += 1) {
      const nextIndex = index + offset;
      if (nextIndex >= 0 && nextIndex < usefulLines.length) {
        errorIndexesToInclude.add(nextIndex);
      }
    }
  }

  const errorLines = usefulLines.filter((line, index) => {
    if (!errorIndexesToInclude.has(index)) return false;

    const trimmed = line.trim();
    return (
      trimmed &&
      !trimmed.includes('Warning:') &&
      !trimmed.includes('Overfull \\hbox') &&
      !trimmed.includes('Underfull \\hbox') &&
      !trimmed.includes('Output written on')
    );
  });

  if (errorLines.length > 0) {
    sections.push('');
    sections.push('[ERRORS]');
    sections.push(...errorLines);
  }

  return sections.join('\n');
}

module.exports = {
  buildUserCompileLog,
  buildCompilePassLog,
  buildCompileLog
};
