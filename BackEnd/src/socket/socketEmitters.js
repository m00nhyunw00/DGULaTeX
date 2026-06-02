/**
 * =================================================================
 * [Socket] Socket Emitter Utilities
 * 설명: 컨트롤러와 로직 계층에서 사용할 협업 이벤트 송신 헬퍼를 제공함
 * =================================================================
 */
const entryLogic = require('../logics/entryLogic');

const getUserSocketsInProject = async (io, projectId, userId) => {
    if (!io || !projectId || !userId) return [];

    const cleanProjectId = entryLogic.normalizeId(projectId);
    const targetUserId = entryLogic.normalizeId(userId);

    const roomName = 'project:' + cleanProjectId;
    const socketIds = await io.in(roomName).allSockets();

    const targetSockets = [];

    for (const socketId of socketIds) {
        const socket = io.sockets.sockets.get(socketId);

        const socketUserId = entryLogic.normalizeId(
            socket?.data?.user?.uuid ||
            socket?.data?.user?.userUuid ||
            socket?.data?.user?.id
        );

        if (socketUserId === targetUserId) {
            targetSockets.push(socket);
        }
    }

    return targetSockets;
};

const emitToUserDashboard = async (
    io,
    userId,
    eventName,
    payload
) => {
    if (!io || !userId || !eventName) return 0;

    const cleanUserId = entryLogic.normalizeId(userId);
    const roomName = 'dashboard:user:' + cleanUserId;

    const socketIds = await io.in(roomName).allSockets();

    if (socketIds.size === 0) return 0;

    io.to(roomName).emit(eventName, payload);

    return socketIds.size;
};

const emitToUserInProject = async (
    io,
    projectId,
    userId,
    eventName,
    payload
) => {
    const targetSockets = await getUserSocketsInProject(io, projectId, userId);

    for (const socket of targetSockets) {
        socket.emit(eventName, payload);
    }

    return targetSockets.length;
};

const forceLeaveUserFromProject = async (
    io,
    projectId,
    userId
) => {
    const cleanProjectId = entryLogic.normalizeId(projectId);
    const roomName = `project:${cleanProjectId}`;

    const targetSockets = await getUserSocketsInProject(
        io,
        cleanProjectId,
        userId
    );

    for (const socket of targetSockets) {
        const user = socket.data?.user;

        socket.leave(roomName);

        socket.to(roomName).emit('project:user-left', {
            socketId: socket.id,
            user,
            reason: 'REMOVED_FROM_PROJECT'
        });

        if (
            entryLogic.normalizeId(socket.data?.projectId) ===
            cleanProjectId
        ) {
            socket.data.projectId = null;
            socket.data.user = null;
        }
    }

    return targetSockets.length;
};

module.exports = {
    getUserSocketsInProject,
    emitToUserDashboard,
    emitToUserInProject,
    forceLeaveUserFromProject
};