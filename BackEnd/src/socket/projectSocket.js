/**
 * =================================================================
 * [Socket] Project Collaboration Socket
 * 설명: 프로젝트 단위 실시간 협업 입장, 퇴장, 커서, 파일 이벤트를 중계함
 * =================================================================
 */
const entryLogic = require('../logics/entryLogic');

function registerProjectSocket(io) {
    io.on('connection', (socket) => {
        socket.on('dashboard:join', ({ user }) => {
            const userId = entryLogic.normalizeId(
                user?.uuid ||
                user?.userUuid ||
                user?.id
            );

            if (!userId) return;

            const roomName = 'dashboard:user:' + userId;
            socket.join(roomName);
            socket.data.dashboardUser = user;
            socket.data.dashboardUserId = userId;

        });

        socket.on('dashboard:leave', ({ user } = {}) => {
            const userId = entryLogic.normalizeId(
                user?.uuid ||
                user?.userUuid ||
                user?.id ||
                socket.data.dashboardUserId
            );

            if (!userId) return;

            const roomName = 'dashboard:user:' + userId;
            socket.leave(roomName);
            socket.data.dashboardUser = null;
            socket.data.dashboardUserId = null;

        });

        socket.on('project:join', ({ projectId, user }) => {
            if (!projectId) return;

            const cleanProjectId = entryLogic.normalizeId(projectId);
            const roomName = `project:${cleanProjectId}`;

            socket.join(roomName);

            socket.data.projectId = cleanProjectId;
            socket.data.user = user;


            socket.to(roomName).emit('project:user-joined', {
                socketId: socket.id,
                user
            });
        });

        socket.on('project:leave', ({ projectId }) => {
            if (!projectId) return;

            const cleanProjectId = entryLogic.normalizeId(projectId);
            const roomName = `project:${cleanProjectId}`;

            socket.leave(roomName);


            socket.to(roomName).emit('project:user-left', {
                socketId: socket.id,
                user: socket.data.user
            });

            if (socket.data.projectId === cleanProjectId) {
                socket.data.projectId = null;
                socket.data.user = null;
            }
        });
        /*

        socket.on('project:join', ({ projectId, user }) => {
            if (!projectId) return;

            const roomName = `project:${projectId}`;

            socket.join(roomName);

            socket.data.projectId = projectId;
            socket.data.user = user;


            socket.to(roomName).emit('project:user-joined', {
                socketId: socket.id,
                user
            });
        });

        socket.on('project:leave', ({ projectId }) => {
            if (!projectId) return;

            const roomName = `project:${projectId}`;

            socket.leave(roomName);


            socket.to(roomName).emit('project:user-left', {
                socketId: socket.id,
                user: socket.data.user
            });

            if (socket.data.projectId === projectId) {
                socket.data.projectId = null;
                socket.data.user = null;
            }
        });
        */

        socket.on('disconnect', () => {
            const projectId = socket.data.projectId;
            const user = socket.data.user;

            if (projectId) {
                socket.to(`project:${projectId}`).emit('project:user-left', {
                    socketId: socket.id,
                    user
                });
            }

        });
    });
}

module.exports = registerProjectSocket;