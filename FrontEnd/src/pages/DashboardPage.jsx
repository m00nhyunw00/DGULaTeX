/**
 * =================================================================
 * [Page] Dashboard Page Composition
 * 설명: 페이지 단위 레이아웃과 화면 훅, UI 컴포넌트 조립을 담당함
 * =================================================================
 */
import React from 'react';
import DashboardUI from '../components/Dashboard/DashboardUI';
import { useDashboard } from '../hooks/useDashboard';

/**
 * @param {Object} user - 현재 인증된 사용자 정보 (이름, 아이디 등)
 * @param {Function} handleLogout - 로그아웃 처리를 위한 전역 핸들러
 * @param {Function} setSelectedProject - 특정 프로젝트 진입 시 App 수준에서 상태를 변경하기 위한 함수
 */
function DashboardPage({ user, handleLogout, setSelectedProject }) {

    /* ---------------------------------------------------------
     * SECTION 1: Business Logic Integration
     * 기능: useDashboard 훅을 통해 대시보드 운영 로직 인스턴스 생성
     * 비고: 데이터 획득 로직은 훅 내부로 캡슐화됨
     * --------------------------------------------------------- */
    const dashboardLogic = useDashboard(setSelectedProject, user);

    /* ---------------------------------------------------------
     * SECTION 2: UI Composition
     * 기능: 가공된 데이터와 로직 핸들러를 DashboardUI 컴포넌트로 전파
     * --------------------------------------------------------- */
    return (
        <DashboardUI
            userName={user.name}            // 사용자 이름 시각화용
            userId={user.id}
            userUuid={user.uuid}            // 실제 탈퇴 API용 식별자 추가
            handleLogout={handleLogout}     // 로그아웃 액션 연동
            {...dashboardLogic}             // projects, filters, CRUD 핸들러 일괄 전달
        />
    );
}

export default DashboardPage;