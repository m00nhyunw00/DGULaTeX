/**
 * =================================================================
 * [Component] History List UI Component
 * 설명: 사용자 인터페이스 렌더링과 화면 상호작용을 담당함
 * =================================================================
 */
import React, { useState } from 'react';
import { getUserColor } from '../../../utils/userColor';

/**
 * @param {Array} historyList - 전체 변경 이력 배열
 * @param {Object} selectedHistory - 현재 선택된 히스토리 객체
 * @param {Function} setSelectedHistory - 히스토리 선택 변경 함수
 * @param {Function} rollbackProject - 프로젝트 단위 복구 실행 함수
 */
function HistoryListUI({
    historyList,
    selectedHistory,
    setSelectedHistory,
    projectId,
    onRequestProjectRollback,
    isProjectOwner = false,
    isLoading = false,
    error = ''
}) {
    const [openMenuId, setOpenMenuId] = useState(null);

    return (
        <aside className="history-list-side border-start" onClick={() => setOpenMenuId(null)}>
            <div className="p-3 border-bottom fw-bold text-center bg-white shadow-sm">
                Recent Activity
            </div>

            <div className="history-items-container">
                {isLoading ? (
                    <div className="p-4 text-center text-muted small">
                        히스토리 목록을 불러오는 중입니다...
                    </div>
                ) : error ? (
                    <div className="p-4 text-center text-danger small">
                        {error}
                    </div>
                ) : historyList.length === 0 ? (
                    <div className="p-4 text-center text-muted small">
                        저장된 히스토리가 없습니다.
                    </div>
                ) : (
                    historyList.map(h => (
                        <div
                            key={h.id}
                            className={`history-item p-4 border-bottom ${selectedHistory?.id === h.id ? 'selected' : ''}`}
                            onClick={() => setSelectedHistory(h)}
                        >
                            <div className="d-flex justify-content-between align-items-start">
                                <div className="d-flex flex-column">
                                    <span className="h6 mb-1 fw-bold">
                                        {h.createdAt ? new Date(h.createdAt).toLocaleString() : '시간 정보 없음'}
                                    </span>

                                    <div className="mb-3">
                                        {h.changedEntries?.map((entry, index) => (
                                            <div key={index} className="history-entry-change">
                                                <div className="history-entry-label">
                                                    {entry.label}
                                                </div>

                                                <div className="history-entry-name">
                                                    {entry.entryName}
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    <div className="history-contributor-list">
                                        {(h.contributors && h.contributors.length > 0
                                            ? h.contributors
                                            : [{ id: h.editorName, name: h.isMe ? 'You' : h.editorName }]
                                        ).map((contributor, index) => {
                                            const contributorName = contributor?.isUnknown ? '(알수없음)' : (contributor?.name || String(contributor || '사용자'));
                                            const contributorId = contributor?.isUnknown ? 'unknown' : (contributor?.id || contributorName);
                                            const isUnknownContributor = Boolean(contributor?.isUnknown);

                                            return (
                                                <span
                                                    key={String(contributorId) + '-' + index}
                                                    className="history-contributor-item"
                                                    style={{
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        marginRight: '10px',
                                                        textDecoration: isUnknownContributor ? 'line-through' : 'none',
                                                        textDecorationThickness: isUnknownContributor ? '1.5px' : undefined
                                                    }}
                                                >
                                                    <span
                                                        className="history-contributor-color"
                                                        style={{
                                                            display: 'inline-block',
                                                            width: '9px',
                                                            height: '9px',
                                                            marginRight: '5px',
                                                            backgroundColor: isUnknownContributor ? '#000000' : getUserColor(contributorId, projectId)
                                                        }}
                                                    />
                                                    <span>{contributorName}&nbsp;</span>
                                                </span>
                                            );
                                        })}
                                    </div>
                                </div>

                                <div className="history-menu-container">
                                    <button
                                        className="btn btn-outline-secondary btn-sm border-0 menu-trigger-btn"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setOpenMenuId(openMenuId === h.id ? null : h.id);
                                        }}
                                    >
                                        ⋮
                                    </button>

                                    {openMenuId === h.id && (
                                        <div className="history-dropdown shadow-lg animate__animated animate__fadeIn">
                                            <div className="dropdown-item" onClick={() => alert('Download API 연결 예정')}>
                                                Download version
                                            </div>
                                            {isProjectOwner && (
                                                <div
                                                    className="dropdown-item dropdown-item-restore fw-bold"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setOpenMenuId(null);
                                                        onRequestProjectRollback?.(h);
                                                    }}
                                                >
                                                    Rollback Project
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </aside>
    );
}

export default HistoryListUI;