/**
 * =================================================================
 * [Service] Session Store
 * 설명: 로그인 세션 토큰과 사용자 정보를 메모리에서 관리함
 * =================================================================
 */
const crypto = require("crypto");

const DEFAULT_TTL_MS = Number(process.env.SESSION_TTL_MS || 60 * 60 * 1000);

const sessionsByToken = new Map();
const activeTokensByUserId = new Map();

const now = () => Date.now();

const isExpired = (session) => !session || session.expiresAt <= now();

const addActiveToken = (userId, token) => {
    if (!activeTokensByUserId.has(userId)) {
        activeTokensByUserId.set(userId, new Set());
    }

    activeTokensByUserId.get(userId).add(token);
};

const removeActiveToken = (userId, token) => {
    const tokens = activeTokensByUserId.get(userId);
    if (!tokens) return;

    tokens.delete(token);

    if (tokens.size === 0) {
        activeTokensByUserId.delete(userId);
    }
};

const removeSession = (token) => {
    const session = sessionsByToken.get(token);
    if (!session) return null;

    sessionsByToken.delete(token);
    removeActiveToken(session.user.uuid, token);

    return session;
};

const getSession = (token, { refresh = true } = {}) => {
    if (!token) return null;

    const session = sessionsByToken.get(token);
    if (isExpired(session)) {
        removeSession(token);
        return null;
    }

    if (refresh) {
        session.expiresAt = now() + DEFAULT_TTL_MS;
        sessionsByToken.set(token, session);
    }

    return session;
};

const getActiveSessionsByUserId = (userId) => {
    const tokens = activeTokensByUserId.get(userId);
    if (!tokens) return [];

    const sessions = [];

    for (const token of Array.from(tokens)) {
        const session = getSession(token, { refresh: false });

        if (session) {
            sessions.push(session);
        }
    }

    return sessions;
};

const getActiveSessionByUserId = (userId) => {
    return getActiveSessionsByUserId(userId)[0] || null;
};

const createSession = (user) => {
    const activeSession = getActiveSessionByUserId(user.uuid);

    if (activeSession) {
        return {
            ok: false,
            reason: "ALREADY_LOGGED_IN",
            session: activeSession
        };
    }

    const token = crypto.randomBytes(32).toString("hex");
    const session = {
        token,
        user,
        createdAt: now(),
        expiresAt: now() + DEFAULT_TTL_MS
    };

    sessionsByToken.set(token, session);
    addActiveToken(user.uuid, token);

    return {
        ok: true,
        session
    };
};

const deleteSession = (token) => {
    removeSession(token);
};

const extractToken = (req) => {
    const header = req.get("authorization") || "";
    const match = header.match(/^Bearer\s+(.+)$/i);

    return match ? match[1].trim() : "";
};

module.exports = {
    createSession,
    deleteSession,
    extractToken,
    getSession
};
