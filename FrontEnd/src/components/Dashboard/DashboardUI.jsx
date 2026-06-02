/**
 * =================================================================
 * [Component] Dashboard UI Component
 * 설명: 사용자 인터페이스 렌더링과 화면 상호작용을 담당함
 * =================================================================
 */
import React, { useState } from 'react';
import './DashboardUI.css';
import '../Common.css';
import { AuthService } from '../../services/AuthService';

const createWithdrawalCode = () => Math.random().toString(36).slice(2, 10).toUpperCase();

function DashboardUI({
    userName,
    userId,
    userUuid,
    handleLogout,
    projects,
    activeMenu,
    setActiveMenu,
    handleCreateProject,
    handleDeleteProject,
    handleDownloadProject,
    handleDownloadPdfProject,
    handleDoubleClick,
    isLoading,
    editingProjectId,
    editTitle,
    setEditTitle,
    startEditing,
    cancelEditing,
    handleRenameSubmit,
    handleJoinProjectRequest,
    dashboardNotice,
    closeDashboardNotice
}) {
    const [selectedIds, setSelectedIds] = useState([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [targetId, setTargetId] = useState(null);

    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [newProjectTitle, setNewProjectTitle] = useState('');

    const [isJoinModalOpen, setIsJoinModalOpen] = useState(false);
    const [inviteCode, setInviteCode] = useState('');

    const [isWithdrawalModalOpen, setIsWithdrawalModalOpen] = useState(false);
    const [withdrawalCode, setWithdrawalCode] = useState('');
    const [withdrawalForm, setWithdrawalForm] = useState({
        studentId: userId || '',
        password: '',
        passwordConfirm: '',
        confirmText: ''
    });
    const [withdrawalMessage, setWithdrawalMessage] = useState('');
    const [isWithdrawalChecking, setIsWithdrawalChecking] = useState(false);

    const selectedProjects = projects.filter((project) => selectedIds.includes(project.id));
    const canDeleteSelectedProjects = selectedProjects.length > 0 && selectedProjects.every((project) => project.isMine);

    const toggleAll = () => {
        if (selectedIds.length === projects.length && projects.length > 0) {
            setSelectedIds([]);
        } else {
            setSelectedIds(projects.map(p => p.id));
        }
    };

    const handleCheckboxChange = (e, id) => {
        e.stopPropagation();
        setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
    };

    const openDeleteModal = (e, id = null) => {
        e.stopPropagation(); 
        setTargetId(id);    
        setIsModalOpen(true);
    };

    const confirmDelete = async () => {
        try {
            const deleteTargets = targetId ? [targetId] : selectedIds;
            if (deleteTargets.length === 0) return;
            await handleDeleteProject(deleteTargets);
            setSelectedIds([]); 
        } catch (error) {
        } finally {
            setIsModalOpen(false);
            setTargetId(null);
        }
    };

    const openCreateModal = () => {
        setNewProjectTitle('');
        setIsCreateModalOpen(true);
    };

    const closeCreateModal = () => {
        setNewProjectTitle('');
        setIsCreateModalOpen(false);
    };

    const handleCreateProjectSubmit = async () => {
        const title = newProjectTitle.trim();

        if (!title) {
            alert('프로젝트 이름을 입력해주세요.');
            return;
        }

        await handleCreateProject(title);
        closeCreateModal();
    };

    const openJoinModal = () => {
        setInviteCode('');
        setIsJoinModalOpen(true);
    };

    const closeJoinModal = () => {
        setInviteCode('');
        setIsJoinModalOpen(false);
    };

    const openWithdrawalModal = () => {
        setWithdrawalCode(createWithdrawalCode());
        setWithdrawalForm({
            studentId: userId || '',
            password: '',
            passwordConfirm: '',
            confirmText: ''
        });
        setWithdrawalMessage('');
        setIsWithdrawalModalOpen(true);
    };

    const closeWithdrawalModal = () => {
        setIsWithdrawalModalOpen(false);
        setWithdrawalMessage('');
    };

    const updateWithdrawalForm = (field, value) => {
        setWithdrawalForm((prev) => ({ ...prev, [field]: value }));
        setWithdrawalMessage('');
    };

    const handleWithdrawalVerify = async () => {
        // e.preventDefault()는 form onSubmit에서 처리하도록 함
        const normalizedCode = withdrawalForm.confirmText.trim().toUpperCase();

        if (!withdrawalForm.studentId.trim() || !withdrawalForm.password || !withdrawalForm.passwordConfirm || !normalizedCode) {
            setWithdrawalMessage('아이디, 비밀번호, 비밀번호 확인, 확인 문자열을 모두 입력해주세요.');
            return;
        }

        if (withdrawalForm.password !== withdrawalForm.passwordConfirm) {
            setWithdrawalMessage('비밀번호 확인이 일치하지 않습니다.');
            return;
        }

        if (normalizedCode !== withdrawalCode) {
            setWithdrawalMessage('확인 문자열이 일치하지 않습니다.');
            return;
        }

        setIsWithdrawalChecking(true);

        try {
            const verifyResult = await AuthService.verifyWithdrawal({
                studentId: withdrawalForm.studentId.trim(),
                password: withdrawalForm.password,
                passwordConfirm: withdrawalForm.passwordConfirm
            });

            if (verifyResult.success) {
                if (window.confirm("정말로 탈퇴하시겠습니까? 모든 프로젝트와 데이터가 삭제되며 복구할 수 없습니다.")) {
                    // 실제 탈퇴 API 호출 (userUuid는 props로 받은 실제 식별용 UUID)
                    const deleteResult = await AuthService.deleteUser(userUuid);
                    
                    if (deleteResult.success) {
                        alert("회원 탈퇴가 완료되었습니다. 그동안 이용해주셔서 감사합니다.");
                        handleLogout(); // 로그아웃 및 페이지 이동
                        return;
                    }
                    setWithdrawalMessage(deleteResult.message || '회원 탈퇴 처리 중 오류가 발생했습니다.');
                }
            } else {
                setWithdrawalMessage(verifyResult.message || '탈퇴 정보 확인에 실패했습니다.');
            }
        } catch (error) {
            setWithdrawalMessage(error.message || '탈퇴 정보 확인 중 오류가 발생했습니다.');
        } finally {
            setIsWithdrawalChecking(false);
        }
    };

    const handleJoinRequestSubmit = async () => {
        const trimmedCode = inviteCode.trim();

        if (!trimmedCode) {
            alert('초대 코드를 입력해주세요.');
            return;
        }

        if (!handleJoinProjectRequest) {
            alert('참가 요청 기능이 연결되지 않았습니다.');
            return;
        }

        const result = await handleJoinProjectRequest(trimmedCode);

        if (!result.success) {
            alert(result.message || '참가 요청 전송에 실패했습니다.');
            return;
        }

        alert('참가 요청이 전송되었습니다. 프로젝트 소유자의 승인을 기다려주세요.');
        closeJoinModal();
    };

    return (
        <div className="project-dashboard">
            <nav className="navbar navbar-dark top-nav-fixed shadow-sm">
                <span className="navbar-brand fw-bold text-dgu m-0">DGULaTeX</span>
                <div className="d-flex align-items-center ms-auto">
                    <span className="text-white me-3 small">
                        <strong className="text-dgu">{userName || '사용자'}</strong>님 접속 중
                    </span>
                    <button className="btn btn-sm btn-outline-light" onClick={handleLogout}>로그아웃</button>
                </div>
            </nav>

            <div className="dashboard-wrapper">
                <aside className="dashboard-sidebar">
                    <button
                        className="btn-create-project w-100"
                        onClick={openCreateModal}
                        disabled={isLoading}
                    >
                        {isLoading ? '연결 중...' : '+ 신규 프로젝트'}
                    </button>

                    <button
                        className="btn-join-project w-100"
                        onClick={openJoinModal}
                        disabled={isLoading}
                    >
                        프로젝트 참가
                    </button>

                    <ul className="sidebar-menu">
                        <li className={activeMenu === 'all' ? 'active' : ''} onClick={() => setActiveMenu('all')}>전체 프로젝트</li>
                        <li className={activeMenu === 'mine' ? 'active' : ''} onClick={() => setActiveMenu('mine')}>나의 프로젝트</li>
                        <li className={activeMenu === 'shared' ? 'active' : ''} onClick={() => setActiveMenu('shared')}>공유받은 프로젝트</li>
                    </ul>

                    <div className="dashboard-withdrawal-area">
                        <button
                            type="button"
                            className="dashboard-withdrawal-button"
                            onClick={openWithdrawalModal}
                        >
                            탈퇴하기
                        </button>
                    </div>
                </aside>

                <main className="dashboard-main">
                    <div className="d-flex justify-content-between align-items-center mb-3" style={{ height: '40px' }}>
                        <h5 className="fw-bold m-0">{activeMenu.toUpperCase()} PROJECTS</h5>
                        
                        {selectedIds.length > 0 && !isLoading && (
                            <div className="top-batch-actions animate__animated animate__fadeIn">
                                {/* <button 
                                    className="btn btn-sm btn-primary me-2" 
                                    onClick={() => handleDownloadProject(selectedIds)}
                                >
                                    다운로드
                                </button> */}
                                <button
                                    className="btn btn-primary px-4"
                                    onClick={handleJoinRequestSubmit}
                                    disabled={isLoading}
                                >
                                    {isLoading ? '요청 중...' : '요청'}
                                </button>
                                {canDeleteSelectedProjects && (
                                    <button className="btn btn-sm btn-danger" onClick={(e) => openDeleteModal(e)}>삭제</button>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="table-container shadow-sm border-0">
                        <table className="table table-hover mb-0">
                            <thead className="table-light">
                                <tr>
                                    <th className="ps-4" style={{ width: '40px' }}>
                                        <input 
                                            type="checkbox" 
                                            className="form-check-input" 
                                            onChange={toggleAll} 
                                            checked={selectedIds.length === projects.length && projects.length > 0}
                                            disabled={isLoading || projects.length === 0}
                                        />
                                    </th>
                                    <th>제목</th>
                                    <th>소유자</th>
                                    <th>마지막 수정</th>
                                    <th className="text-end pe-4">실행</th>
                                </tr>
                            </thead>
                            <tbody>
                                {isLoading ? (
                                    <tr>
                                        <td colSpan="5" className="text-center py-5">
                                            <div className="spinner-border text-warning mb-2" role="status"></div>
                                            <p className="text-muted small mb-0">동기화 중...</p>
                                        </td>
                                    </tr>
                                ) : projects.length === 0 ? (
                                    <tr>
                                        <td colSpan="5" className="text-center py-5 text-muted">프로젝트가 없습니다.</td>
                                    </tr>
                                ) : (
                                    projects.map((proj) => (
                                        <tr key={proj.id} onDoubleClick={() => handleDoubleClick(proj)} className={selectedIds.includes(proj.id) ? 'table-row-selected' : ''}>
                                            <td className="ps-4" onClick={(e) => e.stopPropagation()}>
                                                <input 
                                                    type="checkbox" 
                                                    className="form-check-input" 
                                                    checked={selectedIds.includes(proj.id)} 
                                                    onChange={(e) => handleCheckboxChange(e, proj.id)}
                                                />
                                            </td>
                                            
                                            <td>
                                                {editingProjectId === proj.id ? (
                                                    <input
                                                        type="text"
                                                        className="form-control form-control-sm shadow-none border-primary"
                                                        value={editTitle}
                                                        onChange={(e) => setEditTitle(e.target.value)}
                                                        autoFocus
                                                        onClick={(e) => e.stopPropagation()}
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter') handleRenameSubmit(proj.id);
                                                            if (e.key === 'Escape') cancelEditing();
                                                        }}
                                                        onBlur={() => handleRenameSubmit(proj.id)}
                                                    />
                                                ) : (
                                                    <strong>{proj.title}</strong>
                                                )}
                                            </td>
                                            
                                            <td className="small text-muted">{proj.owner}</td>
                                            <td className="small text-muted">{proj.updated}</td>
                                            <td className="text-end pe-4">
                                                <div className="row-action-buttons">
                                                    <button 
                                                        className="btn btn-xs btn-outline-secondary me-1" 
                                                        onClick={(e) => { 
                                                            e.stopPropagation(); 
                                                            handleDownloadProject(proj.id, 'zip'); 
                                                        }}
                                                    >
                                                        Zip
                                                    </button>
                                                    {/* <button className="btn btn-xs btn-outline-secondary me-1" onClick={(e) => { e.stopPropagation(); handleDownloadProject(proj.id, 'pdf'); }}>PDF</button> */}
                                                    <button
                                                        className="btn btn-xs btn-outline-secondary me-1"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleDownloadPdfProject(proj.id);
                                                        }}
                                                    >
                                                        PDF
                                                    </button>
                                                    <button className="btn btn-xs btn-outline-primary me-1 fw-bold" onClick={(e) => { e.stopPropagation(); startEditing(proj.id, proj.title); }}>이름 변경</button>
                                                    {proj.isMine && (
                                                        <button className="btn btn-xs btn-outline-danger" onClick={(e) => openDeleteModal(e, proj.id)}>삭제</button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </main>
            </div>

            {isModalOpen && (
                <div className="custom-modal-overlay">
                    <div className="modal-content-box shadow-lg animate__animated animate__zoomIn">
                        <h5 className="fw-bold mb-3">삭제 확인</h5>
                        <p className="text-muted mb-4">
                            {targetId ? "이 프로젝트를 삭제하시겠습니까?" : `선택한 ${selectedIds.length}개의 프로젝트를 삭제하시겠습니까?`}
                            <br /><span className="text-danger small">삭제 시 복구가 불가능합니다.</span>
                        </p>
                        <div className="d-flex justify-content-center gap-2">
                            <button className="btn btn-light px-4" onClick={() => setIsModalOpen(false)}>취소</button>
                            <button className="btn btn-danger px-4" onClick={confirmDelete} disabled={isLoading}>
                                {isLoading ? '삭제 중...' : '확인'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {isCreateModalOpen && (
                <div className="custom-modal-overlay">
                    <div className="create-project-modal-box shadow-lg animate__animated animate__zoomIn">
                        <h5 className="create-project-title">신규 프로젝트 생성</h5>

                        <p className="create-project-desc">
                            새 프로젝트의 이름을 입력해주세요.
                        </p>

                        <div className="create-project-input-area">
                            <label className="create-project-label">
                                프로젝트 이름
                            </label>

                            <input
                                type="text"
                                className="form-control create-project-input"
                                value={newProjectTitle}
                                onChange={(e) => setNewProjectTitle(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleCreateProjectSubmit();
                                    if (e.key === 'Escape') closeCreateModal();
                                }}
                                placeholder="예: 졸업논문 프로젝트"
                                autoFocus
                            />
                        </div>

                        <div className="create-project-actions">
                            <button
                                className="btn btn-light px-4"
                                onClick={closeCreateModal}
                            >
                                취소
                            </button>

                            <button
                                className="btn btn-success px-4"
                                onClick={handleCreateProjectSubmit}
                                disabled={isLoading}
                            >
                                확인
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {dashboardNotice && (
                <div className="custom-modal-overlay">
                    <div className="modal-content-box shadow-lg animate__animated animate__zoomIn">
                        <h5 className="fw-bold mb-3">{dashboardNotice.title}</h5>
                        <p className="text-muted mb-4">{dashboardNotice.message}</p>
                        <div className="d-flex justify-content-center">
                            <button
                                className="btn btn-primary px-4"
                                onClick={closeDashboardNotice}
                            >
                                확인
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {isJoinModalOpen && (
                <div className="custom-modal-overlay">
                    <div className="join-project-modal-box shadow-lg animate__animated animate__zoomIn">
                        <h5 className="join-project-title">프로젝트 참가</h5>

                        <p className="join-project-desc">
                            공유받은 초대 코드를 입력하면 프로젝트 소유자에게 참가 요청을 보냅니다.
                        </p>

                        <div className="join-project-input-area">
                            <label className="join-project-label">
                                초대 코드
                            </label>

                            <input
                                type="text"
                                className="form-control join-project-input"
                                value={inviteCode}
                                onChange={(e) => setInviteCode(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleJoinRequestSubmit();
                                    if (e.key === 'Escape') closeJoinModal();
                                }}
                                placeholder="예: ABC123"
                                autoFocus
                            />
                        </div>

                        <div className="join-project-actions">
                            <button
                                className="btn btn-light px-4"
                                onClick={closeJoinModal}
                            >
                                취소
                            </button>

                            <button
                                className="btn btn-primary px-4"
                                onClick={handleJoinRequestSubmit}
                            >
                                요청
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {isWithdrawalModalOpen && (
                <div className="custom-modal-overlay">
                    <div className="withdrawal-modal-box shadow-lg animate__animated animate__zoomIn">
                        <h5 className="withdrawal-modal-title">회원 탈퇴 확인</h5>
                        <p className="withdrawal-modal-desc">
                            계정 정보를 확인한 후, 최종 탈퇴 처리를 진행합니다.
                        </p>

                        <div className="withdrawal-code-box">
                            <span>확인 문자열</span>
                            <strong>{withdrawalCode}</strong>
                        </div>

                        <form 
                            className="withdrawal-input-area"
                            onSubmit={(e) => {
                                e.preventDefault();
                                handleWithdrawalVerify();
                            }}
                        >
                            <label className="withdrawal-label">아이디</label>
                            <input
                                type="text"
                                className="form-control withdrawal-input"
                                value={withdrawalForm.studentId}
                                onChange={(e) => updateWithdrawalForm('studentId', e.target.value)}
                                autoComplete="username"
                            />

                            <label className="withdrawal-label">비밀번호</label>
                            <input
                                type="password"
                                className="form-control withdrawal-input"
                                value={withdrawalForm.password}
                                onChange={(e) => updateWithdrawalForm('password', e.target.value)}
                                autoComplete="current-password"
                            />

                            <label className="withdrawal-label">비밀번호 확인</label>
                            <input
                                type="password"
                                className="form-control withdrawal-input"
                                value={withdrawalForm.passwordConfirm}
                                onChange={(e) => updateWithdrawalForm('passwordConfirm', e.target.value)}
                                autoComplete="new-password"
                            />

                            <label className="withdrawal-label">확인 문자열 입력</label>
                            <input
                                type="text"
                                className="form-control withdrawal-input withdrawal-code-input"
                                value={withdrawalForm.confirmText}
                                onChange={(e) => updateWithdrawalForm('confirmText', e.target.value.toUpperCase())}
                                placeholder={withdrawalCode}
                                autoComplete="off"
                            />

                            {withdrawalMessage && (
                                <p className="withdrawal-message">{withdrawalMessage}</p>
                            )}

                            <div className="withdrawal-actions">
                                <button type="button" className="btn btn-light px-4" onClick={closeWithdrawalModal}>취소</button>
                                <button
                                    type="submit"
                                    className="btn btn-danger px-4"
                                    disabled={isWithdrawalChecking}
                                >
                                    {isWithdrawalChecking ? '확인 중...' : '탈퇴하기'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}

export default DashboardUI;