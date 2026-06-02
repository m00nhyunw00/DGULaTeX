/**
 * =================================================================
 * [Page] Editor Page Composition
 * 설명: 페이지 단위 레이아웃과 화면 훅, UI 컴포넌트 조립을 담당함
 * =================================================================
 */
import React, { useEffect } from 'react';
import EditorUI from '../components/Editor/EditorUI';
import { useEditor } from '../hooks/useEditor';
import { useChat } from '../hooks/useChatAi';
import { socket } from '../socket/socketClient';
import { useLocation } from 'react-router-dom';

function EditorPage({ user, project, handleLogout, backToDashboard, goToHistory, setSelectedProject, chatState, setChatState }) {
    const location = useLocation();
    const restoreNavigationState = location.state?.forceDbOnOpen ? location.state : null;
    const handleProjectPatch = (patch) => {
        if (!setSelectedProject) return;

        setSelectedProject((prev) => {
            const baseProject = prev || project;
            if (!baseProject) return baseProject;

            return {
                ...baseProject,
                ...patch
            };
        });
    };
    const editorLogic = useEditor(project, user, restoreNavigationState, handleProjectPatch);
    const chatLogic = useChat({
        project,
        files: editorLogic.files,
        activeFileId: editorLogic.activeFileId,
        activeFileMeta: editorLogic.activeFileMeta,
        currentLaTeX: editorLogic.fileContent,
        getCurrentLaTeX: editorLogic.getSnapshotText,
        compileLog: editorLogic.compileLog,
        chatState,
        setChatState
    });

    const normalizeId = (id) =>
        String(id || '')
            .replace(/^0x/i, '')
            .replace(/-/g, '')
            .toLowerCase()
            .trim();

    const isProjectOwner =
        editorLogic.myProjectRole
            ? editorLogic.myProjectRole === 'owner'
            : project?.ownerId
                ? normalizeId(project.ownerId) === normalizeId(user?.uuid || user?.id)
                : true;


    useEffect(() => {
        const projectId = project?.id || project?._id || project?.projectId;

        if (!projectId) return;

        const currentUser = {
            id: user?.uuid || user?.id,
            uuid: user?.uuid,
            name: user?.name || user?.studentId || 'User'
        };

        if (!socket.connected) {
            socket.connect();
        }

        const handleConnect = () => {

            socket.emit('project:join', {
                projectId,
                user: currentUser
            });
        };

        const handleConnectError = (err) => {
            console.error('[FRONT SOCKET ERROR] Socket connection failed.');
        };

        const handleUserJoined = (payload) => {
        };

        const handleUserLeft = (payload) => {
        };

        const handleMemberRoleUpdated = async (payload) => {
            await editorLogic.handleSocketMemberRoleUpdated?.(payload);
        };

        const handleMyRoleUpdated = async (payload) => {
            await editorLogic.handleSocketMyRoleUpdated?.(payload);
        };

        const handleEditPermissionRevoked = async (payload) => {
            await editorLogic.handleSocketEditPermissionRevoked?.(payload);
        };

        const handleOwnerTransferred = async (payload) => {
            await editorLogic.handleSocketOwnerTransferred?.(payload);
        };

        const handleMemberRemoved = async (payload) => {
            await editorLogic.handleSocketMemberRemoved?.(payload);
        };

        const handleRemovedFromProject = async (payload) => {

            const result = await editorLogic.handleSocketRemovedFromProject?.(payload);

            if (socket.connected) {
                socket.emit('project:leave', {
                    projectId: payload.projectId || projectId
                });
            }

            if (result?.shouldLeaveProject) {
                backToDashboard?.();
            }
        };

        const handleTreeUpdated = async (payload) => {
            await editorLogic.handleSocketTreeUpdated?.(payload);
        };

        const handleHistoryFileRestored = async (payload) => {
            await editorLogic.handleSocketFileRestored?.(payload);
        };

        const handleHistoryProjectRestored = async (payload) => {
            await editorLogic.handleSocketProjectRestored?.(payload);
        };

        socket.on('connect', handleConnect);
        socket.on('connect_error', handleConnectError);
        socket.on('project:user-joined', handleUserJoined);
        socket.on('project:user-left', handleUserLeft);

        socket.on('member:role-updated', handleMemberRoleUpdated);
        socket.on('member:my-role-updated', handleMyRoleUpdated);
        socket.on('member:edit-permission-revoked', handleEditPermissionRevoked);
        socket.on('project:owner-transferred', handleOwnerTransferred);
        socket.on('member:removed', handleMemberRemoved);
        socket.on('member:removed-from-project', handleRemovedFromProject);
        socket.on('project:tree-updated', handleTreeUpdated);
        socket.on('history:file-restored', handleHistoryFileRestored);
        socket.on('history:project-restored', handleHistoryProjectRestored);

        if (socket.connected) {
            socket.emit('project:join', {
                projectId,
                user: currentUser
            });
        }

        return () => {
            if (socket.connected) {
                socket.emit('project:leave', { projectId });
            }

            socket.off('connect', handleConnect);
            socket.off('connect_error', handleConnectError);
            socket.off('project:user-joined', handleUserJoined);
            socket.off('project:user-left', handleUserLeft);

            socket.off('member:role-updated', handleMemberRoleUpdated);
            socket.off('member:my-role-updated', handleMyRoleUpdated);
            socket.off('member:edit-permission-revoked', handleEditPermissionRevoked);
            socket.off('project:owner-transferred', handleOwnerTransferred);
            socket.off('member:removed', handleMemberRemoved);
            socket.off('member:removed-from-project', handleRemovedFromProject);
            socket.off('project:tree-updated', handleTreeUpdated);
            socket.off('history:file-restored', handleHistoryFileRestored);
            socket.off('history:project-restored', handleHistoryProjectRestored);
        };
    }, [project,
        user,
        backToDashboard,
        editorLogic.handleSocketMemberRoleUpdated,
        editorLogic.handleSocketMyRoleUpdated,
        editorLogic.handleSocketEditPermissionRevoked,
        editorLogic.handleSocketOwnerTransferred,
        editorLogic.handleSocketMemberRemoved,
        editorLogic.handleSocketRemovedFromProject,
        editorLogic.handleSocketTreeUpdated,
        editorLogic.handleSocketFileRestored,
        editorLogic.handleSocketProjectRestored
    ]);

    return (
        <EditorUI
            userName={user?.name || "사용자"}
            projectName={project?.title || "무제 프로젝트"}
            handleLogout={handleLogout}
            backToDashboard={backToDashboard}
            goToHistory={goToHistory}
            isProjectOwner={isProjectOwner}

            flushSaveCurrentFile={editorLogic.flushSaveCurrentFile}
            flushCurrentFileBeforeLeave={editorLogic.flushCurrentFileBeforeLeave}

            files={editorLogic.files}
            activeFileId={editorLogic.activeFileId}
            fileContent={editorLogic.fileContent}
            isFileContentLoaded={editorLogic.isFileContentLoaded}
            activeFileKind={editorLogic.activeFileKind}
            activeFileMeta={editorLogic.activeFileMeta}
            activeImageUrl={editorLogic.activeImageUrl}
            selectedIds={editorLogic.selectedIds}
            setSelectedIds={editorLogic.setSelectedIds}
            pdfUrl={editorLogic.pdfUrl}
            compileLog={editorLogic.compileLog}
            compileErrorEntryIds={editorLogic.compileErrorEntryIds}
            isCompiling={editorLogic.isCompiling}
            compileEngine={editorLogic.compileEngine}
            setCompileEngine={editorLogic.setCompileEngine}
            compileErrorModal={editorLogic.compileErrorModal}
            setCompileErrorModal={editorLogic.setCompileErrorModal}
            handleCreateEntry={editorLogic.handleCreateEntry}
            handleDeleteEntry={editorLogic.handleDeleteEntry}
            handleRenameEntry={editorLogic.handleRenameEntry}
            handleMoveEntry={editorLogic.handleMoveEntry}
            handleOpenFile={editorLogic.handleOpenFile}
            handleUpload={editorLogic.handleUpload}
            handleDownloadFile={editorLogic.handleDownloadFile}
            refreshTree={editorLogic.refreshTree}
            handleManualCompile={editorLogic.handleManualCompile}
            setFileContent={editorLogic.setFileContent}
            mainFileId={editorLogic.mainFileId}
            handleSetMainDocument={editorLogic.handleSetMainDocument}

            setActiveFileId={editorLogic.setActiveFileId}
            handleEditorDidMount={editorLogic.handleEditorDidMount}
            insertSnippet={editorLogic.insertSnippet}

            isAutoCompile={editorLogic.isAutoCompile}
            toggleAutoCompile={editorLogic.toggleAutoCompile}
            handleAutoCompile={editorLogic.handleAutoCompile}

            projectMembers={editorLogic.projectMembers}
            isMembersLoading={editorLogic.isMembersLoading}
            membersError={editorLogic.membersError}
            refreshProjectMembers={editorLogic.refreshProjectMembers}
            createInviteCode={editorLogic.createInviteCode}
            updateProjectMemberRole={editorLogic.updateProjectMemberRole}
            removeProjectMember={editorLogic.removeProjectMember}
            handleProjectJoinRequest={editorLogic.handleProjectJoinRequest}
            joinRequests={editorLogic.joinRequests}
            isJoinRequestsLoading={editorLogic.isJoinRequestsLoading}
            joinRequestsError={editorLogic.joinRequestsError}
            refreshJoinRequests={editorLogic.refreshJoinRequests}

            myProjectRole={editorLogic.myProjectRole}
            canEditProject={editorLogic.canEditProject}
            isViewerMode={editorLogic.isViewerMode}

            chatLogic={chatLogic}
        />
    );
}

export default EditorPage;


