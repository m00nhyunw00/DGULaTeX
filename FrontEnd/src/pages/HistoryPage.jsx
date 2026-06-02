/**
 * =================================================================
 * [Page] History Page Composition
 * 설명: 페이지 단위 레이아웃과 화면 훅, UI 컴포넌트 조립을 담당함
 * =================================================================
 */
import React from 'react';
import HistoryUI from '../components/History/HistoryUI';
import { useHistory } from '../hooks/useHistory';

const normalizeId = (value) =>
    String(value || "")
        .replace(/^0x/i, "")
        .replace(/-/g, "")
        .toLowerCase()
        .trim();

/**
 * @param {Object} user - 현재 인증된 사용자 정보
 * @param {Object} project - 대시보드 또는 에디터에서 선택된 현재 프로젝트 객체
 * @param {Function} backToEditor - 히스토리 조회를 마치고 에디터로 돌아가는 내비게이션 함수
 */
function HistoryPage({ user, project, backToEditor }) {

    /* ---------------------------------------------------------
     * SECTION 1: History Logic Integration
     * 기능: useHistory 훅을 통해 특정 프로젝트의 시점별 데이터를 로드하고 상태를 관리
     * 비고: project.id를 기반으로 관련 히스토리 셋(Mock/API)을 매칭
     * --------------------------------------------------------- */
    const projectId = project?.id || project?._id || project?.projectId;
    const historyData = useHistory(projectId, user);
    const isProjectOwner = project?.ownerId
        ? normalizeId(project.ownerId) === normalizeId(user?.uuid || user?.id)
        : true;


    /* ---------------------------------------------------------
     * SECTION 2: UI View Composition
     * 기능: 가공된 히스토리 상태와 복구 관련 핸들러를 HistoryUI 컴포넌트로 전파
     * --------------------------------------------------------- */
    return (
        <HistoryUI
            projectName={project.title} // 화면 상단에 표시될 프로젝트명
            projectId={projectId}
            isProjectOwner={isProjectOwner}
            backToEditor={backToEditor}   // 뒤로가기 액션 연동
            {...historyData}             // historyList, selectedHistory, rollback 함수 등을 일괄 전달
        />
    );
}

export default HistoryPage;