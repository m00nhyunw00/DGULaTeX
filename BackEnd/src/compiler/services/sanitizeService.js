/**
 * =================================================================
 * [Service] Sanitize Workspace Service
 * 설명: 컴파일 전 작업 공간 내 LaTeX 파일을 순회하며 sanitize 처리를 수행함
 * =================================================================
 */
const fs = require('fs/promises');
const path = require('path');

const { sanitizeTexFile } = require('../utils/sanitize');

const GRAPHIC_EXTENSIONS = [
  '',
  '.pdf',
  '.png',
  '.jpg',
  '.jpeg',
  '.eps',
  '.svg'
];

async function collectTexFiles(dir) {
  const result = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      result.push(...await collectTexFiles(fullPath));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.tex')) {
      // sanitize 결과 임시 파일은 다시 sanitize하지 않도록 제외
      if (!entry.name.toLowerCase().includes('.sanitized.')) {
        result.push(fullPath);
      }
    }
  }

  return result;
}

function isInsideWorkspace(filePath, workspacePath) {
  const relativePath = path.relative(workspacePath, filePath);
  return relativePath && !relativePath.startsWith('..') && !path.isAbsolute(relativePath);
}

function shouldSkipGraphicsPath(graphicsPath) {
  return (
    !graphicsPath ||
    graphicsPath.includes('\\') ||
    /^[a-z][a-z0-9+.-]*:/i.test(graphicsPath)
  );
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function graphicsFileExists({ graphicsPath, texFilePath, workspacePath }) {
  if (shouldSkipGraphicsPath(graphicsPath)) {
    return true;
  }

  const trimmedPath = graphicsPath.trim();
  const hasExtension = Boolean(path.extname(trimmedPath));
  const extensions = hasExtension ? [''] : GRAPHIC_EXTENSIONS;
  const basePaths = [
    path.resolve(path.dirname(texFilePath), trimmedPath),
    path.resolve(workspacePath, trimmedPath)
  ];

  for (const basePath of basePaths) {
    if (!isInsideWorkspace(basePath, workspacePath)) {
      continue;
    }

    for (const extension of extensions) {
      const candidatePath = basePath + extension;

      if (await pathExists(candidatePath)) {
        return true;
      }
    }
  }

  return false;
}

async function removeMissingGraphics(filePath, workspacePath) {
  const originalText = await fs.readFile(filePath, 'utf8');
  const lines = originalText.split('\n');
  const logs = [];

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    const commentStart = line.indexOf('%');
    const codePart = commentStart === -1 ? line : line.slice(0, commentStart);
    const commentPart = commentStart === -1 ? '' : line.slice(commentStart);
    const includeGraphicsRegex = /\\includegraphics\s*(?:\[[^\]]*\]\s*)?\{([^{}]+)\}/g;
    let nextCodePart = '';
    let lastIndex = 0;
    let match;

    while ((match = includeGraphicsRegex.exec(codePart)) !== null) {
      const graphicsPath = match[1].trim();
      const exists = await graphicsFileExists({
        graphicsPath,
        texFilePath: filePath,
        workspacePath
      });

      nextCodePart += codePart.slice(lastIndex, match.index);

      if (exists) {
        nextCodePart += match[0];
      } else {
        logs.push({
          line: lineIndex + 1,
          graphicsPath
        });
      }

      lastIndex = match.index + match[0].length;
    }

    if (lastIndex > 0) {
      nextCodePart += codePart.slice(lastIndex);
      lines[lineIndex] = nextCodePart + commentPart;
    }
  }

  if (logs.length > 0) {
    await fs.writeFile(filePath, lines.join('\n'), 'utf8');
  }

  return logs;
}

async function sanitizeOneFile(filePath, workspacePath) {
  const dir = path.dirname(filePath);
  const ext = path.extname(filePath);
  const baseName = path.basename(filePath, ext);

  const tempSanitizedPath = path.join(dir, `${baseName}.sanitized${ext}`);
  const logPath = path.join(dir, `${baseName}.sanitize.log`);

  const result = sanitizeTexFile(filePath, tempSanitizedPath, logPath);

  // sanitize 결과를 원래 파일에 덮어쓰기
  const sanitizedText = await fs.readFile(tempSanitizedPath, 'utf8');
  await fs.writeFile(filePath, sanitizedText, 'utf8');

  // 임시 sanitized 파일 제거
  await fs.rm(tempSanitizedPath, { force: true });

  const missingGraphicsLogs = await removeMissingGraphics(filePath, workspacePath);
  const compileLog = await fs.readFile(logPath, 'utf8');
  const missingGraphicsLog = missingGraphicsLogs
    .map((log) => `Line ${log.line}: removed missing image include '${log.graphicsPath}'`)
    .join('\n');

  return {
    sanitized: true,
    inputPath: filePath,
    sanitizedPath: filePath,
    logPath,
    compileTargetPath: filePath,
    actionCount: result.logs.length + missingGraphicsLogs.length,
    compileLog: [
      compileLog,
      missingGraphicsLog
        ? `[MISSING GRAPHICS]\n${missingGraphicsLog}`
        : ''
    ].filter(Boolean).join('\n')
  };
}

exports.sanitizeFile = async (filePath) => {
  return sanitizeOneFile(filePath, path.dirname(filePath));
};

exports.sanitizeWorkspace = async (workspacePath) => {
  const texFiles = await collectTexFiles(workspacePath);
  const results = [];

  for (const filePath of texFiles) {
    const result = await sanitizeOneFile(filePath, workspacePath);
    results.push(result);
  }
  /*
  const compileLog = results
    .map((result) => {
      const relativePath = path.relative(workspacePath, result.inputPath);

      return [
        `[SANITIZE FILE] ${relativePath}`,
        result.compileLog
      ].join('\n');
    })
    .join('\n\n');
  */
  const changedResults = results.filter(result => result.actionCount > 0);

  const compileLog = changedResults
    .map((result) => {
      const relativePath = path.relative(workspacePath, result.inputPath);

      return [
        `[SANITIZE] ${relativePath}`,
        result.compileLog
      ].join('\n');
    })
    .join('\n\n');

  const actionCount = results.reduce((sum, result) => {
    return sum + (result.actionCount || 0);
  }, 0);

  return {
    sanitized: true,
    workspacePath,
    fileCount: texFiles.length,
    actionCount,
    compileLog: compileLog || '[SANITIZE]\n자동 보정된 내용은 없습니다.'
  };
};