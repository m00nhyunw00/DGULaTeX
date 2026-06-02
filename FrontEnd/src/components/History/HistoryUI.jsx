/**
 * =================================================================
 * [Component] History Workspace UI
 * 설명: 버전 목록, 스냅샷 파일 트리, 히스토리 미리보기와 롤백 액션을 렌더링함
 * =================================================================
 */
import React, { useState } from 'react';
import HistoryFileTreeUI from './Section/HistoryFileTreeUI.jsx';
import HistoryEditorUI from './Section/HistoryEditorUI.jsx';
import HistoryListUI from './Section/HistoryListUI.jsx';
import './HistoryUI.css';
import '../Common.css';

function HistoryUI({
    projectName,
    projectId,
    isProjectOwner = false,
    backToEditor,
    historyList,
    selectedHistory,
    setSelectedHistory,
    activeFile,
    activeFileId,
    setActiveFileId,
    rollbackProject,
    rollbackFile,
    isLoading,
    error,
    historyFiles,
    isStructureLoading,
    structureError,
    isFileLoading,
    fileError,
}) {
    const [rollbackModalOpen, setRollbackModalOpen] = useState(false);
    const [isRollbackProcessing, setIsRollbackProcessing] = useState(false);

    const [projectRollbackModal, setProjectRollbackModal] = useState({
        isOpen: false,
        targetHistory: null
    });

    const [isProjectRollbackProcessing, setIsProjectRollbackProcessing] = useState(false);

    /* ---------------------------------------------------------
     * SECTION 0-1: Rollback Modal Handlers
     * 기능: 파일 단위 롤백 확인/취소 및 성공 후 에디터 화면 복귀
     * --------------------------------------------------------- */

    const openRollbackModal = () => {
        if (!activeFile) {
            alert('복구할 파일을 선택해주세요.');
            return;
        }

        if (activeFile.isCodeViewerUnsupported) {
            alert('이미지/PDF 파일은 현재 파일 롤백 대상에서 제외됩니다.');
            return;
        }

        setRollbackModalOpen(true);
    };

    /* ---------------------------------------------------------
    * SECTION 0-2: Project Rollback Modal Handlers
    * 기능: 프로젝트 단위 롤백 확인/취소 및 성공 후 에디터 화면 복귀
    * --------------------------------------------------------- */

    const openProjectRollbackModal = (history) => {
        if (!history) {
            alert('복구할 히스토리 버전을 선택할 수 없습니다.');
            return;
        }

        setProjectRollbackModal({
            isOpen: true,
            targetHistory: history
        });
    };

    const closeProjectRollbackModal = () => {
        if (isProjectRollbackProcessing) return;

        setProjectRollbackModal({
            isOpen: false,
            targetHistory: null
        });
    };

    const confirmRollbackProject = async () => {
        const targetHistoryId =
            projectRollbackModal.targetHistory?.historyId ||
            projectRollbackModal.targetHistory?.id;

        if (!targetHistoryId) {
            alert('프로젝트 롤백에 필요한 히스토리 정보가 없습니다.');
            return;
        }

        setIsProjectRollbackProcessing(true);

        try {
            const result = await rollbackProject(targetHistoryId);

            if (!result?.success) {
                alert(result?.message || '프로젝트 롤백에 실패했습니다.');
                return;
            }

            alert('프로젝트 롤백이 완료되었습니다.');

            setProjectRollbackModal({
                isOpen: false,
                targetHistory: null
            });

            if (backToEditor) {
                backToEditor({
                    forceDbOnOpen: true,
                    rollbackType: 'project',
                    openEntryId: result.mainEntryId || null,
                    mainEntryId: result.mainEntryId || null,
                    restoreToken: Date.now()
                });
            }
        } catch (error) {
            alert(error.message || '프로젝트 롤백 중 오류가 발생했습니다.');
        } finally {
            setIsProjectRollbackProcessing(false);
        }
    };

    const closeRollbackModal = () => {
        if (isRollbackProcessing) return;
        setRollbackModalOpen(false);
    };

    const confirmRollbackFile = async () => {
        if (!rollbackFile) return;

        setIsRollbackProcessing(true);

        try {
            const result = await rollbackFile();

            if (!result?.success) {
                alert(result?.message || '파일 롤백에 실패했습니다.');
                return;
            }

            alert('파일 롤백이 완료되었습니다.');
            setRollbackModalOpen(false);

            if (backToEditor) {
                backToEditor({
                    forceDbOnOpen: true,
                    rollbackType: 'file',
                    openEntryId: result.rolledBackEntryId || activeFile?.id || activeFileId || null,
                    restoreToken: Date.now()
                });
            }
        } catch (error) {
            alert(error.message || '파일 롤백 중 오류가 발생했습니다.');
        } finally {
            setIsRollbackProcessing(false);
        }
    };

    return (
        <div className="full-layout history-mode">
            <nav className="navbar navbar-dark top-nav-fixed shadow-sm">
                <div className="d-flex align-items-center">
                    <button className="btn btn-sm nav-back-btn" onClick={() => backToEditor?.()}>
                        <span className="nav-arrow">&larr;</span>
                    </button>

                    <div className="project-title-divider">
                        {projectName}
                    </div>
                </div>

                {isProjectOwner && (
                    <div className="ms-auto d-flex align-items-center gap-3">
                        <button
                            className="btn btn-sm btn-restore-main fw-bold"
                            onClick={openRollbackModal}
                        >
                            Restore this file
                        </button>
                    </div>
                )}
            </nav>

            <div className="main-content">
                <HistoryFileTreeUI
                    files={historyFiles}
                    activeFileId={activeFileId}
                    setActiveFileId={setActiveFileId}
                    isLoading={isStructureLoading}
                    error={structureError}
                />
                
                {/*  에디터 영역: 삭제된 파일(REMOVED)일 경우 배경색 하이라이트와 취소선 스타일 적용 */}
                <div className={`editor-section ${activeFile?.label === 'REMOVED' ? 'history-code-removed-viewer' : ''}`}>
                    <HistoryEditorUI
                        selectedHistory={selectedHistory}
                        activeFile={activeFile}
                        projectId={projectId}
                        isLoading={isFileLoading}
                        error={fileError}
                    />
                </div>

                <HistoryListUI
                    historyList={historyList}
                    selectedHistory={selectedHistory}
                    setSelectedHistory={setSelectedHistory}
                    projectId={projectId}
                    onRequestProjectRollback={openProjectRollbackModal}
                    isProjectOwner={isProjectOwner}
                    isLoading={isLoading}
                    error={error}
                />
            </div>

            {rollbackModalOpen && (
                <div className="custom-modal-overlay">
                    <div className="modal-content-box shadow-lg animate__animated animate__zoomIn">
                        <h5 className="fw-bold mb-3">
                            파일 롤백 확인
                        </h5>

                        <p className="text-muted mb-4">
                            현재 보고 있는 버전의 파일로 복구하시겠습니까?
                            <br />
                            <span className="fw-bold text-dark">
                                {activeFile?.name || '선택된 파일 없음'}
                            </span>
                            <br />
                            <span className="text-danger small">
                                현재 프로젝트의 해당 파일 내용이 과거 버전으로 변경됩니다.
                            </span>
                        </p>

                        <div className="d-flex justify-content-center gap-2">
                            <button
                                className="btn btn-light px-4"
                                onClick={closeRollbackModal}
                                disabled={isRollbackProcessing}
                            >
                                취소
                            </button>

                            <button
                                className="btn btn-success px-4"
                                onClick={confirmRollbackFile}
                                disabled={isRollbackProcessing}
                            >
                                {isRollbackProcessing ? '롤백 중...' : '롤백'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {projectRollbackModal.isOpen && (
                <div className="custom-modal-overlay">
                    <div className="modal-content-box history-rollback-modal-box shadow-lg animate__animated animate__zoomIn">
                        <h5 className="fw-bold mb-3">
                            프로젝트 롤백 확인
                        </h5>

                        <p className="text-muted mb-4 history-rollback-message">
                            선택한 히스토리 버전으로 프로젝트 전체를 복구하시겠습니까?

                            <br /><br />

                            <span className="fw-bold text-dark">
                                {projectRollbackModal.targetHistory?.createdAt
                                    ? new Date(projectRollbackModal.targetHistory.createdAt).toLocaleString()
                                    : '선택된 버전'}
                            </span>

                            <br /><br />

                            <span className="text-danger small">
                                현재 프로젝트의 파일/폴더 구조와 내용이 해당 시점으로 변경됩니다.
                            </span>
                        </p>

                        <div className="d-flex justify-content-center gap-2">
                            <button
                                className="btn btn-light px-4"
                                onClick={closeProjectRollbackModal}
                                disabled={isProjectRollbackProcessing}
                            >
                                취소
                            </button>

                            <button
                                className="btn btn-danger px-4"
                                onClick={confirmRollbackProject}
                                disabled={isProjectRollbackProcessing}
                            >
                                {isProjectRollbackProcessing ? '롤백 중...' : '롤백'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default HistoryUI;