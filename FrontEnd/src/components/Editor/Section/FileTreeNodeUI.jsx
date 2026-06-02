/**
 * =================================================================
 * [Component] File Tree Node UI Component
 * 설명: 사용자 인터페이스 렌더링과 화면 상호작용을 담당함
 * =================================================================
 */
import React, { useState } from 'react';

function FileTreeNode({ 
    item, 
    activeFileId, 
    setActiveFileId, 
    handleOpenFile, 
    handleContextMenu, 
    handleMoveEntry, 
    depth,
    dragOverId, 
    setDragOverId,
    selectedIds,
    setSelectedIds,
    mainFileId,
    compileErrorEntryIds = [],
    editingNodeId,
    editNodeTitle,
    setEditNodeTitle,
    submitNodeRename
}) {
    const [isOpen, setIsOpen] = useState(false);

    const currentId = String(item.fileId || item.id).trim().toLowerCase();
    const currentName = item.fileName || item.title || item.name || '이름 없음';
    const isFolder = item.type === 'folder';
    const isSelected = selectedIds.map(id => String(id).toLowerCase()).includes(currentId);
    const isCurrentItemMain = mainFileId && currentId === String(mainFileId).trim().toLowerCase();
    const hasCompileError = compileErrorEntryIds.map(id => String(id).replace(/-/g, '').toLowerCase()).includes(currentId.replace(/-/g, ''));

    const onDragStart = (e) => {
        e.stopPropagation();
        if (isSelected && selectedIds.length > 1) {
            const cleanIds = selectedIds.map(id => String(id).toLowerCase());
            e.dataTransfer.setData("entryIdsJson", JSON.stringify(cleanIds));
            e.dataTransfer.setData("entryId", currentId); 
        } else {
            e.dataTransfer.setData("entryId", currentId);
        }
    };

    const handleDragOverAction = (e) => {
        e.preventDefault(); e.stopPropagation();
        const targetHighlightId = isFolder ? currentId : (item.parentId ? String(item.parentId).toLowerCase() : null);
        setDragOverId(targetHighlightId);
    };

    const onDragLeave = (e) => {
        e.preventDefault(); e.stopPropagation();
        setDragOverId(null);
    };

    const onDrop = (e) => {
        e.preventDefault(); e.stopPropagation();
        setDragOverId(null);
        const targetParentId = isFolder ? currentId : (item.parentId ? String(item.parentId).toLowerCase() : null);
        const jsonString = e.dataTransfer.getData("entryIdsJson");
        const singleId = e.dataTransfer.getData("entryId");
        let sendData = null;
        if (jsonString) {
            try { sendData = JSON.parse(jsonString); } catch (err) { sendData = singleId ? [String(singleId).toLowerCase()] : []; }
        } else { sendData = singleId ? String(singleId).toLowerCase() : null; }
        if (!sendData || sendData.length === 0) return;
        if (Array.isArray(sendData)) {
            if (sendData.includes(targetParentId)) return;
            if (sendData.includes(currentId) && isFolder) return; 
        } else {
            if (sendData === currentId || sendData === targetParentId) return;
        }
        handleMoveEntry(sendData, targetParentId);
    };

    const handleClick = (e) => {
        e.stopPropagation();
        // 만약 현재 노드가 편집 중이라면 클릭 이벤트를 무시합니다 (방해 방지)
        if (editingNodeId === currentId) return;

        const isMultiSelectKey = e.ctrlKey || e.metaKey;
        if (isMultiSelectKey) {
            setSelectedIds(prev => {
                const cleanPrev = prev.map(id => String(id).toLowerCase());
                return cleanPrev.includes(currentId) ? cleanPrev.filter(id => id !== currentId) : [...cleanPrev, currentId];
            });
        } else {
            setSelectedIds([currentId]);
            if (isFolder) {
                setIsOpen(!isOpen); 
            }
            else {
                if (handleOpenFile) handleOpenFile(currentId);
                else setActiveFileId(currentId); 
            }
        }
    };

    const onRightClick = (e) => {
        if (!isSelected) setSelectedIds([currentId]);
        handleContextMenu(e, item);
    };

    const getIcon = () => {
        const lowerName = currentName.toLowerCase();

        if (isFolder) return isOpen ? '📂' : '📁';
        if (isCurrentItemMain) return '👑'; 
        if (lowerName.endsWith('.tex')) return '📝';
        if (lowerName.endsWith('.pdf')) return '📕';

        if (
            lowerName.endsWith('.png') ||
            lowerName.endsWith('.jpg') ||
            lowerName.endsWith('.jpeg') ||
            lowerName.endsWith('.gif') ||
            lowerName.endsWith('.webp') ||
            lowerName.endsWith('.svg')
        ) {
            return '🖼️';
        }

        return '📄';
    };

    const renderChevron = () => {
        if (!isFolder) return <span style={{ minWidth: '12px', display: 'inline-block' }}></span>;
        return (
            <span style={{ 
                display: 'inline-block', minWidth: '12px', fontSize: '0.6rem', transition: 'transform 0.2s',
                transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)', marginRight: '4px', color: '#666'
            }}>▶</span>
        );
    };

    return (
        <div className="tree-node-wrapper" draggable={true} onDragStart={onDragStart} onDragEnter={handleDragOverAction} onDragOver={handleDragOverAction} onDragLeave={onDragLeave} onDrop={onDrop}>
            <div className={`tree-item ${String(activeFileId).toLowerCase() === currentId ? 'active' : ''} ${dragOverId === currentId ? 'drag-over' : ''} ${isSelected ? 'selected' : ''} ${hasCompileError ? 'compile-error' : ''}`} style={{ paddingLeft: `${depth * 15 + 10}px`, cursor: 'pointer', display: 'flex', alignItems: 'center' }} onClick={handleClick} onContextMenu={onRightClick}>
                {renderChevron()}
                <span className="me-2" style={{ minWidth: '22px', textAlign: 'center' }}>{getIcon()}</span>
                
                {/* 🎯 [핵심 로직] 편집 모드일 때 인풋 창 렌더링, 아니면 텍스트 렌더링 */}
                {editingNodeId === currentId ? (
                    <input
                        type="text"
                        className="form-control form-control-sm shadow-none inline-tree-input"
                        value={editNodeTitle}
                        onChange={(e) => setEditNodeTitle(e.target.value)}
                        onFocus={(e) => {
                            // 편집 시작 시 확장자 이전 텍스트만 드래그되도록 처리 (스마트 UX)
                            const dotIndex = e.target.value.lastIndexOf('.');
                            e.target.setSelectionRange(0, dotIndex > -1 && !isFolder ? dotIndex : e.target.value.length);
                        }}
                        autoFocus
                        onClick={(e) => e.stopPropagation()} // 더블클릭 및 부모 클릭 무시
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') submitNodeRename(currentId, editNodeTitle, isFolder);
                            // ESC를 누르면 빈 문자열을 전달하여 취소 로직(원래 이름 복구) 발동
                            if (e.key === 'Escape') submitNodeRename(currentId, currentName, isFolder);
                        }}
                        onBlur={() => submitNodeRename(currentId, editNodeTitle, isFolder)} // 바깥 클릭 시 저장
                    />
                ) : (
                    <span className={`file-name ${hasCompileError ? 'compile-error-name' : isFolder ? 'fw-bold text-dark' : isCurrentItemMain ? 'fw-bold text-primary' : 'text-secondary'}`} style={{ fontSize: '0.9rem' }}>
                        {currentName}
                    </span>
                )}
            </div>

            {isFolder && isOpen && item.children?.length > 0 && (
                <div className="tree-children">
                    {item.children.map((child) => (
                        <FileTreeNode 
                            key={child.id || child.fileId} 
                            item={child} 
                            activeFileId={activeFileId} 
                            setActiveFileId={setActiveFileId} 
                            handleOpenFile={handleOpenFile} 
                            handleContextMenu={handleContextMenu} 
                            handleMoveEntry={handleMoveEntry} 
                            depth={depth + 1} 
                            dragOverId={dragOverId} 
                            setDragOverId={setDragOverId} 
                            selectedIds={selectedIds} 
                            setSelectedIds={setSelectedIds} 
                            mainFileId={mainFileId}
                            compileErrorEntryIds={compileErrorEntryIds}
                            // 🎯 재귀 파이프라인
                            editingNodeId={editingNodeId}
                            editNodeTitle={editNodeTitle}
                            setEditNodeTitle={setEditNodeTitle}
                            submitNodeRename={submitNodeRename}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

export default FileTreeNode;