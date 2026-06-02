/**
 * =================================================================
 * [Service] Auto Compile Cache Service
 * 설명: 자동 컴파일 결과의 최신성 판단을 위한 버전 캐시를 관리함
 * =================================================================
 */
const fs = require('fs/promises');
const path = require('path');

const { safeFileName } = require('../utils/pathSafe');

const BASE_AUTO_COMPILE_DIR = path.join(
  process.cwd(),
  'runtime',
  'autoCompile'
);

function buildEntryMap(entries) {
  const map = new Map();

  for (const entry of entries) {
    map.set(entry.id, entry);
  }

  return map;
}

function resolveEntryRelativePath(entry, entryMap) {
  const parts = [];
  let current = entry;

  while (current) {
    parts.unshift(safeFileName(current.title));
    current = current.parent_id ? entryMap.get(current.parent_id) : null;
  }

  return path.join(...parts);
}

async function writeFileIfChanged(filePath, nextContent) {
  try {
    const prevContent = await fs.readFile(filePath, 'utf8');

    if (prevContent === nextContent) {
      return false;
    }
  } catch (err) {
    // 파일이 없으면 새로 작성
  }

  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, nextContent || '', 'utf8');

  return true;
}

exports.getAutoCompileWorkspace = async ({
  projectId,
  userId,
  fileId
}) => {
  const workspacePath = path.join(
    BASE_AUTO_COMPILE_DIR,
    projectId,
    userId,
    fileId
  );

  await fs.mkdir(workspacePath, { recursive: true });

  return {
    path: workspacePath
  };
};

exports.syncChangedEntriesToWorkspace = async ({
  workspacePath,
  entries,
  targetFileId,
  targetContent
}) => {
  const entryMap = buildEntryMap(entries);
  const changedFiles = [];

  for (const entry of entries) {
    const relativePath = resolveEntryRelativePath(entry, entryMap);
    const targetPath = path.join(workspacePath, relativePath);

    if (entry.is_folder) {
      await fs.mkdir(targetPath, { recursive: true });
      continue;
    }

    /*
     * 이미지/바이너리 파일은 현재 S3가 없으므로 여기서 처리하지 않음.
     * 나중에 entry.s3_key가 생기면:
     * - 파일이 캐시에 없으면 S3에서 다운로드
     * - 이미 있으면 재사용
     */
    const title = String(entry.title || '').toLowerCase();
    const isLikelyBinary =
      title.endsWith('.png') ||
      title.endsWith('.jpg') ||
      title.endsWith('.jpeg') ||
      title.endsWith('.pdf') ||
      title.endsWith('.eps') ||
      title.endsWith('.svg');

    if (isLikelyBinary) {
      continue;
    }

    const content =
      entry.id === targetFileId
        ? targetContent
        : entry.current_content || '';

    const changed = await writeFileIfChanged(targetPath, content);

    if (changed) {
      changedFiles.push(relativePath);
    }
  }

  return {
    changedFiles
  };
};

exports.getMainTexPath = ({
  workspacePath,
  entries,
  fileId
}) => {
  const entryMap = buildEntryMap(entries);
  const mainEntry = entryMap.get(fileId);

  if (!mainEntry) {
    throw new Error('MAIN_DOCUMENT_NOT_FOUND_IN_ENTRY_TREE');
  }

  const relativePath = resolveEntryRelativePath(mainEntry, entryMap);

  return path.join(workspacePath, relativePath);
};