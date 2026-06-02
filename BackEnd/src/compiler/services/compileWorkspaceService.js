/**
 * =================================================================
 * [Service] Compile Workspace Service
 * 설명: 임시 컴파일 작업 디렉터리 생성, 파일 트리 복원, snapshot 반영, 정리를 담당함
 * =================================================================
 */
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

const { safeFileName } = require('../utils/pathSafe');

const BASE_COMPILE_DIR = '/tmp/compile';

const UPLOADS_ROOT = path.resolve(
  process.env.UPLOADS_ROOT || path.join(process.cwd(), 'public')
);

function stripQueryString(url = '') {
  return String(url).split('?')[0];
}

function normalizeAssetUrl(assetUrl = '') {
  return stripQueryString(assetUrl)
    .replace(/^https?:\/\/[^/]+/i, '')
    .replace(/^\/+/, '');
}

function resolveAssetPathFromUrl(assetUrl) {
  if (!assetUrl) return null;

  const relativeUrl = normalizeAssetUrl(assetUrl);

  /**
   * 예시 assetUrl:
   * - /uploads/projects/{projectId}/assets/{entryId}/image.png
   * - uploads/projects/{projectId}/assets/{entryId}/image.png
   *
   * 정적 제공 루트가 public이라면:
   * - public/uploads/projects/...
   */
  return path.join(UPLOADS_ROOT, relativeUrl);
}

function getEntryAssetUrl(entry) {
  return (
    entry.asset_url ||
    entry.assetUrl ||
    entry.file_url ||
    entry.fileUrl ||
    entry.url ||
    null
  );
}

function buildEntryMap(entries) {
  const map = new Map();

  for (const entry of entries) {
    map.set(entry.id, entry);
  }

  return map;
}

function resolveEntryPath({ workspacePath, entry, entryMap }) {
  const parts = [];
  let current = entry;

  while (current) {
    parts.unshift(safeFileName(current.title));
    current = current.parent_id ? entryMap.get(current.parent_id) : null;
  }

  return path.join(workspacePath, ...parts);
}

exports.createWorkspace = async ({ projectId }) => {
  const compileId = crypto.randomUUID();

  const workspacePath = path.join(
    BASE_COMPILE_DIR,
    projectId,
    compileId
  );

  await fs.mkdir(workspacePath, { recursive: true });

  return {
    id: compileId,
    path: workspacePath
  };
};

exports.restoreEntryTree = async ({ workspacePath, entries }) => {
  const entryMap = buildEntryMap(entries);

  for (const entry of entries) {
    const targetPath = resolveEntryPath({
      workspacePath,
      entry,
      entryMap
    });

    if (entry.is_folder) {
      await fs.mkdir(targetPath, { recursive: true });
      continue;
    }

    await fs.mkdir(path.dirname(targetPath), { recursive: true });

    const assetUrl = getEntryAssetUrl(entry);

    /**
     * 이미지/PDF 등 asset 파일:
     * DB current_content가 아니라 실제 서버 디스크 파일을
     * 컴파일 workspace의 동일한 트리 위치로 복사한다.
     */
    if (assetUrl) {
      const sourcePath = resolveAssetPathFromUrl(assetUrl);

      try {
        await fs.copyFile(sourcePath, targetPath);
      } catch (error) {
        console.error('[COMPILE WORKSPACE] asset file copy failed');

        continue;
      }

      continue;
    }

    /**
     * 텍스트 파일:
     * .tex, .bib, .sty 등은 DB current_content로 복원한다.
     */
    if (typeof entry.current_content === 'string') {
      await fs.writeFile(targetPath, entry.current_content, 'utf8');
      continue;
    }

    /**
     * assetUrl도 없고 current_content도 없는 파일은
     * 컴파일에 사용할 수 없으므로 빈 파일로 만들기보다 명확히 실패시키는 편이 안전하다.
     */
    console.warn('[COMPILE WORKSPACE] skipped empty non-folder entry');
  }
};

exports.writeMainTexSnapshot = async ({
  workspacePath,
  entries,
  fileId,
  content
}) => {
  const entryMap = buildEntryMap(entries);
  const mainEntry = entryMap.get(fileId);

  if (!mainEntry) {
    throw new Error('MAIN_DOCUMENT_NOT_FOUND_IN_ENTRY_TREE');
  }

  const mainTexPath = resolveEntryPath({
    workspacePath,
    entry: mainEntry,
    entryMap
  });

  await fs.mkdir(path.dirname(mainTexPath), { recursive: true });
  await fs.writeFile(mainTexPath, content || '', 'utf8');

  return mainTexPath;
};

exports.getEntryPath = ({
  workspacePath,
  entries,
  fileId
}) => {
  const entryMap = buildEntryMap(entries);
  const entry = entryMap.get(fileId);

  if (!entry) {
    throw new Error('ENTRY_NOT_FOUND_IN_ENTRY_TREE');
  }

  return resolveEntryPath({
    workspacePath,
    entry,
    entryMap
  });
};

exports.writeEntrySnapshot = async ({
  workspacePath,
  entries,
  fileId,
  content
}) => {
  const entryPath = exports.getEntryPath({
    workspacePath,
    entries,
    fileId
  });

  await fs.mkdir(path.dirname(entryPath), { recursive: true });
  await fs.writeFile(entryPath, content || '', 'utf8');

  return entryPath;
};

exports.cleanupWorkspace = async (workspacePath) => {
  await fs.rm(workspacePath, {
    recursive: true,
    force: true
  });
};