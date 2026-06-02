/**
 * =================================================================
 * [Service] Local File Storage Service
 * 설명: 업로드 에셋과 컴파일된 PDF를 로컬 저장소에 복사하고 공개 URL을 생성함
 * =================================================================
 */
const fs = require('fs');
const fsPromises = require('fs/promises');
const path = require('path');

/**
 * Buffer UUID 또는 문자열 ID를 파일 경로에 안전하게 사용할 문자열로 변환
 *
 * 현재 기존 코드에서는 Buffer가 들어오면 hex 문자열로 저장하고 있었으므로,
 * 그 동작을 유지한다.
 */
function normalizeId(id) {
  if (!id) return '';

  if (Buffer.isBuffer(id)) {
    return id.toString('hex').toLowerCase();
  }

  return String(id)
    .replace(/^0x/i, '')
    .replace(/-/g, '')
    .toLowerCase()
    .trim();
}

function isFolder(entry) {
  return entry.is_folder === 1 || entry.is_folder === true || entry.isFolder === true;
}

function isTexFile(entry) {
  return entry.title && entry.title.toLowerCase().endsWith('.tex');
}

/**
 * 컴파일 workspace에 별도로 복사해야 하는 asset 파일인지 확인
 *
 * - 폴더 제외
 * - .tex 파일 제외
 * - 이미지/바이너리 파일만 대상
 *
 * 현재는 확장자를 엄격하게 제한하지 않고, .tex가 아닌 파일은 asset으로 본다.
 * 나중에 필요하면 png, jpg, jpeg, pdf, svg 등으로 제한 가능.
 */
function isAssetFile(entry) {
  if (isFolder(entry)) return false;
  if (!entry.title) return false;
  if (isTexFile(entry)) return false;

  return true;
}

function getEntryId(entry) {
  return normalizeId(entry.id);
}

function getParentId(entry) {
  return normalizeId(entry.parent_id || entry.parentId);
}

function buildEntryMap(entries) {
  const map = new Map();

  for (const entry of entries) {
    map.set(getEntryId(entry), entry);
  }

  return map;
}

/**
 * entry의 parent_id를 따라 올라가면서 workspace 내부 상대 경로 생성
 *
 * 예:
 * images 폴더 entry
 * └─ my_image.png entry
 *
 * 결과:
 * images/my_image.png
 */
function getEntryRelativePath(entry, entryMap) {
  const parts = [];
  let current = entry;

  while (current) {
    if (current.title) {
      parts.unshift(current.title);
    }

    const parentId = getParentId(current);

    if (!parentId) {
      break;
    }

    current = entryMap.get(parentId);
  }

  return path.join(...parts);
}

/**
 * 로컬 업로드 asset 저장 위치 규칙
 *
 * public/uploads/projects/{projectId}/assets/{entryId}/{filename}
 *
 * 예:
 * public/uploads/projects/PROJECT_ID/assets/ENTRY_ID/my_image.png
 */
function getLocalAssetPath({ projectId, entry }) {
  return path.join(
    process.cwd(),
    'public',
    'uploads',
    'projects',
    normalizeId(projectId).toUpperCase(),
    'assets',
    getEntryId(entry).toUpperCase(),
    entry.title
  );
}

/**
 * 컴파일 workspace 내부에서 asset이 위치해야 하는 경로
 *
 * LaTeX에서 \includegraphics{images/my_image.png}를 쓰려면
 * workspace/images/my_image.png가 존재해야 한다.
 */
