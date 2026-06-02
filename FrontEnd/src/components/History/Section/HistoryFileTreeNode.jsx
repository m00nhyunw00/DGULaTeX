/**
 * =================================================================
 * [Component] History File Tree Node UI Component
 * 설명: 사용자 인터페이스 렌더링과 화면 상호작용을 담당함
 * =================================================================
 */
import React, { useState } from 'react';

/**
 * @param {Object} item - 노드 데이터
 * @param {number} depth - 트리 들여쓰기 깊이
 * @param {string} activeFileId - 현재 뷰어에 표시 중인 파일 ID
 * @param {Function} setActiveFileId - 파일 선택 변경 함수
 */
function HistoryFileTreeNode({
    item,
    depth = 0,
    activeFileId,
    setActiveFileId
}) {
    const isFolder = item.type === 'folder';
    const hasChildren = item.children && item.children.length > 0;
    const isActive = activeFileId === item.id;

    const [isOpen, setIsOpen] = useState(false);

    const handleClick = () => {
        if (isFolder) {
            setIsOpen(prev => !prev);
            return;
        }

        setActiveFileId(item.id);
    };

    return (
        <div className="tree-node-wrapper">
            <div
                className={`tree-item ${isActive ? 'active' : ''}`}
                style={{ paddingLeft: `${depth * 15 + 12}px` }}
                onClick={handleClick}
            >
                <span className="me-2 history-tree-toggle">
                    {isFolder
                        ? isOpen ? '▾' : '▸'
                        : '📄'}
                </span>

                <span className="me-2">
                    {isFolder ? '📁' : ''}
                </span>

                <span>{item.name}</span>

                {item.label && (
                    <span
                        className={`history-tree-label history-tree-label-${String(item.label).toLowerCase()}`}
                    >
                        {item.label}
                    </span>
                )}
            </div>

            {isFolder && isOpen && hasChildren && (
                <div className="node-children">
                    {item.children.map((child) => (
                        <HistoryFileTreeNode
                            key={child.id}
                            item={child}
                            depth={depth + 1}
                            activeFileId={activeFileId}
                            setActiveFileId={setActiveFileId}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

export default HistoryFileTreeNode;