/**
 * =================================================================
 * [Hook] Dashboard State & Workflow
 * 설명: 화면 상태, 사용자 액션, 서비스 호출 흐름을 React 훅으로 관리함
 * =================================================================
 */
import { useState, useMemo, useEffect, useCallback } from 'react';
import { ProjectService } from '../services/ProjectService';
import { CompilerService } from '../services/CompilerService';
import { CollaborationService } from '../services/CollaborationService';
import { socket } from '../socket/socketClient';

export const useDashboard = (setSelectedProject, user) => {
    const [projects, setProjects] = useState([]);
    const [activeMenu, setActiveMenu] = useState('all');
    const [isLoading, setIsLoading] = useState(false);
    const [dashboardNotice, setDashboardNotice] = useState(null);

    // 🎯 [신규 상태] 인라인 편집을 위한 상태 관리
    const [editingProjectId, setEditingProjectId] = useState(null);
    const [editTitle, setEditTitle] = useState('');

    // const fetchProjects = useCallback(async () => {
    //     if (!user?.id) return;
    //     setIsLoading(true);
    //     try {
    //         const data = await ProjectService.getAll(user.id);
    //         setProjects(data.projects || []);
    //     } catch (error) {
    //     } finally {
    //         setIsLoading(false);
    //     }
    // }, [user?.id]);

    const fetchProjects = useCallback(async () => {
        if (!user?.id) return;

        setIsLoading(true);

        try {
            const data = await ProjectService.getAll(user.id);
            const rawProjects = data.projects || [];

            const enrichedProjects = await Promise.all(
                rawProjects.map(async (project) => {
                    try {
                        const detailResult = await ProjectService.getById(project.id);

                        return {
                            ...project,
                            realOwnerId: detailResult.data?.ownerId || null
                        };
                    } catch (error) {
                        // 소유자 상세 조회 실패 시 목록 기본값으로 계속 렌더링한다.
                        return {
                            ...project,
                            realOwnerId: null
                        };
                    }
                })
            );

            setProjects(enrichedProjects);
        } catch (error) {
            console.error("[FETCH ERROR]");
        } finally {
            setIsLoading(false);
        }
    }, [user?.id]);

    useEffect(() => { fetchProjects(); }, [fetchProjects]);

    useEffect(() => {
        const dashboardUserId = user?.uuid || user?.id;

        if (!dashboardUserId) return undefined;

        const dashboardUser = {
            ...user,
            uuid: user?.uuid || user?.id
        };

        const joinDashboard = () => {
            socket.emit('dashboard:join', { user: dashboardUser });
        };

        const refreshWithNotice = async (notice) => {
            await fetchProjects();
            setDashboardNotice(notice);
        };

        const handleRemovedFromProject = (payload = {}) => {
            refreshWithNotice({
                title: '프로젝트에서 제외되었습니다',
                message: (payload.ownerName || '사용자') + ' 소유의 "' + (payload.projectTitle || '프로젝트') + '" 프로젝트에서 강퇴되었습니다.'
            });
        };

        const handleInviteApproved = (payload = {}) => {
            refreshWithNotice({
                title: '초대가 승인되었습니다',
                message: '"' + (payload.projectTitle || '프로젝트') + '" 프로젝트 초대가 승인되었습니다.'
            });
        };

        const handleOwnershipTransferred = (payload = {}) => {
            refreshWithNotice({
                title: '소유권이 양도되었습니다',
                message: (payload.previousOwnerName || '사용자') + '님의 "' + (payload.projectTitle || '프로젝트') + '" 프로젝트 소유권이 사용자님께 양도되었습니다.'
            });
        };

        socket.on('connect', joinDashboard);
        socket.on('dashboard:project-removed', handleRemovedFromProject);
        socket.on('dashboard:invite-approved', handleInviteApproved);
        socket.on('dashboard:ownership-transferred', handleOwnershipTransferred);

        if (!socket.connected) {
            socket.connect();
        } else {
            joinDashboard();
        }

        return () => {
            socket.emit('dashboard:leave', { user: dashboardUser });
            socket.off('connect', joinDashboard);
            socket.off('dashboard:project-removed', handleRemovedFromProject);
            socket.off('dashboard:invite-approved', handleInviteApproved);
            socket.off('dashboard:ownership-transferred', handleOwnershipTransferred);
        };
    }, [fetchProjects, user?.id, user?.uuid]);

    // const filteredProjects = useMemo(() => {
    //     return projects.map(p => ({
    //         id: p.id, 
    //         title: p.title,
    //         owner: p.ownerName, 
    //         updated: p.updatedAt ? new Date(p.updatedAt).toLocaleString() : '정보 없음',
    //         ownerId: p.ownerId 
    //     })).filter(p => {
    //         if (activeMenu === 'mine') return String(p.ownerId) === String(user?.id);
    //         if (activeMenu === 'shared') return String(p.ownerId) !== String(user?.id);
    //         return true;
    //     });
    // }, [projects, activeMenu, user?.id]);

    const normalizeId = (value) =>
        String(value || '').replace(/-/g, '').toLowerCase().trim();

    const filteredProjects = useMemo(() => {
        const currentUserUuid = normalizeId(user?.uuid);

        return projects.map(p => {
            const ownerId = p.realOwnerId || p.ownerId || p.owner_id;
            const isMine = normalizeId(ownerId) === currentUserUuid;

            return {
                id: p.id,
                title: p.title,
                owner: p.ownerName || p.owner || '사용자',
                updated: p.updatedAt ? new Date(p.updatedAt).toLocaleString() : '정보 없음',
                ownerId,
                isMine
            };
        }).filter(p => {
            if (activeMenu === 'mine') return p.isMine;
            if (activeMenu === 'shared') return !p.isMine;
            return true;
        });
    }, [projects, activeMenu, user?.uuid]);


    const handleCreateProject = async (title) => {
        if (!title || !title.trim() || isLoading) return;

        setIsLoading(true);

        try {
            const result = await ProjectService.create(title.trim(), user.id);
            if (result.success) await fetchProjects();
            else alert(result.message || "생성 실패");
        } catch (error) {
            alert("생성 실패: " + error.message);
        } finally {
            setIsLoading(false);
        }
    };

    const handleDeleteProject = async (ids) => {
        const targetIds = Array.isArray(ids) ? ids : [ids];
        if (targetIds.length === 0) return;
        setIsLoading(true);
        try {
            const ownedTargetIds = targetIds.filter((id) => {
                const project = filteredProjects.find((item) => item.id === id);
                return project?.isMine;
            });

            if (ownedTargetIds.length !== targetIds.length) {
                alert("프로젝트 삭제는 owner만 가능합니다.");
                return;
            }

            const result = await ProjectService.delete(ownedTargetIds, user?.uuid || user?.id);
            if (result.success) await fetchProjects();
        } catch (error) {
            alert("삭제 실패: " + error.message);
        } finally {
            setIsLoading(false);
        }
    };

    const handleDoubleClick = async (proj) => {
        if (isLoading) return;
        setIsLoading(true);
        try {
            const result = await ProjectService.getById(proj.id);
            if (result.success) setSelectedProject(result.data);
        } catch (error) {
            alert("입장 실패: " + error.message);
        } finally {
            setIsLoading(false);
        }
    };

    // 🎯 [신규 메서드] 인라인 편집 시작
    const startEditing = (projectId, currentTitle) => {
        setEditingProjectId(projectId);
        setEditTitle(currentTitle);
    };

    // 🎯 [신규 메서드] 인라인 편집 취소 (ESC 키 등)
    const cancelEditing = () => {
        setEditingProjectId(null);
        setEditTitle('');
    };

    // 🎯 [신규 메서드] 인라인 편집 완료 및 서버 전송 (Enter, Blur 발생 시)
    const handleRenameSubmit = async (projectId) => {
        if (!editTitle.trim()) {
            cancelEditing();
            return;
        }

        setIsLoading(true);
        try {
            const result = await ProjectService.renameProject(projectId, editTitle);
            if (result.success) {
                await fetchProjects(); // 성공 시 리스트 최신화
            } else {
                alert(result.message);
            }
        } catch (error) {
            alert("이름 변경 실패: " + error.message);
        } finally {
            setIsLoading(false);
            cancelEditing(); // 완료 후 입력창 닫기
        }
    };

    const triggerBrowserDownload = (blob, fileName) => {
        const blobUrl = window.URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = fileName || 'project.zip';
        document.body.appendChild(a);
        a.click();
        a.remove();

        window.URL.revokeObjectURL(blobUrl);
    };

    const handleDownloadProject = async (projectIds, type = 'zip') => {
        if (type !== 'zip') {
            alert("PDF 다운로드는 아직 지원되지 않습니다.");
            return;
        }

        const idsArray = Array.isArray(projectIds) ? projectIds : [projectIds];

        if (idsArray.length === 0) return;

        setIsLoading(true);

        try {
            for (const projectId of idsArray) {
                const project = projects.find(p => String(p.id) === String(projectId));
                const safeTitle = project?.title || 'project';
                const fallbackFileName = `${safeTitle}.zip`;

                const result = await ProjectService.downloadProject(projectId, fallbackFileName);

                if (result.success) {
                    triggerBrowserDownload(result.blob, result.fileName);
                } else {
                    alert(result.message || "프로젝트 다운로드 실패");
                }
            }
        } catch (error) {
            alert("다운로드 실패: " + error.message);
        } finally {
            setIsLoading(false);
        }
    };

    const handleDownloadPdfProject = async (projectId) => {
        if (!projectId) return;

        const project = projects.find(p => String(p.id) === String(projectId));
        const projectName = project?.title || 'compiled';

        setIsLoading(true);

        try {
            const result = await ProjectService.downloadProjectPdf(projectId, {
                downloadTarget: 'latest',
                userId: user?.uuid || user?.id,
                fileName: projectName
            });

            if (result.success) {
                triggerBrowserDownload(result.blob, result.fileName);
            } else {
                alert(result.message || 'PDF 다운로드 실패');
            }
        } catch (error) {
            alert('PDF 다운로드 실패: ' + error.message);
        } finally {
            setIsLoading(false);
        }
    };

    const extractInviteCode = (value) => {
        const raw = String(value || '').trim();

        if (!raw) return '';

        // 링크 전체를 넣은 경우 마지막 path segment를 코드로 사용
        // 예: http://localhost:5173/invite/editor/ABC123 -> ABC123
        try {
            const url = new URL(raw);
            const parts = url.pathname.split('/').filter(Boolean);
            return parts[parts.length - 1] || '';
        } catch {
            // URL이 아니라 그냥 코드만 넣은 경우
            const parts = raw.split('/').filter(Boolean);
            return parts[parts.length - 1] || raw;
        }
    };

    const handleJoinProjectRequest = async (inviteCodeOrLink) => {
        const inviteCode = extractInviteCode(inviteCodeOrLink);
        const userId = user?.uuid || user?.id;

        if (!inviteCode) {
            return {
                success: false,
                message: '초대 코드를 입력해주세요.'
            };
        }

        if (!userId) {
            return {
                success: false,
                message: '사용자 정보가 없습니다.'
            };
        }

        setIsLoading(true);

        try {
            const result = await CollaborationService.requestAccess(inviteCode, {
                userId
            });

            return result;
        } catch (error) {
            return {
                success: false,
                message: error.message || '참가 요청에 실패했습니다.'
            };
        } finally {
            setIsLoading(false);
        }
    };

    return {
        projects: filteredProjects,
        activeMenu,
        setActiveMenu,
        handleCreateProject,
        handleDeleteProject,
        handleDoubleClick,
        isLoading,
        editingProjectId,
        editTitle,
        setEditTitle,
        startEditing,
        cancelEditing,
        handleRenameSubmit,
        handleDownloadProject,
        handleDownloadPdfProject,
        handleJoinProjectRequest,
        dashboardNotice,
        closeDashboardNotice: () => setDashboardNotice(null)
    };
};
