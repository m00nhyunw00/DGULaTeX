/**
 * =================================================================
 * [Utility] Entry Tree Builder
 * 설명: 평면 엔트리 목록을 에디터 파일 트리 구조로 변환함
 * =================================================================
 */
const compareEntries = (a, b) => {
    if (a.type === 'folder' && b.type !== 'folder') return -1;
    if (a.type !== 'folder' && b.type === 'folder') return 1;
    return a.name.localeCompare(b.name, undefined, {
        numeric: true,
        sensitivity: 'base'
    });
};

export const buildFileTree = (flatEntries) => {
    if (!flatEntries || !Array.isArray(flatEntries)) return [];

    const map = {};
    const roots = [];

    // 1. 맵 생성 (모든 필드 보존 및 ID 대소문자 소문자로 일괄 정규화)
    flatEntries.forEach(item => {
        let id = item.fileId || item.id;
        if (!id) return;
        
        id = String(id).trim().toLowerCase();
        
        let pId = item.parentId || item.parent_id || null;
        if (pId && pId !== 'null' && pId !== 'undefined') {
            pId = String(pId).trim().toLowerCase();
        } else {
            pId = null;
        }
        
        // [오염 차단 패치] ...item을 풀 때 유입되는 대문자 parent_id를 완전히 덮어써서 제거합니다.
        map[id] = {
            ...item,
            id: id,
            fileId: id,
            parentId: pId,
            parent_id: pId, // ◀ 백엔드/프론트엔드 명세가 엇갈려도 둘 다 소문자를 보도록 이중 가드
            name: item.fileName || item.title,
            type: (item.isFolder || item.is_folder || item.type === 'folder') ? 'folder' : 'file',
            children: []
        };
    });

    // 2. 부모-자식 연결 (소문자 맵핑 안전 연산)
    flatEntries.forEach(item => {
        let currentId = item.fileId || item.id;
        if (!currentId) return;
        
        currentId = String(currentId).trim().toLowerCase();
        const node = map[currentId];
        if (!node) return;

        const pId = node.parentId; 

        // 맵에 부모 ID가 완벽하게 등록되어 있는지 검증
        if (pId && map[pId]) {
            map[pId].children.push(node);
        } else {
            roots.push(node);
        }
    });

    // 3. 재귀적 정렬
    const sortRecursively = (nodes) => {
        nodes.sort(compareEntries);
        nodes.forEach(node => {
            if (node.children && node.children.length > 0) {
                sortRecursively(node.children);
            }
        });
    };

    sortRecursively(roots);
    return roots;
};