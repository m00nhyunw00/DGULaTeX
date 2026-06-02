/**
 * =================================================================
 * [App] Client Router Composition
 * 설명: 프론트엔드 라우팅과 주요 페이지 진입점을 구성함
 * =================================================================
 */
import React, { useCallback, useEffect, useState } from "react";
import { Navigate, Route, Routes, useNavigate, useParams } from "react-router-dom";

import LoginPage from "./pages/LoginPage.jsx";
import DashboardPage from "./pages/DashboardPage.jsx";
import EditorPage from "./pages/EditorPage.jsx";
import HistoryPage from "./pages/HistoryPage.jsx";
import { AuthService } from "./services/AuthService";
import { clearStoredSessionToken, getLogoutEventKey } from "./api/auth";
import { ProjectService } from "./services/ProjectService";

const normalizeId = (value) => String(value || "").replace(/-/g, "").toLowerCase().trim();

const createEmptyChatState = () => ({
    isOpen: false,
    input: "",
    chatLog: []
});

function LoadingScreen({ message = "불러오는 중입니다..." }) {
    return (
        <div className="vh-100 d-flex align-items-center justify-content-center text-muted">
            {message}
        </div>
    );
}

function ProtectedRoute({ isHydrating, isLoggedIn, children }) {
    if (isHydrating) return <LoadingScreen message="로그인 상태를 확인하는 중입니다..." />;
    if (!isLoggedIn) return <Navigate to="/login" replace />;

    return children;
}

function LoginRoute({ isHydrating, isLoggedIn, children }) {
    if (isHydrating) return <LoadingScreen message="로그인 상태를 확인하는 중입니다..." />;
    if (isLoggedIn) return <Navigate to="/dashboard" replace />;

    return children;
}

function ProjectRoute({
    mode,
    user,
    selectedProject,
    setSelectedProject,
    handleLogout,
    projectChatStates,
    setProjectChatStates,
    clearProjectChat
}) {
    const { projectId } = useParams();
    const navigate = useNavigate();
    const [isProjectLoading, setIsProjectLoading] = useState(false);
    const [loadError, setLoadError] = useState("");

    useEffect(() => {
        const currentId = selectedProject?.id || selectedProject?._id || selectedProject?.projectId;

        if (normalizeId(currentId) === normalizeId(projectId)) return;
        if (!projectId) return;

        let isCancelled = false;

        const loadProject = async () => {
            setIsProjectLoading(true);
            setLoadError("");

            try {
                const result = await ProjectService.getById(projectId);

                if (!isCancelled && result.success) {
                    setSelectedProject(result.data);
                }
            } catch (error) {
                if (!isCancelled) {
                    setLoadError(error.message || "프로젝트를 불러오지 못했습니다.");
                }
            } finally {
                if (!isCancelled) setIsProjectLoading(false);
            }
        };

        loadProject();

        return () => {
            isCancelled = true;
        };
    }, [projectId, selectedProject, setSelectedProject]);

    useEffect(() => {
        if (mode !== "history" || !projectId) return undefined;

        let isCancelled = false;

        const refreshProjectForHistory = async () => {
            try {
                const result = await ProjectService.getById(projectId);

                if (!isCancelled && result.success) {
                    setSelectedProject((prev) => ({
                        ...(prev || {}),
                        ...result.data
                    }));
                }
            } catch (error) {
                // 히스토리 진입 시 권한 표시 최신화 실패는 기존 프로젝트 화면 흐름을 막지 않는다.
                console.error("[PROJECT REFRESH ERROR]", error);
            }
        };

        refreshProjectForHistory();

        return () => {
            isCancelled = true;
        };
    }, [mode, projectId, setSelectedProject]);

    const project = selectedProject;
    const currentId = project?.id || project?._id || project?.projectId;

    if (isProjectLoading || normalizeId(currentId) !== normalizeId(projectId)) {
        if (loadError) {
            return (
                <div className="vh-100 d-flex flex-column align-items-center justify-content-center gap-3 text-muted">
                    <div>{loadError}</div>
                    <button className="btn btn-sm btn-outline-secondary" onClick={() => navigate("/dashboard", { replace: true })}>
                        대시보드로 이동
                    </button>
                </div>
            );
        }

        return <LoadingScreen message="프로젝트를 불러오는 중입니다..." />;
    }

    const chatKey = normalizeId(projectId);
    const chatState = projectChatStates[chatKey] || createEmptyChatState();
    const setChatState = (updater) => {
        setProjectChatStates((prev) => {
            const current = prev[chatKey] || createEmptyChatState();
            const next = typeof updater === "function" ? updater(current) : updater;
            return {
                ...prev,
                [chatKey]: next || createEmptyChatState()
            };
        });
    };

    if (mode === "history") {
        return (
            <HistoryPage
                user={user}
                project={project}
                backToEditor={(state) => {
                    const navigationState = state?.forceDbOnOpen ? state : null;
                    const nextMainEntryId = state?.mainEntryId;

                    if (nextMainEntryId) {
                        const normalizedMainEntryId = normalizeId(nextMainEntryId);

                        setSelectedProject((prev) => prev
                            ? {
                                ...prev,
                                mainEntryId: normalizedMainEntryId,
                                mainFileId: normalizedMainEntryId,
                                lastOpenedFileId: normalizedMainEntryId
                            }
                            : prev
                        );
                    }

                    navigate(`/projects/${projectId}`, navigationState ? { state: navigationState } : {});
                }}
            />
        );
    }

    return (
        <EditorPage
            user={user}
            project={project}
            handleLogout={handleLogout}
            backToDashboard={() => {
                clearProjectChat(projectId);
                setSelectedProject(null);
                navigate("/dashboard");
            }}
            goToHistory={() => navigate(`/projects/${projectId}/history`)}
            setSelectedProject={setSelectedProject}
            chatState={chatState}
            setChatState={setChatState}
        />
    );
}

