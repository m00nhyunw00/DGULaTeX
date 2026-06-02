/**
 * =================================================================
 * [Component] History File Tree UI Component
 * 설명: 사용자 인터페이스 렌더링과 화면 상호작용을 담당함
 * =================================================================
 */
import React from 'react';
import HistoryFileTreeNode from './HistoryFileTreeNode.jsx';

/**
 * @param {Array} files - 선택된 히스토리 버전의 파일 리스트
 * @param {string} activeFileId - 현재 선택된 파일 ID
 * @param {Function} setActiveFileId - 파일 선택 변경 함수
 * @param {boolean} isLoading - 파일 구조 조회 중 여부
 * @param {string} error - 파일 구조 조회 실패 메시지
 */
function HistoryFileTreeUI({
    files,
    activeFileId,
    setActiveFileId,
    isLoading = false,
    error = ''
}) {
    return (
        <aside className="sidebar border-end text-white">
            <div className="p-2 border-bottom small text-white-50 bg-secondary">
                FILES IN THIS VERSION
            </div>

            <div className="file-tree-container py-2 overflow-auto">
                {isLoading ? (
                    <div className="p-3 text-center text-white-50 small">
                        파일 구조를 불러오는 중입니다...
                    </div>
                ) : error ? (
                    <div className="p-3 text-center text-danger small">
                        {error}
                    </div>
                ) : files && files.length > 0 ? (
                    files.map((file) => (
                        <HistoryFileTreeNode
                            key={file.id}
                            item={file}
                            activeFileId={activeFileId}
                            setActiveFileId={setActiveFileId}
                            depth={0}
                        />
                    ))
                ) : (
                    <div className="p-3 text-center text-white-50 small">
                        데이터가 없습니다.
                    </div>
                )}
            </div>
        </aside>
    );
}

export default HistoryFileTreeUI;