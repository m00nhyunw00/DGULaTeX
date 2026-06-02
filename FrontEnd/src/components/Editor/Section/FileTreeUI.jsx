/**
 * =================================================================
 * [Component] File Tree UI Component
 * 설명: 사용자 인터페이스 렌더링과 화면 상호작용을 담당함
 * =================================================================
 */
import React, { useState, useRef } from 'react';
import FileTreeNode from './FileTreeNodeUI.jsx';

function FileTreeUI({ 
    files, 
    activeFileId, 
    //setActiveFileId, 
    handleOpenFile, 
    handleContextMenu, 
    handleMoveEntry,
    selectedIds,
    setSelectedIds,
    mainFileId,
    compileErrorEntryIds = [],
    editingNodeId,
    editNodeTitle,
    setEditNodeTitle,
    submitNodeRename,
    openCreateModal,
    openUploadModal
}) {
    const [dragOverId, setDragOverId] = useState(null);
    const [isRootDragOver, setIsRootDragOver] = useState(false);
    const dragCounter = useRef(0);

    const handleContainerClick = (e) => {
        if (setSelectedIds) setSelectedIds([]); 
    };

    const findNodeById = (nodes, id) => {
        if (!id) return null;

        for (const node of nodes || []) {
            const nodeId = String(node.id || node.fileId).toLowerCase();

            if (nodeId === String(id).toLowerCase()) {
                return node;
            }

            const found = findNodeById(node.children, id);
            if (found) return found;
        }

        return null;
    };

    const getToolbarParentId = () => {
        const selectedId = selectedIds?.[0] || activeFileId;
        const selectedNode = findNodeById(files, selectedId);

        if (!selectedNode) return null;

        if (selectedNode.type === 'folder') {
            return selectedNode.id || selectedNode.fileId;
        }

        return selectedNode.parentId || null;
    };

    const onNewFile = (e) => {
        e.stopPropagation();
        openCreateModal(false, getToolbarParentId());
    };

    const onNewFolder = (e) => {
        e.stopPropagation();
        openCreateModal(true, getToolbarParentId());
    };

    const onUpload = (e) => {
        e.stopPropagation();

        if (openUploadModal) {
            openUploadModal(getToolbarParentId());
        }
    };

    const onSidebarDragEnter = (e) => {
        e.preventDefault();
        dragCounter.current++;
        if (dragOverId === null) setIsRootDragOver(true);
    };

    const onSidebarDragOver = (e) => {
        e.preventDefault();
        if (dragOverId === null && !isRootDragOver) setIsRootDragOver(true);
        else if (dragOverId !== null && isRootDragOver) setIsRootDragOver(false);
    };

    const onSidebarDragLeave = (e) => {
        e.preventDefault();
        dragCounter.current--;
        if (dragCounter.current === 0) setIsRootDragOver(false);
    };

    const onSidebarDrop = (e) => {
        e.preventDefault();
        dragCounter.current = 0;
        setIsRootDragOver(false);
        setDragOverId(null);
        const jsonString = e.dataTransfer.getData("entryIdsJson");
        const singleId = e.dataTransfer.getData("entryId");
        let sendData = null;
        if (jsonString) {
            try { sendData = JSON.parse(jsonString); } catch (err) { sendData = singleId ? String(singleId).toLowerCase() : null; }
        } else { sendData = singleId ? String(singleId).toLowerCase() : null; }

        if (!sendData) return;
        if (dragOverId === null) {
            handleMoveEntry(sendData, null);
        }
    };

    return (
        <aside className={`sidebar border-end d-flex flex-column ${isRootDragOver ? 'drag-over-root' : ''}`} onDragEnter={onSidebarDragEnter} onDragOver={onSidebarDragOver} onDragLeave={onSidebarDragLeave} onDrop={onSidebarDrop}>
            <div className="file-tree-header p-2 border-bottom bg-light">
                <span className="file-tree-title fw-bold small text-muted">File tree</span>
                <div className="file-tree-actions">
                    <button className="file-tree-action-btn" title="새 파일" onClick={onNewFile}>📄<span className="file-tree-action-plus">+</span></button>
                    <button className="file-tree-action-btn" title="새 폴더" onClick={onNewFolder}>📁<span className="file-tree-action-plus">+</span></button>
                    <button className="file-tree-action-btn" title="업로드" onClick={onUpload}>📤</button>
                </div>
            </div>

            <div className="file-tree-container py-2 flex-grow-1 overflow-auto" onClick={handleContainerClick}>
                {files && files.length > 0 ? (
                    files.map((file) => (
                        <FileTreeNode 
                            key={file.id} 
                            item={file} 
                            activeFileId={activeFileId} 
                            //setActiveFileId={setActiveFileId} 
                            handleOpenFile={handleOpenFile} 
                            handleContextMenu={handleContextMenu} 
                            handleMoveEntry={handleMoveEntry} 
                            depth={0} 
                            dragOverId={dragOverId} 
                            setDragOverId={setDragOverId} 
                            selectedIds={selectedIds} 
                            setSelectedIds={setSelectedIds} 
                            mainFileId={mainFileId}
                            compileErrorEntryIds={compileErrorEntryIds}
                            // 🎯 [전달]
                            editingNodeId={editingNodeId}
                            editNodeTitle={editNodeTitle}
                            setEditNodeTitle={setEditNodeTitle}
                            submitNodeRename={submitNodeRename}
                        />
                    ))
                ) : (
                    <div className="p-3 text-center text-muted small">파일이 없습니다.</div>
                )}
            </div>
        </aside>
    );
}

export default FileTreeUI;