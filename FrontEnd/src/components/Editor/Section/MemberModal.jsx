/**
 * =================================================================
 * [Component] Member Modal UI Component
 * 설명: 사용자 인터페이스 렌더링과 화면 상호작용을 담당함
 * =================================================================
 */
import React, { useState } from 'react';

const ROLE_ORDER = {
    owner: 3,
    editor: 2,
    viewer: 1
};

const ROLE_LABEL = {
    owner: 'owner',
    editor: 'editor',
    viewer: 'viewer'
};

function MemberModal({
    isOpen,
    onClose,
    isOwner,
    members = [],
    isLoading = false,
    error = '',
    onRefresh,
    onUpdateRole,
    onRemoveMember,
    onHandleJoinRequest,
    joinRequests = [],
    isJoinRequestsLoading = false,
    joinRequestsError = '',
    onRefreshJoinRequests
}) {

    const [activeTab, setActiveTab] = useState('members');

    const [confirmModal, setConfirmModal] = useState({
        isOpen: false,
        type: '',
        title: '',
        message: '',
        confirmText: '확인',
        confirmButtonClass: 'btn-primary',
        payload: null
    });

    if (!isOpen) return null;

    const closeConfirmModal = () => {
        setConfirmModal({
            isOpen: false,
            type: '',
            title: '',
            message: '',
            confirmText: '확인',
            confirmButtonClass: 'btn-primary',
            payload: null
        });
    };

    const openRoleChangeConfirm = (member, nextRole) => {
        if (member.role === nextRole) return;

        setConfirmModal({
            isOpen: true,
            type: 'role_change',
            title: '권한 변경 확인',
            message: `정말 ${member.name}님을 ${ROLE_LABEL[nextRole]} 권한으로 변경하시겠습니까?`,
            confirmText: '변경',
            confirmButtonClass: nextRole === 'owner' ? 'btn-danger' : 'btn-primary',
            payload: {
                memberId: member.id,
                nextRole
            }
        });
    };

    const openKickConfirm = (member) => {
        setConfirmModal({
            isOpen: true,
            type: 'kick_member',
            title: '멤버 강퇴 확인',
            message: `정말 ${member.name}님을 프로젝트에서 강퇴하시겠습니까?`,
            confirmText: '강퇴',
            confirmButtonClass: 'btn-danger',
            payload: {
                memberId: member.id
            }
        });
    };


    const handleConfirmAction = async () => {
        const { type, payload } = confirmModal;

        if (type === 'role_change') {
            const result = await onUpdateRole?.(payload.memberId, payload.nextRole);

            if (!result?.success) {
                alert(result?.message || '권한 변경에 실패했습니다.');
                return;
            }

            if (onRefresh) await onRefresh();
        }

        if (type === 'kick_member') {
            const result = await onRemoveMember?.(payload.memberId);

            if (!result?.success) {
                alert(result?.message || '멤버 강퇴에 실패했습니다.');
                return;
            }

            if (onRefresh) await onRefresh();
        }


        closeConfirmModal();
    };

    const handleRequestAction = async (requestId, action) => {
        const result = await onHandleJoinRequest?.(requestId, action);

        if (!result?.success) {
            alert(result?.message || '참가 요청 처리에 실패했습니다.');
            return;
        }

        if (onRefreshJoinRequests) await onRefreshJoinRequests();
        if (action === 'ACCEPT' && onRefresh) await onRefresh();
    };

    const handleMembersTabClick = async () => {
        setActiveTab('members');
        await onRefresh?.();
    };

    const handleRequestsTabClick = async () => {
        setActiveTab('requests');
        await onRefreshJoinRequests?.();
    };

    const sortedMembers = [...members].sort((a, b) => {
        return (ROLE_ORDER[b.role] || 0) - (ROLE_ORDER[a.role] || 0);
    });

    return (
        <div className="custom-modal-overlay">
            <div className="member-modal-box shadow-lg animate__animated animate__zoomIn">
                <div className="member-modal-header">
                    <div>
                        <h5 className="member-modal-title">프로젝트 멤버</h5>
                        <p className="member-modal-subtitle">
                            멤버 목록과 프로젝트 권한을 확인할 수 있습니다.
                        </p>
                    </div>

                    <button className="member-modal-close-btn" onClick={onClose}>
                        &times;
                    </button>
                </div>

                {isOwner && (
                    <div className="member-modal-tabs">
                        <button
                            className={activeTab === 'members' ? 'active' : ''}
                            onClick={handleMembersTabClick}
                        >
                            멤버 목록
                        </button>

                        <button
                            className={activeTab === 'requests' ? 'active' : ''}
                            onClick={handleRequestsTabClick}
                        >
                            참가 요청
                            {joinRequests.length > 0 && (
                                <span className="request-count-badge">
                                    {joinRequests.length}
                                </span>
                            )}
                        </button>
                    </div>
                )}

                <div className="member-modal-content">
                    {activeTab === 'members' && (
                        <div className="member-list">
                            {isLoading ? (
                                <div className="member-empty-state">
                                    멤버 목록을 불러오는 중입니다...
                                </div>
                            ) : error ? (
                                <div className="member-empty-state text-danger">
                                    {error}
                                    <div className="mt-3">
                                        <button className="btn btn-sm btn-outline-secondary" onClick={onRefresh}>
                                            다시 시도
                                        </button>
                                    </div>
                                </div>
                            ) : sortedMembers.length === 0 ? (
                                <div className="member-empty-state">
                                    표시할 멤버가 없습니다.
                                </div>
                            ) : (
                                sortedMembers.map(member => (
                                    <div className="member-row" key={member.id}>
                                        <div className="member-profile">
                                            <div className="member-avatar">
                                                {(member.name || 'U').charAt(0)}
                                            </div>

                                            <div>
                                                <div className="member-name">{member.name}</div>
                                                <div className="member-email">
                                                    {member.studentId || member.email || member.id}
                                                </div>
                                            </div>
                                        </div>

                                        {/* <div className="member-management-area">
                                            <div className="member-role-area">
                                                <span className={`member-role-badge role-${member.role}`}>
                                                    {member.role}
                                                </span>
                                            </div>
                                        </div> */}

                                        <div className="member-management-area">
                                            <div className="member-role-area">
                                                {isOwner && member.role !== 'owner' ? (
                                                    <select
                                                        className="form-select form-select-sm member-role-select"
                                                        value={member.role}
                                                        onChange={(e) => openRoleChangeConfirm(member, e.target.value)}
                                                    >
                                                        <option value="viewer">viewer</option>
                                                        <option value="editor">editor</option>
                                                        <option value="owner" className="text-danger">
                                                            owner
                                                        </option>
                                                    </select>
                                                ) : (
                                                    <span className={`member-role-badge role-${member.role}`}>
                                                        {member.role}
                                                    </span>
                                                )}
                                            </div>

                                            {isOwner && member.role !== 'owner' && (
                                                <button
                                                    className="btn btn-sm btn-danger ms-2"
                                                    onClick={() => openKickConfirm(member)}
                                                >
                                                    제거
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    )}

                    {activeTab === 'requests' && isOwner && (
                        <div className="request-list">
                            {isJoinRequestsLoading ? (
                                <div className="empty-request-box">
                                    참가 요청 목록을 불러오는 중입니다...
                                </div>
                            ) : joinRequestsError ? (
                                <div className="empty-request-box text-danger">
                                    {joinRequestsError}
                                    <div className="mt-3">
                                        <button
                                            className="btn btn-sm btn-outline-secondary"
                                            onClick={onRefreshJoinRequests}
                                        >
                                            다시 시도
                                        </button>
                                    </div>
                                </div>
                            ) : joinRequests.length === 0 ? (
                                <div className="empty-request-box">
                                    현재 참가 요청이 없습니다.
                                </div>
                            ) : (
                                joinRequests.map(request => (
                                    <div className="request-row" key={request.id}>
                                        <div className="member-profile">
                                            <div className="member-avatar request">
                                                {(request.name || 'U').charAt(0)}
                                            </div>

                                            <div>
                                                <div className="member-name">{request.name}</div>
                                                <div className="member-email">
                                                    {request.studentId || request.email || '학번 정보 없음'}
                                                </div>
                                                <div className="request-role-text">
                                                    요청 권한: {request.requestedRole}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="request-action-buttons">
                                            <button
                                                className="btn btn-sm btn-success"
                                                onClick={() => handleRequestAction(request.id, 'ACCEPT')}
                                            >
                                                수락
                                            </button>

                                            <button
                                                className="btn btn-sm btn-outline-danger"
                                                onClick={() => handleRequestAction(request.id, 'REJECT')}
                                            >
                                                거절
                                            </button>

                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    )}
                </div>

                <div className="member-modal-footer">
                    <button className="btn btn-light px-4" onClick={onClose}>
                        닫기
                    </button>
                </div>
            </div>

            {confirmModal.isOpen && (
                <div className="member-confirm-overlay">
                    <div className="member-confirm-box shadow-lg animate__animated animate__zoomIn">
                        <h6 className="member-confirm-title">
                            {confirmModal.title}
                        </h6>

                        <p className="member-confirm-message">
                            {confirmModal.message}
                        </p>

                        <div className="member-confirm-actions">
                            <button
                                className="btn btn-light px-4"
                                onClick={closeConfirmModal}
                            >
                                취소
                            </button>

                            <button
                                className={`btn px-4 ${confirmModal.confirmButtonClass}`}
                                onClick={handleConfirmAction}
                            >
                                {confirmModal.confirmText}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default MemberModal;