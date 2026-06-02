/**
 * =================================================================
 * [Component] Editor Workspace UI
 * 설명: 파일 트리, Monaco 편집기, AI 채팅, PDF 미리보기를 포함한 편집 화면 레이아웃을 렌더링함
 * =================================================================
 */
import React, { useState, useEffect, useRef } from 'react';
import FileTreeUI from './Section/FileTreeUI.jsx';
import MonacoEditorUI from './Section/MonacoEditorUI.jsx';
import ImageViewerUI from './Section/ImageViewerUI.jsx';
import PreviewUI from './Section/PreviewUI.jsx';
import AIChatUI from './Section/AIChatUI.jsx'; 
import MemberModal from './Section/MemberModal.jsx';
import ShareModal from './Section/ShareModal.jsx';
import './EditorUI.css';
import '../Common.css';

function EditorUI(props) {
    const { 
        handleRenameEntry, 
        handleDeleteEntry, 
        handleSetMainDocument, 
        mainFileId,            
        handleCreateEntry,
        handleOpenFile, 
        activeFileId,
        setActiveFileId, 
        selectedIds,
        setSelectedIds,
        pdfUrl,
        compileLog,
        compileErrorEntryIds,
        isCompiling,
        compileEngine,
        setCompileEngine,
        handleManualCompile,
        fileContent,
        //setFileContent,
        isFileContentLoaded,
        handleUpload,
        handleDownloadFile,
        activeFileKind,
        activeFileMeta,
        activeImageUrl,
        projectMembers,
        isMembersLoading,
        membersError,
        refreshProjectMembers,
        flushSaveCurrentFile,
        flushCurrentFileBeforeLeave,
        createInviteCode,
        updateProjectMemberRole,
        removeProjectMember,
        handleProjectJoinRequest,
        joinRequests,
        isJoinRequestsLoading,
        joinRequestsError,
        refreshJoinRequests,
        compileErrorModal,
        setCompileErrorModal,
    } = props;

    const layoutRef = useRef(null);
    const fileUploadInputRef = useRef(null);
    const folderUploadInputRef = useRef(null);

    const [panelSizes, setPanelSizes] = useState({
        fileTree: 300,
        preview: 700
    });

    const MIN_FILE_TREE_WIDTH = 200;
    const MIN_EDITOR_WIDTH = 420;
    const MIN_PREVIEW_WIDTH = 320;

    const [editingNodeId, setEditingNodeId] = useState(null);
    const [editNodeTitle, setEditNodeTitle] = useState('');

    const [treeModal, setTreeModal] = useState({
        isOpen: false,
        type: '',
        targetId: null,
        parentId: null,
        inputValue: ''
    });

    const [uploadModal, setUploadModal] = useState({
        isOpen: false,
        parentId: null
    });

    const [isMemberModalOpen, setIsMemberModalOpen] = useState(false);
    const [isShareModalOpen, setIsShareModalOpen] = useState(false);

    const runAfterSave = async (callback) => {
        if (flushCurrentFileBeforeLeave) {
            await flushCurrentFileBeforeLeave();
        }

        if (callback) {
            callback();
        }
    };

    const handleResizeStart = (target, startEvent) => {
        startEvent.preventDefault();
        startEvent.stopPropagation();

        const startX = startEvent.clientX;
        const startFileTreeWidth = panelSizes.fileTree;
        const startPreviewWidth = panelSizes.preview;

        const handleMouseMove = (moveEvent) => {
            const layoutWidth = layoutRef.current?.getBoundingClientRect().width || window.innerWidth;
            const deltaX = moveEvent.clientX - startX;

            if (target === 'fileTree') {
                const nextFileTreeWidth = Math.max(
                    MIN_FILE_TREE_WIDTH,
                    startFileTreeWidth + deltaX
                );

                const maxFileTreeWidth = layoutWidth - startPreviewWidth - MIN_EDITOR_WIDTH;

                setPanelSizes(prev => ({
                    ...prev,
                    fileTree: Math.min(nextFileTreeWidth, maxFileTreeWidth)
                }));
            }

            if (target === 'preview') {
                const nextPreviewWidth = Math.max(
                    MIN_PREVIEW_WIDTH,
                    startPreviewWidth - deltaX
                );

                const maxPreviewWidth = layoutWidth - startFileTreeWidth - MIN_EDITOR_WIDTH;

                setPanelSizes(prev => ({
                    ...prev,
                    preview: Math.min(nextPreviewWidth, maxPreviewWidth)
                }));
            }
        };

        const handleMouseUp = () => {
            document.body.classList.remove('is-resizing-layout');
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };

        document.body.classList.add('is-resizing-layout');
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
    };

    useEffect(() => {
        const handleKeyDown = (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
                e.preventDefault(); 
                if (handleManualCompile) handleManualCompile();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleManualCompile]);

    const [contextMenu, setContextMenu] = useState({
        visible: false,
        x: 0,
        y: 0,
        targetItem: null
    });

    const handleContextMenu = (e, item) => {
        e.preventDefault();
        setContextMenu({
            visible: true,
            x: e.pageX,
            y: e.pageY,
            targetItem: item
        });
    };

    const handleGlobalClick = () => {
        setContextMenu({ ...contextMenu, visible: false });
        if (setSelectedIds) setSelectedIds([]);
    };

    const onRename = () => {
        setContextMenu({ ...contextMenu, visible: false });
        const targetId = contextMenu.targetItem.id || contextMenu.targetItem.fileId;
        const currentName = contextMenu.targetItem.name || contextMenu.targetItem.title;
        setEditingNodeId(targetId);
        setEditNodeTitle(currentName);
    };

    const submitNodeRename = (id, newName, isFolder) => {
        let finalName = newName.trim();

        if (finalName && finalName !== (contextMenu.targetItem?.name || contextMenu.targetItem?.title)) {
            if (!isFolder && !finalName.includes('.')) {
                finalName += '.tex';
            }

            handleRenameEntry(id, finalName);
        }

        setEditingNodeId(null);
    };

    const onDelete = () => {
        if (isDeleteBlockedByMainDocument) return;

        setContextMenu({ ...contextMenu, visible: false });

        const targetId = contextMenu.targetItem.id || contextMenu.targetItem.fileId;
        const deleteTargets = selectedIds.length > 1 ? selectedIds : [targetId];
        
        setTreeModal({
            isOpen: true,
            type: 'delete',
            targetId: deleteTargets,
            parentId: null,
            inputValue: ''
        });
    };

    const onCreate = (isFolder) => {
        setContextMenu({ ...contextMenu, visible: false });

        const targetItem = contextMenu.targetItem;
        const parentId = (targetItem.type === 'folder' || targetItem.isFolder || targetItem.is_folder)
            ? (targetItem.id || targetItem.fileId)
            : targetItem.parentId;
                         
        openCreateModal(isFolder, parentId);
    };

    const openCreateModal = (isFolder, parentId = null) => {
        setTreeModal({
            isOpen: true,
            type: isFolder ? 'create_folder' : 'create_file',
            targetId: null,
            parentId,
            inputValue: isFolder ? '새 폴더' : '.tex'
        });
    };

    const onUpload = () => {
        setContextMenu({ ...contextMenu, visible: false });

        const targetItem = contextMenu.targetItem;

        const parentId = (targetItem.type === 'folder' || targetItem.isFolder || targetItem.is_folder)
            ? (targetItem.id || targetItem.fileId)
            : targetItem.parentId;

        openUploadModal(parentId);
    };


    const onDownload = () => {
        setContextMenu({ ...contextMenu, visible: false });

        const targetId = contextMenu.targetItem?.id || contextMenu.targetItem?.fileId;

        const fileName =
            contextMenu.targetItem?.fileName ||
            contextMenu.targetItem?.title ||
            contextMenu.targetItem?.name ||
            "download";

        if (!targetId) return;

        if (handleDownloadFile) {
            handleDownloadFile(targetId, fileName);
        }
    };

    const cleanId = (id) => {
        if (!id || id === 'null' || id === 'undefined') return null;
        return String(id).replace(/-/g, '').trim().toLowerCase();
    };

    const openUploadModal = (parentId = null) => {
        setUploadModal({
            isOpen: true,
            parentId: cleanId(parentId)
        });
    };

    const closeUploadModal = () => {
        setUploadModal({
            isOpen: false,
            parentId: null
        });
    };

    const openFileUploadPicker = () => {
        if (fileUploadInputRef.current) {
            fileUploadInputRef.current.value = '';
            fileUploadInputRef.current.click();
        }
    };

    const openFolderUploadPicker = () => {
        if (folderUploadInputRef.current) {
            folderUploadInputRef.current.value = '';
            folderUploadInputRef.current.click();
        }
    };

    const buildUploadFormData = (fileList, uploadType) => {
        const selectedFiles = Array.from(fileList || []);

        if (selectedFiles.length === 0) return null;

        const formData = new FormData();

        selectedFiles.forEach((file) => {
            formData.append('files', file);
        });

        const paths = selectedFiles.map((file) => {
            if (uploadType === 'folder') {
                return file.webkitRelativePath || file.name;
            }

            return file.name;
        });

        formData.append('paths', JSON.stringify(paths));

        if (uploadModal.parentId) {
            formData.append('parentId', uploadModal.parentId);
        }

        return formData;
    };

    const handleUploadInputChange = async (e, uploadType) => {
        const formData = buildUploadFormData(e.target.files, uploadType);

        closeUploadModal();

        if (!formData) return;

        if (handleUpload) {
            await handleUpload(formData);
        }
    };

    const handleTreeModalConfirm = () => {
        if (treeModal.type === 'delete') {
            handleDeleteEntry(treeModal.targetId);
        } else {
            let title = treeModal.inputValue.trim();

            if (title) {
                const isFolder = treeModal.type === 'create_folder';
                if (!isFolder && !title.includes('.')) title += '.tex';

                handleCreateEntry(title, isFolder, treeModal.parentId);
            }
        }

        setTreeModal({ ...treeModal, isOpen: false });
    };

    const onSetMain = () => {
        setContextMenu({ ...contextMenu, visible: false });

        const targetFileId = contextMenu.targetItem.id || contextMenu.targetItem.fileId;

        if (handleSetMainDocument) handleSetMainDocument(targetFileId);
    };

    const isMultiSelect = selectedIds.length > 1;

    /*
    const handleInternalEditorChange = (value) => {
        if (setFileContent) setFileContent(value || '');
    };
    */

    const clickedFileId = contextMenu.targetItem
        ? String(contextMenu.targetItem.id || contextMenu.targetItem.fileId).replace(/-/g, '').trim().toLowerCase()
        : '';

    const currentMainId = String(mainFileId).replace(/-/g, '').trim().toLowerCase();

    const isClickedItemAlreadyMain = clickedFileId && currentMainId
        ? clickedFileId === currentMainId
        : false;

    const normalizedSelectedIds = selectedIds.map(id => cleanId(id)).filter(Boolean);
    const isDeleteBlockedByMainDocument = isMultiSelect
        ? Boolean(currentMainId && normalizedSelectedIds.includes(currentMainId))
        : Boolean(isClickedItemAlreadyMain);

    const clickedFileName =
        contextMenu.targetItem?.fileName ||
        contextMenu.targetItem?.title ||
        contextMenu.targetItem?.name ||
        '';

    const isTexFile = clickedFileName.toLowerCase().endsWith('.tex');

    return (
        <div className="full-layout" onClick={handleGlobalClick}>
            <input
                ref={fileUploadInputRef}
                type="file"
                multiple
                style={{ display: 'none' }}
                onChange={(e) => handleUploadInputChange(e, 'file')}
            />

            <input
                ref={folderUploadInputRef}
                type="file"
                multiple
                webkitdirectory="true"
                directory="true"
                style={{ display: 'none' }}
                onChange={(e) => handleUploadInputChange(e, 'folder')}
            />
            <nav className="navbar navbar-dark top-nav-fixed shadow-sm">
                <div className="d-flex align-items-center">
                    {/* <button className="btn btn-sm nav-back-btn" onClick={props.backToDashboard}> */}
                    <button
                        className="btn btn-sm nav-back-btn"
                        onClick={() => runAfterSave(props.backToDashboard)}
                    >
                        <span className="nav-arrow">&larr;</span>
                    </button>
                    <div className="project-title-divider">{props.projectName}</div>
                </div>

                {/* <div className="d-flex align-items-center gap-3 ms-auto">
                    <button className="btn btn-sm btn-history-custom px-3 py-1 fw-bold" onClick={props.goToHistory}>
                        🕒 History
                    </button>
                    <span className="text-white-50 small">
                        <strong className="text-dgu">{props.userName}</strong>님
                    </span>
                    <button className="btn btn-sm btn-outline-light px-3" onClick={props.handleLogout}>
                        로그아웃
                    </button>
                </div> */}

                {/* <div className="d-flex align-items-center gap-3 ms-auto">
                    <button className="btn btn-sm btn-share-custom px-3 py-1 fw-bold">
                        공유하기
                    </button>

                    <button className="btn btn-sm btn-members-custom px-3 py-1 fw-bold">
                        멤버
                    </button>

                    <button className="btn btn-sm btn-history-custom px-3 py-1 fw-bold" onClick={props.goToHistory}>
                        🕒 History
                    </button>

                    <span className="text-white-50 small">
                        <strong className="text-dgu">{props.userName}</strong>님
                    </span>

                    <button className="btn btn-sm btn-outline-light px-3" onClick={props.handleLogout}>
                        로그아웃
                    </button>
                </div> */}


                <div className="d-flex align-items-center gap-3 ms-auto">
                    {props.isProjectOwner && (
                        <button
                            className="btn btn-sm btn-share-custom px-3 py-1 fw-bold"
                            onClick={() => runAfterSave(() => setIsShareModalOpen(true))}
                        >
                            공유하기
                        </button>
                    )}

                    <button 
                        className="btn btn-sm btn-members-custom px-3 py-1 fw-bold"
                        onClick={() => runAfterSave(() => {
                            setIsMemberModalOpen(true);
                            if (refreshProjectMembers) refreshProjectMembers();
                            if (refreshJoinRequests) refreshJoinRequests();
                        })}
                                            >
                        멤버
                    </button>

                    <button className="btn btn-sm btn-history-custom px-3 py-1 fw-bold" onClick={() => runAfterSave(props.goToHistory)}>
                        🕒 History
                    </button>

                    <span className="text-white-50 small">
                        <strong className="text-dgu">{props.userName}</strong>님
                    </span>

                    <button className="btn btn-sm btn-outline-light px-3" onClick={() => runAfterSave(props.handleLogout)}>
                        로그아웃
                    </button>
                </div>

            </nav>

            <div className="main-content d-flex" ref={layoutRef}>
                <div
                    className="file-tree-resizable-panel"
                    style={{
                        width: `${panelSizes.fileTree}px`,
                        minWidth: `${MIN_FILE_TREE_WIDTH}px`
                    }}
                >
                    <FileTreeUI 
                        files={props.files}
                        activeFileId={activeFileId}
                        //setActiveFileId={setActiveFileId} 
                        handleOpenFile={handleOpenFile} 
                        handleContextMenu={handleContextMenu} 
                        handleCreateEntry={handleCreateEntry}
                        handleMoveEntry={props.handleMoveEntry}
                        selectedIds={selectedIds}
                        setSelectedIds={setSelectedIds}
                        mainFileId={mainFileId}
                        compileErrorEntryIds={compileErrorEntryIds}
                        editingNodeId={editingNodeId}
                        editNodeTitle={editNodeTitle}
                        setEditNodeTitle={setEditNodeTitle}
                        submitNodeRename={submitNodeRename}
                        openCreateModal={openCreateModal} 
                        openUploadModal={openUploadModal}
                    />
                </div>

                <div 
                    className="resize-handle"
                    onMouseDown={(e) => handleResizeStart('fileTree', e)}
                />

                {/* <div className="editor-resizable-panel">
                    <MonacoEditorUI 
                        activeFileId={activeFileId}
                        fileContent={fileContent}
                        isFileContentLoaded={isFileContentLoaded}
                        //setFileContent={setFileContent}
                        //onEditorChange={handleInternalEditorChange}
                        handleManualCompile={handleManualCompile}
                        editorOptions={props.editorOptions}
                        handleEditorDidMount={props.handleEditorDidMount}
                        insertSnippet={props.insertSnippet}
                    />
                </div> */}

                <div className="editor-resizable-panel">
                    {activeFileKind === 'image' ? (
                        <ImageViewerUI
                            activeFileId={activeFileId}
                            fileName={activeFileMeta?.name}
                            imageUrl={activeImageUrl}
                            isFileContentLoaded={isFileContentLoaded}
                        />
                    ) : (
                        <MonacoEditorUI 
                            activeFileId={activeFileId}
                            fileContent={fileContent}
                            isFileContentLoaded={isFileContentLoaded}
                            handleManualCompile={handleManualCompile}
                            editorOptions={props.editorOptions}
                            handleEditorDidMount={props.handleEditorDidMount}
                            insertSnippet={props.insertSnippet}
                            readOnly={props.isViewerMode}
                        />
                    )}
                </div>

                <div 
                    className="resize-handle"
                    onMouseDown={(e) => handleResizeStart('preview', e)}
                />

                <div
                    className="preview-resizable-panel"
                    style={{
                        width: `${panelSizes.preview}px`,
                        minWidth: `${MIN_PREVIEW_WIDTH}px`
                    }}
                >
                    <PreviewUI 
                        pdfUrl={pdfUrl}
                        compileLog={compileLog}
                        isCompiling={isCompiling}
                        handleManualCompile={handleManualCompile}
                        compileEngine={compileEngine}
                        setCompileEngine={setCompileEngine}
                        isAutoCompile={props.isAutoCompile || false}
                        toggleAutoCompile={props.toggleAutoCompile}
                        onCompile={props.onCompile}
                        onDownload={props.onDownload}
                    />
                </div>
            </div>

            {contextMenu.visible && (
                <ul
                    className="dropdown-menu show shadow-sm border custom-ctx-menu"
                    style={{
                        position: 'fixed',
                        top: contextMenu.y,
                        left: contextMenu.x,
                        zIndex: 3000
                    }}
                >
                    {isMultiSelect ? (
                        !isDeleteBlockedByMainDocument && (
                            <li>
                                <button className="dropdown-item py-2 text-danger fw-bold" onClick={onDelete}>
                                    Delete {selectedIds.length} items
                                </button>
                            </li>
                        )
                    ) : (
                        <>
                            <li>
                                <button className="dropdown-item py-2" onClick={onRename}>
                                    Rename
                                </button>
                            </li>

                            {contextMenu.targetItem?.type !== 'folder' && (
                                <>
                                    <li>
                                        <button className="dropdown-item py-2" onClick={onDownload}>
                                            Download
                                        </button>
                                    </li>

                                    {!isClickedItemAlreadyMain && isTexFile && (
                                        <>
                                            <li className="dropdown-divider"></li>
                                            <li>
                                                <button className="dropdown-item py-2 fw-bold text-primary" onClick={onSetMain}>
                                                    👑 Set as main document
                                                </button>
                                            </li>
                                        </>
                                    )}
                                </>
                            )}

                            <li className="dropdown-divider"></li>

                            {!isDeleteBlockedByMainDocument && (
                                <li>
                                    <button className="dropdown-item py-2 text-danger" onClick={onDelete}>
                                        Delete
                                    </button>
                                </li>
                            )}

                            <li className="dropdown-divider"></li>

                            <li>
                                <button className="dropdown-item py-2" onClick={() => onCreate(false)}>
                                    New file
                                </button>
                            </li>

                            <li>
                                <button className="dropdown-item py-2" onClick={() => onCreate(true)}>
                                    New folder
                                </button>
                            </li>

                            <li>
                                <button className="dropdown-item py-2" onClick={onUpload}>
                                    Upload
                                </button>
                            </li>
                        </>
                    )}
                </ul>
            )}

            <AIChatUI {...props.chatLogic} />

            {treeModal.isOpen && (
                <div className="custom-modal-overlay">
                    <div className="modal-content-box shadow-lg animate__animated animate__zoomIn">
                        <h5 className="fw-bold mb-3">
                            {treeModal.type === 'delete'
                                ? '삭제 확인'
                                : treeModal.type === 'create_folder'
                                    ? '새 폴더 생성'
                                    : '새 파일 생성'}
                        </h5>
                        
                        {treeModal.type === 'delete' ? (
                            <p className="text-muted mb-4">
                                {Array.isArray(treeModal.targetId) && treeModal.targetId.length > 1
                                    ? `선택한 ${treeModal.targetId.length}개의 항목을 삭제하시겠습니까?`
                                    : '선택한 항목을 삭제하시겠습니까?'}
                                <br />
                                <span className="text-danger small">삭제 시 복구가 불가능합니다.</span>
                            </p>
                        ) : (
                            <div className="mb-4">
                                <input 
                                    type="text" 
                                    className="form-control shadow-none border-primary" 
                                    value={treeModal.inputValue}
                                    onChange={(e) => setTreeModal({
                                        ...treeModal,
                                        inputValue: e.target.value
                                    })}
                                    onFocus={(e) => e.target.select()}
                                    onKeyDown={(e) => e.key === 'Enter' && handleTreeModalConfirm()}
                                    autoFocus
                                />
                            </div>
                        )}
                        
                        <div className="d-flex justify-content-center gap-2">
                            <button
                                className="btn btn-light px-4"
                                onClick={() => setTreeModal({ ...treeModal, isOpen: false })}
                            >
                                취소
                            </button>

                            <button
                                className={`btn px-4 ${treeModal.type === 'delete' ? 'btn-danger' : 'btn-primary'}`}
                                onClick={handleTreeModalConfirm}
                            >
                                확인
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {uploadModal.isOpen && (
                <div className="custom-modal-overlay">
                    <div className="modal-content-box shadow-lg animate__animated animate__zoomIn">
                        <h5 className="fw-bold mb-3">업로드 방식 선택</h5>

                        <p className="text-muted small mb-4">
                            업로드할 대상을 선택하세요.
                        </p>

                        <div className="d-flex flex-column gap-2">
                            <button
                                className="btn btn-primary"
                                onClick={openFileUploadPicker}
                            >
                                파일 업로드
                            </button>

                            <button
                                className="btn btn-outline-primary"
                                onClick={openFolderUploadPicker}
                            >
                                폴더 업로드
                            </button>

                            <button
                                className="btn btn-light mt-2"
                                onClick={closeUploadModal}
                            >
                                취소
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* <MemberModal
                isOpen={isMemberModalOpen}
                onClose={() => setIsMemberModalOpen(false)}
                isOwner={props.isProjectOwner}
                members={projectMembers}
                isLoading={isMembersLoading}
                error={membersError}
                onRefresh={refreshProjectMembers}
                onUpdateRole={updateProjectMemberRole}
                onRemoveMember={removeProjectMember}
                onHandleJoinRequest={handleProjectJoinRequest}
            /> */}

            <MemberModal
                isOpen={isMemberModalOpen}
                onClose={() => setIsMemberModalOpen(false)}
                isOwner={props.isProjectOwner}
                members={projectMembers}
                isLoading={isMembersLoading}
                error={membersError}
                onRefresh={refreshProjectMembers}
                onUpdateRole={updateProjectMemberRole}
                onRemoveMember={removeProjectMember}

                joinRequests={joinRequests}
                isJoinRequestsLoading={isJoinRequestsLoading}
                joinRequestsError={joinRequestsError}
                onRefreshJoinRequests={refreshJoinRequests}
                onHandleJoinRequest={handleProjectJoinRequest}
            />

            <ShareModal
                isOpen={isShareModalOpen}
                onClose={() => setIsShareModalOpen(false)}
                projectName={props.projectName}
                onCreateInviteCode={createInviteCode}
            />

            {compileErrorModal?.isOpen && (
                <div className="custom-modal-overlay">
                    <div className="modal-content-box compile-error-modal-box shadow-lg animate__animated animate__zoomIn">
                        <h5 className="fw-bold mb-3 text-danger">
                            {compileErrorModal.title || '컴파일 실패'}
                        </h5>

                        <p className="text-muted mb-4 compile-error-message">
                            {compileErrorModal.message || '컴파일 중 오류가 발생했습니다.'}
                        </p>

                        <div className="d-flex justify-content-center gap-2">
                            <button
                                className="btn btn-danger px-4"
                                onClick={() =>
                                    setCompileErrorModal({
                                        isOpen: false,
                                        title: '',
                                        message: ''
                                    })
                                }
                            >
                                확인
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default EditorUI;