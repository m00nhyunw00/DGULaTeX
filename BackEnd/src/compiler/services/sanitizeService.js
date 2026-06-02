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

function shouldSkipLatexResourcePath(resourcePath) {
  return (
    !resourcePath ||
    resourcePath.includes('\\') ||
    /^[a-z][a-z0-9+.-]*:/i.test(resourcePath)
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

function uniqueExistingSearchDirs(dirs, workspacePath) {
  const seen = new Set();
  const result = [];

  for (const dir of dirs) {
    if (!dir) continue;

    const resolvedDir = path.resolve(dir);
    const relativePath = path.relative(workspacePath, resolvedDir);
    const isWorkspaceRoot = relativePath === '';
    const isInside = isWorkspaceRoot || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath));

    if (!isInside || seen.has(resolvedDir)) continue;

    seen.add(resolvedDir);
    result.push(resolvedDir);
  }

  return result;
}

function buildLatexSearchDirs({ texFilePath, workspacePath, mainTexPath }) {
  return uniqueExistingSearchDirs([
    mainTexPath ? path.dirname(mainTexPath) : null,
    texFilePath ? path.dirname(texFilePath) : null,
    workspacePath
  ], workspacePath);
}

async function latexResourceExists({ resourcePath, texFilePath, workspacePath, mainTexPath, extensions }) {
  if (shouldSkipLatexResourcePath(resourcePath)) {
    return true;
  }

  const trimmedPath = resourcePath.trim();
  const searchDirs = buildLatexSearchDirs({
    texFilePath,
    workspacePath,
    mainTexPath
  });

  for (const searchDir of searchDirs) {
    const basePath = path.resolve(searchDir, trimmedPath);

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

async function graphicsFileExists({ graphicsPath, texFilePath, workspacePath, mainTexPath }) {
  const trimmedPath = String(graphicsPath || '').trim();
  const hasExtension = Boolean(path.extname(trimmedPath));

  return latexResourceExists({
    resourcePath: graphicsPath,
    texFilePath,
    workspacePath,
    mainTexPath,
    extensions: hasExtension ? [''] : GRAPHIC_EXTENSIONS
  });
}

function getTexImportExtensions(importPath, commandName) {
  const trimmedPath = String(importPath || '').trim();
  const hasExtension = Boolean(path.extname(trimmedPath));

  if (commandName === 'include') {
    return hasExtension ? [''] : ['.tex'];
  }

  return hasExtension ? [''] : ['', '.tex'];
}

async function texImportFileExists({ importPath, commandName, texFilePath, workspacePath, mainTexPath }) {
  return latexResourceExists({
    resourcePath: importPath,
    texFilePath,
    workspacePath,
    mainTexPath,
    extensions: getTexImportExtensions(importPath, commandName)
  });
}

function isAddedMissingEndMarker(line) {
  return String(line || '').trim().startsWith('% [SANITIZED: added missing end');
}

function buildOriginalLineMapFromSanitizedText(sanitizedText = '') {
  const lines = String(sanitizedText || '').split('\n');
  const compiledToOriginal = {};
  let originalLine = 1;
  let previousLineWasInsertedEndMarker = false;

  for (let index = 0; index < lines.length; index += 1) {
    const compiledLine = index + 1;
    const trimmed = String(lines[index] || '').trim();

    if (isAddedMissingEndMarker(lines[index])) {
      compiledToOriginal[compiledLine] = null;
      previousLineWasInsertedEndMarker = true;
      continue;
    }

    if (previousLineWasInsertedEndMarker && /^\\end\{[^}]+\}$/.test(trimmed)) {
      compiledToOriginal[compiledLine] = null;
      previousLineWasInsertedEndMarker = false;
      continue;
    }

    previousLineWasInsertedEndMarker = false;
    compiledToOriginal[compiledLine] = originalLine;
    originalLine += 1;
  }

  return compiledToOriginal;
}

async function removeMissingGraphics(filePath, workspacePath, options = {}) {
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
        workspacePath,
        mainTexPath: options.mainTexPath
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

async function collectMissingTexImports(filePath, workspacePath, options = {}) {
  const originalText = await fs.readFile(filePath, 'utf8');
  const lines = originalText.split('\n');
  const logs = [];

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    const commentStart = line.indexOf('%');
    const codePart = commentStart === -1 ? line : line.slice(0, commentStart);
    const importRegex = /\\(input|include)\s*\{([^{}]+)\}/g;
    let match;

    while ((match = importRegex.exec(codePart)) !== null) {
      const commandName = match[1];
      const importPath = match[2].trim();
      const exists = await texImportFileExists({
        importPath,
        commandName,
        texFilePath: filePath,
        workspacePath,
        mainTexPath: options.mainTexPath
      });

      if (!exists) {
        logs.push({
          line: lineIndex + 1,
          commandName,
          importPath
        });
      }
    }
  }

  return logs;
}

async function sanitizeOneFile(filePath, workspacePath, options = {}) {
  const dir = path.dirname(filePath);
  const ext = path.extname(filePath);
  const baseName = path.basename(filePath, ext);

  const tempSanitizedPath = path.join(dir, baseName + '.sanitized' + ext);
  const logPath = path.join(dir, baseName + '.sanitize.log');

  const result = sanitizeTexFile(filePath, tempSanitizedPath, logPath);

  // sanitize 결과를 원래 파일에 덮어쓰기
  const sanitizedText = await fs.readFile(tempSanitizedPath, 'utf8');
  await fs.writeFile(filePath, sanitizedText, 'utf8');
  const lineMap = buildOriginalLineMapFromSanitizedText(sanitizedText);

  // 임시 sanitized 파일 제거
  await fs.rm(tempSanitizedPath, { force: true });

  const missingGraphicsLogs = await removeMissingGraphics(filePath, workspacePath, options);
  const missingImportLogs = await collectMissingTexImports(filePath, workspacePath, options);
  const compileLog = await fs.readFile(logPath, 'utf8');
  const missingGraphicsLog = missingGraphicsLogs
    .map((log) => 'Line ' + log.line + ": removed missing image include '" + log.graphicsPath + "'")
    .join('\n');
  const missingImportLog = missingImportLogs
    .map((log) => 'Line ' + log.line + ': missing \\' + log.commandName + " target '" + log.importPath + "'")
    .join('\n');

  return {
    sanitized: true,
    inputPath: filePath,
    sanitizedPath: filePath,
    logPath,
    compileTargetPath: filePath,
    lineMap,
    actionCount: result.logs.length + missingGraphicsLogs.length + missingImportLogs.length,
    compileLog: [
      compileLog,
      missingGraphicsLog
        ? '[MISSING GRAPHICS]\n' + missingGraphicsLog
        : '',
      missingImportLog
        ? '[MISSING TEX INPUTS]\n' + missingImportLog
        : ''
    ].filter(Boolean).join('\n')
  };
}

exports.sanitizeFile = async (filePath) => {
  return sanitizeOneFile(filePath, path.dirname(filePath), {
    mainTexPath: filePath
  });
};

exports.sanitizeWorkspace = async (workspacePath, options = {}) => {
  const texFiles = await collectTexFiles(workspacePath);
  const results = [];

  for (const filePath of texFiles) {
    const result = await sanitizeOneFile(filePath, workspacePath, options);
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

  const lineMaps = results.reduce((maps, result) => {
    const relativePath = path.relative(workspacePath, result.inputPath).split(path.sep).join('/');
    maps[relativePath] = result.lineMap || {};
    return maps;
  }, {});

  return {
    sanitized: true,
    workspacePath,
    fileCount: texFiles.length,
    actionCount,
    lineMaps,
    compileLog: compileLog || '[SANITIZE]\n자동 보정된 내용은 없습니다.'
  };
};