function App() {
    const navigate = useNavigate();
    const [isHydrating, setIsHydrating] = useState(true);
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [user, setUser] = useState({ id: "", uuid: "", name: "" });
    const [selectedProject, setSelectedProject] = useState(null);
    const [sessionExpiredMessage, setSessionExpiredMessage] = useState("");
    const [sessionExpiredTitle, setSessionExpiredTitle] = useState("로그인 유지 시간이 만료되었습니다");
    const [projectChatStates, setProjectChatStates] = useState({});

    useEffect(() => {
        let isCancelled = false;

        const restoreSession = async () => {
            const result = await AuthService.restoreSession();

            if (isCancelled) return;

            if (result.success) {
                setUser(result.user);
                setIsLoggedIn(true);
            } else {
                setUser({ id: "", uuid: "", name: "" });
                setIsLoggedIn(false);

                if (result.message && result.message.includes("로그인 유지")) {
                    setSessionExpiredTitle("로그인 유지 시간이 만료되었습니다");
                    setSessionExpiredMessage(result.message);
                }
            }

            setIsHydrating(false);
        };

        restoreSession();

        return () => {
            isCancelled = true;
        };
    }, []);

    const clearProjectChat = useCallback((projectId) => {
        const key = normalizeId(projectId);
        if (!key) return;

        setProjectChatStates((prev) => {
            if (!prev[key]) return prev;
            const next = { ...prev };
            delete next[key];
            return next;
        });
    }, []);

    const handleLoginSuccess = useCallback((userData) => {
        setUser(userData);
        setIsLoggedIn(true);
        setSessionExpiredTitle("로그인 유지 시간이 만료되었습니다");
        setSessionExpiredMessage("");
        navigate("/dashboard", { replace: true });
    }, [navigate]);

    const handleProjectSelect = useCallback((project) => {
        const projectId = project?.id || project?._id || project?.projectId;
        if (!projectId) return;

        setSelectedProject(project);
        navigate(`/projects/${projectId}`);
    }, [navigate]);

    const handleLogout = useCallback(async () => {
        await AuthService.logout();
        setIsLoggedIn(false);
        setUser({ id: "", uuid: "", name: "" });
        setSelectedProject(null);
        setProjectChatStates({});
        setSessionExpiredTitle("로그인 유지 시간이 만료되었습니다");
        setSessionExpiredMessage("");
        navigate("/login", { replace: true });
    }, [navigate]);

    useEffect(() => {
        if (!isLoggedIn) return undefined;

        let isCancelled = false;

        const refreshSession = async () => {
            const result = await AuthService.refreshSession();

            if (isCancelled || result.success) return;

            setIsLoggedIn(false);
            setUser({ id: "", uuid: "", name: "" });
            setSelectedProject(null);
            setProjectChatStates({});
            setSessionExpiredTitle("로그인 유지 시간이 만료되었습니다");
            setSessionExpiredMessage(result.message || "로그인 유지 시간이 만료되었습니다.");
            navigate("/login", { replace: true });
        };

        const intervalId = window.setInterval(refreshSession, 60 * 1000);

        const handleVisibilityChange = () => {
            if (document.visibilityState === "visible") {
                refreshSession();
            }
        };

        document.addEventListener("visibilitychange", handleVisibilityChange);

        return () => {
            isCancelled = true;
            window.clearInterval(intervalId);
            document.removeEventListener("visibilitychange", handleVisibilityChange);
        };
    }, [isLoggedIn, navigate]);

    useEffect(() => {
        const handleStorageChange = (event) => {
            if (event.key !== getLogoutEventKey() || !event.newValue) return;

            clearStoredSessionToken();
            setIsLoggedIn(false);
            setUser({ id: "", uuid: "", name: "" });
            setSelectedProject(null);
            setProjectChatStates({});
            setSessionExpiredTitle("로그아웃되었습니다");
            setSessionExpiredMessage("다른 탭에서 로그아웃되어 로그인 화면으로 이동합니다.");
            navigate("/login", { replace: true });
        };

        window.addEventListener("storage", handleStorageChange);

        return () => {
            window.removeEventListener("storage", handleStorageChange);
        };
    }, [navigate]);

    const closeSessionExpiredModal = useCallback(() => {
        setSessionExpiredMessage("");
        navigate("/login", { replace: true });
    }, [navigate]);

    return (
        <>
        <Routes>
            <Route
                path="/login"
                element={
                    <LoginRoute isHydrating={isHydrating} isLoggedIn={isLoggedIn}>
                        <LoginPage setIsLoggedIn={setIsLoggedIn} setUser={handleLoginSuccess} />
                    </LoginRoute>
                }
            />

            <Route
                path="/dashboard"
                element={
                    <ProtectedRoute isHydrating={isHydrating} isLoggedIn={isLoggedIn}>
                        <DashboardPage
                            user={user}
                            handleLogout={handleLogout}
                            setSelectedProject={handleProjectSelect}
                        />
                    </ProtectedRoute>
                }
            />

            <Route
                path="/projects/:projectId"
                element={
                    <ProtectedRoute isHydrating={isHydrating} isLoggedIn={isLoggedIn}>
                        <ProjectRoute
                            mode="editor"
                            user={user}
                            selectedProject={selectedProject}
                            setSelectedProject={setSelectedProject}
                            handleLogout={handleLogout}
                            projectChatStates={projectChatStates}
                            setProjectChatStates={setProjectChatStates}
                            clearProjectChat={clearProjectChat}
                        />
                    </ProtectedRoute>
                }
            />

            <Route
                path="/projects/:projectId/history"
                element={
                    <ProtectedRoute isHydrating={isHydrating} isLoggedIn={isLoggedIn}>
                        <ProjectRoute
                            mode="history"
                            user={user}
                            selectedProject={selectedProject}
                            setSelectedProject={setSelectedProject}
                            handleLogout={handleLogout}
                            projectChatStates={projectChatStates}
                            setProjectChatStates={setProjectChatStates}
                            clearProjectChat={clearProjectChat}
                        />
                    </ProtectedRoute>
                }
            />

            <Route
                path="/"
                element={<Navigate to={isLoggedIn ? "/dashboard" : "/login"} replace />}
            />
            <Route path="*" element={<Navigate to={isLoggedIn ? "/dashboard" : "/login"} replace />} />
        </Routes>

        {sessionExpiredMessage && (
            <div className="session-expired-modal-overlay" role="dialog" aria-modal="true">
                <div className="session-expired-modal-box shadow-lg">
                    <h5 className="fw-bold mb-3">{sessionExpiredTitle}</h5>
                    <p className="text-muted mb-4">
                        {sessionExpiredMessage}<br />다시 로그인해주세요.
                    </p>
                    <button className="btn btn-dgu px-4" onClick={closeSessionExpiredModal}>
                        로그인 화면으로 이동
                    </button>
                </div>
            </div>
        )}
        </>
    );
}

export default App;