function getWorkspaceAssetPath({ workspacePath, entry, entryMap }) {
  const relativePath = getEntryRelativePath(entry, entryMap);
  return path.join(workspacePath, relativePath);
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

function resolveAssetPathFromUrl(assetUrl) {
  if (!assetUrl) return null;

  const cleanUrl = String(assetUrl)
    .split('?')[0]
    .replace(/^https?:\/\/[^/]+/i, '')
    .replace(/^\/+/, '');

  return path.join(process.cwd(), 'public', cleanUrl);
}

async function pathExists(filePath) {
  try {
    await fsPromises.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * 로컬 uploads에 저장된 이미지/바이너리 파일을
 * 컴파일 workspace 내부의 entry 경로로 복사한다.
 *
 * 기존 S3의 downloadProjectAssetsToWorkspace 역할을 대체한다.
 */
exports.copyProjectAssetsToWorkspace = async ({
  projectId,
  entries,
  workspacePath
}) => {
  if (!projectId || !Array.isArray(entries) || !workspacePath) {
    const err = new Error('MISSING_ASSET_COPY_PARAMS');
    err.statusCode = 400;
    throw err;
  }

  const entryMap = buildEntryMap(entries);
  const logs = [];

  for (const entry of entries) {
    if (!isAssetFile(entry)) {
      continue;
    }

    const assetUrl = getEntryAssetUrl(entry);

    const sourcePath = assetUrl
      ? resolveAssetPathFromUrl(assetUrl)
      : getLocalAssetPath({
      projectId,
      entry
    });
    /*
    const sourcePath = getLocalAssetPath({
      projectId,
      entry
    });
    */

    const targetPath = getWorkspaceAssetPath({
      workspacePath,
      entry,
      entryMap
    });

    const relativeAssetPath = getEntryRelativePath(entry, entryMap);

    if (!(await pathExists(sourcePath))) {
      logs.push(`[LOCAL ASSET] missing: ${relativeAssetPath}`);
      continue;
    }

    await fsPromises.mkdir(path.dirname(targetPath), {
      recursive: true
    });

    await fsPromises.copyFile(sourcePath, targetPath);

    logs.push(`[LOCAL ASSET] copied: ${relativeAssetPath}`);
  }

  return {
    copied: true,
    compileLog: logs.join('\n')
  };
};

/**
 * 기존 코드 호환용 alias
 *
 * 아직 manualCompileService / autoCompileService에서
 * downloadProjectAssetsToWorkspace 이름을 쓰고 있다면
 * 이 alias 덕분에 바로 깨지지 않는다.
 */
exports.downloadProjectAssetsToWorkspace = exports.copyProjectAssetsToWorkspace;

/**
 * 컴파일된 PDF를 public/compiled 아래에 저장하고,
 * 프론트에서 접근 가능한 URL을 반환한다.
 *
 * 기존 s3FileService.js의 로컬 저장 방식을 그대로 유지하되,
 * localFileService 안으로 이동한 버전.
 * 
 * 수정 : 기존 저장 위치인
 * public/compiled/{projectId}/{userId}/{fileId}.pdf
 * 에서 fileId 대신 컴파일 방식을 넣는 방식
 * public/compiled/{projectId}/{userId}/{compileType}.pdf
 * 으로 변경함
 */
exports.uploadCompiledPdf = async ({
  projectId,
  userId,
  fileId,
  pdfPath,
  compileType = 'manual'
}) => {
  if (!fs.existsSync(pdfPath)) {
    throw new Error(`PDF_NOT_FOUND: ${pdfPath}`);
  }

  const hexProjectId = normalizeId(projectId);
  const hexUserId = normalizeId(userId);

  const publicDir = path.join(
    process.cwd(),
    'public',
    'compiled',
    hexProjectId,
    hexUserId
  );

  await fsPromises.mkdir(publicDir, {
    recursive: true
  });

  const safeCompileType = compileType === 'auto' ? 'auto' : 'manual';
  const targetPath = path.join(publicDir, `${safeCompileType}.pdf`);

  await fsPromises.copyFile(pdfPath, targetPath);

  return `/compiled/${hexProjectId}/${hexUserId}/${safeCompileType}.pdf`;
};

exports.resolveCompiledPdfPath = (pdfUrl) => {
  if (!pdfUrl) {
    const err = new Error('PDF_URL_NOT_FOUND');
    err.statusCode = 404;
    throw err;
  }

  const cleanUrl = String(pdfUrl).split('?')[0];

  if (!cleanUrl.startsWith('/compiled/')) {
    const err = new Error('INVALID_PDF_URL');
    err.statusCode = 400;
    throw err;
  }

  const relativePath = cleanUrl.replace('/compiled/', '');

  const compiledBaseDir = path.resolve(
    process.cwd(),
    'public',
    'compiled'
  );

  const absolutePath = path.resolve(compiledBaseDir, relativePath);

  // path traversal 방지
  if (!absolutePath.startsWith(compiledBaseDir + path.sep)) {
    const err = new Error('INVALID_PDF_PATH');
    err.statusCode = 400;
    throw err;
  }

  if (!fs.existsSync(absolutePath)) {
    const err = new Error('PDF_FILE_NOT_FOUND');
    err.statusCode = 404;
    throw err;
  }

  return absolutePath;
};



const getCompiledBaseDir = () => {
    return path.resolve(process.cwd(), 'public', 'compiled');
};
/*
const safeResolveCompiledPathFromUrl = (pdfUrl) => {
    if (!pdfUrl) return null;

    const cleanUrl = String(pdfUrl).split('?')[0];

    if (!cleanUrl.startsWith('/compiled/')) {
        return null;
    }

    const relativePath = cleanUrl.replace('/compiled/', '');
    const compiledBaseDir = getCompiledBaseDir();
    const absolutePath = path.resolve(compiledBaseDir, relativePath);

    // path traversal 방지
    if (
        absolutePath !== compiledBaseDir &&
        !absolutePath.startsWith(compiledBaseDir + path.sep)
    ) {
        return null;
    }

    return absolutePath;
};
*/

const safeResolveCompiledPathFromUrl = (pdfUrl) => {
    if (!pdfUrl) return null;

    const cleanUrl = String(pdfUrl).split('?')[0];

    if (!cleanUrl.startsWith('/compiled/')) {
        return null;
    }

    const relativePath = cleanUrl.replace('/compiled/', '');

    // 빈 경로 또는 pdf가 아닌 경로 방지
    if (!relativePath || !relativePath.toLowerCase().endsWith('.pdf')) {
        return null;
    }

    const compiledBaseDir = getCompiledBaseDir();
    const absolutePath = path.resolve(compiledBaseDir, relativePath);

    if (!absolutePath.startsWith(compiledBaseDir + path.sep)) {
        return null;
    }

    return absolutePath;
};

/**
 * last_pdf_url이 가리키는 PDF 파일 삭제
 */
exports.deleteCompiledPdfByUrl = async (pdfUrl) => {
    const absolutePath = safeResolveCompiledPathFromUrl(pdfUrl);

    if (!absolutePath) {
        return {
            deleted: false,
            reason: 'INVALID_OR_EMPTY_PDF_URL'
        };
    }

    await fsPromises.rm(absolutePath, {
        force: true
    });

    return {
        deleted: true,
        path: absolutePath
    };
};

/**
 * 특정 프로젝트/유저의 compiled 폴더 전체 삭제
 * 예: public/compiled/{projectId}/{userId}
 */
exports.deleteProjectUserCompiledDir = async ({
    projectId,
    userId
}) => {
    const cleanProjectId = String(projectId || '')
        .replace(/^0x/i, '')
        .replace(/-/g, '')
        .toLowerCase()
        .trim();

    const cleanUserId = String(userId || '')
        .replace(/^0x/i, '')
        .replace(/-/g, '')
        .toLowerCase()
        .trim();

    if (!cleanProjectId || !cleanUserId) {
        return {
            deleted: false,
            reason: 'MISSING_PROJECT_OR_USER_ID'
        };
    }

    const compiledBaseDir = getCompiledBaseDir();

    const targetDir = path.resolve(
        compiledBaseDir,
        cleanProjectId,
        cleanUserId
    );

    if (
        targetDir !== compiledBaseDir &&
        !targetDir.startsWith(compiledBaseDir + path.sep)
    ) {
        return {
            deleted: false,
            reason: 'INVALID_COMPILED_DIR'
        };
    }

    await fsPromises.rm(targetDir, {
        recursive: true,
        force: true
    });

    return {
        deleted: true,
        path: targetDir
    };
};