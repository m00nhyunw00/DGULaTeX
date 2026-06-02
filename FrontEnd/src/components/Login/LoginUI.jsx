/**
 * =================================================================
 * [Component] Login UI Component
 * 설명: 사용자 인터페이스 렌더링과 화면 상호작용을 담당함
 * =================================================================
 */
import React, { useState } from 'react';
import './LoginUI.css';

const TEAM_NAME = '2026-1학기-종합설계1-2분반-8조';

const TEAM_MEMBERS = [
    { role: '멘토교수', name: '이강만', organization: '동국대학교', major: '컴퓨터·AI학부'},
    { role: '팀장', name: '문현우', organization: '동국대학교', major: '컴퓨터·AI학부', student_id:'2019112014', part: '풀스택 개발'},
    { role: '팀원', name: '정서영', organization: '동국대학교', major: '컴퓨터·AI학부', student_id:'2021110943', part: '백엔드 개발 및 DB 설계'},
    { role: '팀원', name: '오재원', organization: '동국대학교', major: '멀티미디어공학과', student_id:'2021112479', part: '협업 환경 및 컴파일러 개발'}
];

function LoginUI({
    studentId,
    setStudentId,
    password,
    setPassword,
    handleLogin,
    error,
    successMessage,
    isSubmitting,
    authMode,
    switchAuthMode,
    registerStudentId,
    setRegisterStudentId,
    registerPassword,
    setRegisterPassword,
    registerPasswordConfirm,
    setRegisterPasswordConfirm,
    registerUserName,
    setRegisterUserName,
    changePasswordStudentId,
    setChangePasswordStudentId,
    oldPassword,
    setOldPassword,
    newPassword,
    setNewPassword,
    newPasswordConfirm,
    setNewPasswordConfirm,
    handleRegister,
    handleChangePassword
}) {
    const [isTeamModalOpen, setIsTeamModalOpen] = useState(false);
    const isRegisterMode = authMode === 'register';

    return (
        /* ---------------------------------------------------------
         * SECTION 0: Login Page Screen Wrapper
         * 기능: 뷰포트 전체(100vw/100vh)를 차지하고 자식 요소를 정중앙에 배치
         * --------------------------------------------------------- */
        <div className="login-page-container">

            {/* ---------------------------------------------------------
             * SECTION 1: Login Card Wrapper
             * 기능: Glassmorphism 스타일이 적용된 반투명 카드 컨테이너
             * --------------------------------------------------------- */}
            <div className="login-card-glass shadow-lg">

                {/* 파트 1: 브랜드 로고 및 서비스 타이틀 영역 */}
                <div className="text-center mb-4">
                    <h1 className="dgu-logo">DGULaTeX</h1>
                    <p className="text-secondary small">동국대학교 온라인 LaTeX 편집기</p>
                </div>

                {/* 파트 2: 인증 모드 전환 탭 */}
                {authMode !== 'changePassword' && (
                    <div className="auth-mode-tabs" role="tablist" aria-label="인증 모드">
                    <button
                        type="button"
                        className={authMode === 'login' ? 'active' : ''}
                        onClick={() => switchAuthMode('login')}
                    >
                        로그인
                    </button>
                    <button
                        type="button"
                        className={isRegisterMode ? 'active' : ''}
                        onClick={() => switchAuthMode('register')}
                    >
                        회원가입
                    </button>
                    </div>
                )}

                {/* 파트 3: 조건부 피드백 메시지 렌더링 */}
                {error && (
                    <div className="alert alert-danger py-2 small text-center mb-3 animate__animated animate__shakeX">
                        {error}
                    </div>
                )}

                {successMessage && (
                    <div className="alert alert-success py-2 small text-center mb-3">
                        {successMessage}
                    </div>
                )}

                {authMode === 'login' ? (
                    /* ---------------------------------------------------------
                     * SECTION 2: Login Form
                     * 기능: 사용자 입력을 수집하고 로그인 Submit 이벤트를 처리
                     * --------------------------------------------------------- */
                    <form onSubmit={handleLogin}>
                        <div className="form-floating mb-3">
                            <input
                                type="text"
                                className="form-control dgu-input"
                                id="studentId"
                                placeholder="ID"
                                value={studentId}
                                onChange={(e) => setStudentId(e.target.value)}
                                disabled={isSubmitting}
                                required
                            />
                            <label htmlFor="studentId">학번/사번</label>
                        </div>

                        <div className="form-floating mb-4">
                            <input
                                type="password"
                                className="form-control dgu-input"
                                id="password"
                                placeholder="Password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                disabled={isSubmitting}
                                required
                            />
                            <label htmlFor="password">비밀번호</label>
                        </div>

                        <button className="btn btn-dgu-primary w-100 py-3 fw-bold" type="submit" disabled={isSubmitting}>
                            {isSubmitting ? '로그인 중...' : '로그인'}
                        </button>

                        <div className="auth-sub-action">
                            <button
                                type="button"
                                className="auth-link-button"
                                onClick={() => switchAuthMode('changePassword')}
                                disabled={isSubmitting}
                            >
                                비밀번호를 변경하시겠습니까?
                            </button>
                        </div>
                    </form>
                ) : isRegisterMode ? (
                    /* ---------------------------------------------------------
                     * SECTION 3: Register Form
                     * 기능: 사용자 입력을 수집하고 회원가입 Submit 이벤트를 처리
                     * --------------------------------------------------------- */
                    <form onSubmit={handleRegister}>
                        <div className="form-floating mb-3">
                            <input
                                type="text"
                                className="form-control dgu-input"
                                id="registerStudentId"
                                placeholder="Student ID"
                                value={registerStudentId}
                                onChange={(e) => setRegisterStudentId(e.target.value)}
                                disabled={isSubmitting}
                                required
                            />
                            <label htmlFor="registerStudentId">학번/사번</label>
                        </div>

                        <div className="form-floating mb-3">
                            <input
                                type="text"
                                className="form-control dgu-input"
                                id="registerUserName"
                                placeholder="Name"
                                value={registerUserName}
                                onChange={(e) => setRegisterUserName(e.target.value)}
                                disabled={isSubmitting}
                                required
                            />
                            <label htmlFor="registerUserName">이름</label>
                        </div>

                        <div className="form-floating mb-3">
                            <input
                                type="password"
                                className="form-control dgu-input"
                                id="registerPassword"
                                placeholder="Password"
                                value={registerPassword}
                                onChange={(e) => setRegisterPassword(e.target.value)}
                                disabled={isSubmitting}
                                required
                            />
                            <label htmlFor="registerPassword">비밀번호</label>
                        </div>

                        <div className="form-floating mb-4">
                            <input
                                type="password"
                                className="form-control dgu-input"
                                id="registerPasswordConfirm"
                                placeholder="Password Confirm"
                                value={registerPasswordConfirm}
                                onChange={(e) => setRegisterPasswordConfirm(e.target.value)}
                                disabled={isSubmitting}
                                required
                            />
                            <label htmlFor="registerPasswordConfirm">비밀번호 확인</label>
                        </div>

                        <button className="btn btn-dgu-primary w-100 py-3 fw-bold" type="submit" disabled={isSubmitting}>
                            {isSubmitting ? '가입 처리 중...' : '회원가입'}
                        </button>
                    </form>
                ) : (
                    /* ---------------------------------------------------------
                     * SECTION 4: Change Password Form
                     * 기능: 기존 비밀번호 확인 후 새 비밀번호로 변경
                     * --------------------------------------------------------- */
                    <form onSubmit={handleChangePassword}>
                        <div className="auth-form-heading">
                            <strong>비밀번호 변경</strong>
                        </div>
                        <div className="form-floating mb-3">
                            <input
                                type="text"
                                className="form-control dgu-input"
                                id="changePasswordStudentId"
                                placeholder="Student ID"
                                value={changePasswordStudentId}
                                onChange={(e) => setChangePasswordStudentId(e.target.value)}
                                disabled={isSubmitting}
                                required
                            />
                            <label htmlFor="changePasswordStudentId">학번/사번</label>
                        </div>

                        <div className="form-floating mb-3">
                            <input
                                type="password"
                                className="form-control dgu-input"
                                id="oldPassword"
                                placeholder="Current Password"
                                value={oldPassword}
                                onChange={(e) => setOldPassword(e.target.value)}
                                disabled={isSubmitting}
                                required
                            />
                            <label htmlFor="oldPassword">기존 비밀번호</label>
                        </div>

                        <div className="form-floating mb-3">
                            <input
                                type="password"
                                className="form-control dgu-input"
                                id="newPassword"
                                placeholder="New Password"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                disabled={isSubmitting}
                                required
                            />
                            <label htmlFor="newPassword">새 비밀번호</label>
                        </div>

                        <div className="form-floating mb-4">
                            <input
                                type="password"
                                className="form-control dgu-input"
                                id="newPasswordConfirm"
                                placeholder="New Password Confirm"
                                value={newPasswordConfirm}
                                onChange={(e) => setNewPasswordConfirm(e.target.value)}
                                disabled={isSubmitting}
                                required
                            />
                            <label htmlFor="newPasswordConfirm">새 비밀번호 확인</label>
                        </div>

                        <button className="btn btn-dgu-primary w-100 py-3 fw-bold" type="submit" disabled={isSubmitting}>
                            {isSubmitting ? '변경 처리 중...' : '비밀번호 변경'}
                        </button>

                        <div className="auth-sub-action">
                            <button
                                type="button"
                                className="auth-link-button"
                                onClick={() => switchAuthMode('login')}
                                disabled={isSubmitting}
                            >
                                로그인으로 돌아가기
                            </button>
                        </div>
                    </form>
                )}

                <div className="login-credit">
                    © 2026 
                    <button
                        type="button"
                        className="team-credit-link"
                        onClick={() => setIsTeamModalOpen(true)}
                    >
                        DGULaTeX Team
                    </button>
                </div>
            </div>

            {isTeamModalOpen && (
                <div
                    className="team-modal-backdrop"
                    role="presentation"
                    onMouseDown={() => setIsTeamModalOpen(false)}
                >
                    <section
                        className="team-modal"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="team-modal-title"
                        onMouseDown={(event) => event.stopPropagation()}
                    >
                        <div className="team-modal-header">
                            <div>
                                <p className="team-modal-kicker">Developed by</p>
                                <h2 id="team-modal-title">{TEAM_NAME}</h2>
                            </div>
                            <button
                                type="button"
                                className="team-modal-close"
                                onClick={() => setIsTeamModalOpen(false)}
                                aria-label="팀 정보 닫기"
                            >
                                ×
                            </button>
                        </div>

                        <div className="team-member-list">
                            {TEAM_MEMBERS.map((member) => (
                                <article className="team-member-item" key={member.role + "-" + member.name}>
                                    <div>
                                        <span className="team-member-role">{member.role}</span>
                                        <strong>{member.name}</strong>
                                    </div>
                                    <div className="team-member-meta">
                                        <span>{member.organization}</span>  
                                        <span>{member.major}</span>
                                        <span>{member.student_id}</span>
                                    </div>
                                    {member.part && (
                                        <div className="team-member-part">
                                            {member.part}
                                        </div>
                                    )}
                                </article>
                            ))}
                        </div>
                    </section>
                </div>
            )}
        </div>
    );
}

export default LoginUI;
