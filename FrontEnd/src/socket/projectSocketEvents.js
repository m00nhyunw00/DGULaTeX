/**
 * =================================================================
 * [Socket] Project Socket Event Constants
 * 설명: 프론트엔드와 백엔드가 공유하는 프로젝트 협업 이벤트 이름을 정의함
 * =================================================================
 */
export const PROJECT_SOCKET_EVENTS = {
    USER_JOINED: 'project:user-joined',
    USER_LEFT: 'project:user-left',
    USERS: 'project:users',

    MEMBER_ROLE_UPDATED: 'member:role-updated',
    MY_ROLE_UPDATED: 'member:my-role-updated',
    EDIT_PERMISSION_REVOKED: 'member:edit-permission-revoked',

    OWNER_TRANSFERRED: 'project:owner-transferred',

    MEMBER_REMOVED: 'member:removed',
    REMOVED_FROM_PROJECT: 'member:removed-from-project'
};

/**
 * 프로젝트 관련 Socket.io 이벤트 등록
 *
 * @param {Socket} socket socket.io-client 인스턴스
 * @param {Object} handlers 이벤트별 핸들러 모음
 */
export function registerProjectSocketEvents(socket, handlers = {}) {
    if (!socket) return;

    socket.on(PROJECT_SOCKET_EVENTS.USER_JOINED, handlers.onUserJoined);
    socket.on(PROJECT_SOCKET_EVENTS.USER_LEFT, handlers.onUserLeft);
    socket.on(PROJECT_SOCKET_EVENTS.USERS, handlers.onUsers);

    socket.on(PROJECT_SOCKET_EVENTS.MEMBER_ROLE_UPDATED, handlers.onMemberRoleUpdated);
    socket.on(PROJECT_SOCKET_EVENTS.MY_ROLE_UPDATED, handlers.onMyRoleUpdated);
    socket.on(PROJECT_SOCKET_EVENTS.EDIT_PERMISSION_REVOKED, handlers.onEditPermissionRevoked);

    socket.on(PROJECT_SOCKET_EVENTS.OWNER_TRANSFERRED, handlers.onOwnerTransferred);

    socket.on(PROJECT_SOCKET_EVENTS.MEMBER_REMOVED, handlers.onMemberRemoved);
    socket.on(PROJECT_SOCKET_EVENTS.REMOVED_FROM_PROJECT, handlers.onRemovedFromProject);
}

/**
 * 프로젝트 관련 Socket.io 이벤트 해제
 *
 * registerProjectSocketEvents에 넘긴 handler와 동일한 함수 참조를 넘겨야 정상 해제된다.
 *
 * @param {Socket} socket socket.io-client 인스턴스
 * @param {Object} handlers 이벤트별 핸들러 모음
 */
export function unregisterProjectSocketEvents(socket, handlers = {}) {
    if (!socket) return;

    socket.off(PROJECT_SOCKET_EVENTS.USER_JOINED, handlers.onUserJoined);
    socket.off(PROJECT_SOCKET_EVENTS.USER_LEFT, handlers.onUserLeft);
    socket.off(PROJECT_SOCKET_EVENTS.USERS, handlers.onUsers);

    socket.off(PROJECT_SOCKET_EVENTS.MEMBER_ROLE_UPDATED, handlers.onMemberRoleUpdated);
    socket.off(PROJECT_SOCKET_EVENTS.MY_ROLE_UPDATED, handlers.onMyRoleUpdated);
    socket.off(PROJECT_SOCKET_EVENTS.EDIT_PERMISSION_REVOKED, handlers.onEditPermissionRevoked);

    socket.off(PROJECT_SOCKET_EVENTS.OWNER_TRANSFERRED, handlers.onOwnerTransferred);

    socket.off(PROJECT_SOCKET_EVENTS.MEMBER_REMOVED, handlers.onMemberRemoved);
    socket.off(PROJECT_SOCKET_EVENTS.REMOVED_FROM_PROJECT, handlers.onRemovedFromProject);
}