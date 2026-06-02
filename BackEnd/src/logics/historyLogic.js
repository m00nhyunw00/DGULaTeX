/**
 * =================================================================
 * [Logic] History Core Logic & Utilities
 * 설명: 버전 관리, Diff 알고리즘(LCS) 및 히스토리 데이터 연산을 처리함
 * =================================================================
 */
const historyLogic = {
    /**
     * 두 텍스트의 차이점을 분석하여 새로 추가되거나 수정된 라인의 번호(1-indexed)를 반환 (LCS 알고리즘)
     * @param {string} prevText 이전 버전 파일 본문
     * @param {string} currText 현재 버전 파일 본문
     * @returns {number[]} 변경/추가된 라인 번호 배열
     */
    getChangedLineNumbers: (prevText, currText) => {
        const prevLines = prevText ? prevText.split(/\r?\n/) : [];
        const currLines = currText ? currText.split(/\r?\n/) : [];
        
        const n = prevLines.length;
        const m = currLines.length;
        
        // DP 테이블 초기화
        const dp = Array(n + 1).fill(0).map(() => Array(m + 1).fill(0));
        
        for (let i = 1; i <= n; i++) {
            for (let j = 1; j <= m; j++) {
                if (prevLines[i - 1] === currLines[j - 1]) {
                    dp[i][j] = dp[i - 1][j - 1] + 1;
                } else {
                    dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
                }
            }
        }
        
        // 역추적(Backtracking)을 통해 현재 파일(currLines)에서 매칭된 라인 확인
        let i = n, j = m;
        const matchedIndices = new Set();
        
        while (i > 0 && j > 0) {
            if (prevLines[i - 1] === currLines[j - 1]) {
                matchedIndices.add(j - 1);
                i--;
                j--;
            } else if (dp[i - 1][j] >= dp[i][j - 1]) {
                i--;
            } else {
                j--;
            }
        }
        
        // 매칭되지 않은(새로 추가되거나 수정된) 라인의 번호 추출 (1-indexed)
        const changedLines = [];
        for (let k = 0; k < m; k++) {
            if (!matchedIndices.has(k)) {
                changedLines.push(k + 1);
            }
        }
        
        return changedLines;
    },

    /**
     * 두 버전의 파일 구조 스냅숏을 비교하여 변경 사항을 계산합니다.
     * @param {Array} currentRows 현재 버전 H(n)의 구조 데이터
     * @param {Array} prevRows 이전 버전 H(n-1)의 구조 데이터
     * @param {string} mode 'log' (히스토리 요약용) 또는 'label' (파일 트리 표시용)
     * @returns {Array} 변경 라벨이 포함된 파일 목록
     */
    compareProjectStructures: (currentRows, prevRows, mode = 'label') => {
        const currentMap = new Map(currentRows.map(r => [r.entry_id.toString('hex'), r]));
        const prevMap = new Map(prevRows.map(r => [r.entry_id.toString('hex'), r]));
        const results = [];
        const resultIds = new Set();

        const pushResult = (row) => {
            const id = row.entryId || row.entry_id?.toString('hex');
            if (!id) return;

            const existingIndex = results.findIndex((item) => item.entryId === id || item.entry_id?.toString('hex') === id);
            if (existingIndex >= 0) {
                const currentLabel = String(results[existingIndex].label || 'NONE').toUpperCase();
                const nextLabel = String(row.label || 'NONE').toUpperCase();

                if (currentLabel === 'NONE' && nextLabel !== 'NONE') {
                    results[existingIndex] = {
                        ...results[existingIndex],
                        ...row,
                        entryId: id
                    };
                }
                return;
            }

            resultIds.add(id);
            results.push(row);
        };

        const includeCurrentAncestors = (row) => {
            let parentId = row.parent_id ? row.parent_id.toString(hex) : null;

            while (parentId && !resultIds.has(parentId)) {
                const parent = currentMap.get(parentId);
                if (!parent) break;

                pushResult({
                    ...parent,
                    entryId: parentId,
                    label: NONE,
                    parentId: parent.parent_id ? parent.parent_id.toString(hex) : null
                });

                parentId = parent.parent_id ? parent.parent_id.toString(hex) : null;
            }
        };

        const includePreviousAncestors = (row) => {
            let parentId = row.parent_id ? row.parent_id.toString('hex') : null;

            while (parentId && !resultIds.has(parentId)) {
                const parent = prevMap.get(parentId);
                if (!parent) break;

                pushResult({
                    ...parent,
                    entryId: parentId,
                    label: 'NONE',
                    parentId: parent.parent_id ? parent.parent_id.toString('hex') : null
                });

                parentId = parent.parent_id ? parent.parent_id.toString('hex') : null;
            }
        };

        // H(n) 기준으로 루프 (EDITED, DELETED/ADDED, RENAMED, MOVED 감지)
        for (const [id, curr] of currentMap) {
            const prev = prevMap.get(id);
            if (prev) {
                const currHash = curr.content_id ? curr.content_id.toString('hex') : null;
                const prevHash = prev.content_id ? prev.content_id.toString('hex') : null;
                const currParentHex = curr.parent_id ? curr.parent_id.toString('hex') : null;
                const prevParentHex = prev.parent_id ? prev.parent_id.toString('hex') : null;

                const isContentSame = currHash === prevHash;
                const isNameChanged = curr.entry_name !== prev.entry_name;
                const isParentChanged = currParentHex !== prevParentHex;

                let label = 'NONE';
                if (isContentSame && isParentChanged && !isNameChanged) {
                    label = 'MOVED';
                } else if (isNameChanged) {
                    label = 'RENAMED';
                } else if (!isContentSame) {
                    label = 'EDITED';
                }

                pushResult({ ...curr, entryId: id, label });
            } else {
                // H(n)에는 있는데 H(n-1)에는 없는 경우
                const label = mode === 'log' ? 'CREATED' : 'ADDED';
                pushResult({ ...curr, entryId: id, label });
            }
        }

        // H(n-1) 기준으로 루프 (DELETED/REMOVED 감지)
        for (const [id, prev] of prevMap) {
            if (!currentMap.has(id)) {
                // H(n-1)에는 있는데 H(n)에는 없는 경우
                const label = mode === 'log' ? 'DELETED' : 'REMOVED';
                includePreviousAncestors(prev);
                pushResult({ 
                    ...prev, 
                    entryId: id, 
                    label,
                    parentId: prev.parent_id ? prev.parent_id.toString('hex') : null 
                });
            }
        }

        return results;
    }
};

module.exports = historyLogic;