/**
 * =================================================================
 * [Utility] User Color Helper
 * 설명: 협업 사용자별 표시 색상을 일관되게 생성함
 * =================================================================
 */
const UNKNOWN_USER_COLOR = "#000000";
const colorRegistryByProject = new Map();

const hashText = (value = "") => {
    let hash = 2166136261;
    const text = String(value || "");

    for (let i = 0; i < text.length; i += 1) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, 16777619) >>> 0;
    }

    return hash >>> 0;
};

const hslToHex = (h, s, l) => {
    const saturation = s / 100;
    const lightness = l / 100;
    const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
    const x = chroma * (1 - Math.abs((h / 60) % 2 - 1));
    const m = lightness - chroma / 2;

    let r = 0;
    let g = 0;
    let b = 0;

    if (h < 60) {
        r = chroma;
        g = x;
    } else if (h < 120) {
        r = x;
        g = chroma;
    } else if (h < 180) {
        g = chroma;
        b = x;
    } else if (h < 240) {
        g = x;
        b = chroma;
    } else if (h < 300) {
        r = x;
        b = chroma;
    } else {
        r = chroma;
        b = x;
    }

    const toHex = (channel) => Math.round((channel + m) * 255)
        .toString(16)
        .padStart(2, "0");

    return "#" + toHex(r) + toHex(g) + toHex(b);
};

const normalizeColorKey = (value = "") =>
    String(value || "").replace(/^0x/i, "").replace(/-/g, "").toLowerCase().trim();

const componentToHex = (value) => value.toString(16).padStart(2, "0");

const rgbToHex = (r, g, b) =>
    "#" + componentToHex(r) + componentToHex(g) + componentToHex(b);

const hexToRgb = (hex) => {
    const value = String(hex || "").replace(/^#/, "");
    return {
        r: parseInt(value.slice(0, 2), 16),
        g: parseInt(value.slice(2, 4), 16),
        b: parseInt(value.slice(4, 6), 16)
    };
};

const keepVisibleAndNotBlack = (hex, hash) => {
    const { r, g, b } = hexToRgb(hex);
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;

    if (hex.toLowerCase() === UNKNOWN_USER_COLOR || brightness < 42) {
        return hslToHex(hash % 360, 72 + ((hash >>> 8) % 16), 42 + ((hash >>> 16) % 16));
    }

    return hex;
};

const makeCandidateColor = (key, attempt = 0) => {
    const hash = hashText(key + ":" + attempt);
    const r = 32 + (hash & 0xbf);
    const g = 32 + ((hash >>> 8) & 0xbf);
    const b = 32 + ((hash >>> 16) & 0xbf);

    return keepVisibleAndNotBlack(rgbToHex(r, g, b), hash);
};

export const getUserColor = (userId = "", projectId = "no-project") => {
    if (!userId || userId === "unknown") return UNKNOWN_USER_COLOR;

    const normalizedProjectId = normalizeColorKey(projectId) || "no-project";
    const normalizedUserId = normalizeColorKey(userId);
    const colorKey = normalizedProjectId + ":" + normalizedUserId;

    if (!colorRegistryByProject.has(normalizedProjectId)) {
        colorRegistryByProject.set(normalizedProjectId, {
            byUser: new Map(),
            used: new Set()
        });
    }

    const registry = colorRegistryByProject.get(normalizedProjectId);
    if (registry.byUser.has(normalizedUserId)) {
        return registry.byUser.get(normalizedUserId);
    }

    let color = makeCandidateColor(colorKey);
    let attempt = 1;

    while (registry.used.has(color.toLowerCase()) || color.toLowerCase() === UNKNOWN_USER_COLOR) {
        color = makeCandidateColor(colorKey, attempt);
        attempt += 1;
    }

    registry.byUser.set(normalizedUserId, color);
    registry.used.add(color.toLowerCase());

    return color;
};

export const getUserColors = (userIds = [], projectId = "no-project") => {
    const normalizedProjectId = normalizeColorKey(projectId) || "no-project";
    const normalizedUsers = Array.from(new Set(
        userIds
            .map((userId) => normalizeColorKey(userId))
            .filter((userId) => userId && userId !== "unknown")
    )).sort();

    const used = new Set();
    const colorsByUser = new Map();

    normalizedUsers.forEach((userId) => {
        const colorKey = normalizedProjectId + ":" + userId;
        let color = makeCandidateColor(colorKey);
        let attempt = 1;

        while (used.has(color.toLowerCase()) || color.toLowerCase() === UNKNOWN_USER_COLOR) {
            color = makeCandidateColor(colorKey, attempt);
            attempt += 1;
        }

        used.add(color.toLowerCase());
        colorsByUser.set(userId, color);
    });

    return colorsByUser;
};

export const getUserColorFromMap = (colorsByUser, userId = "") => {
    const normalizedUserId = normalizeColorKey(userId);
    return colorsByUser?.get(normalizedUserId) || UNKNOWN_USER_COLOR;
};

export const hexToRgba = (hex, alpha = 0.18) => {
    const match = String(hex || "").trim().match(/^#?([0-9a-f]{6})$/i);
    if (!match) return "rgba(47, 128, 237, " + alpha + ")";

    const value = match[1];
    const r = parseInt(value.slice(0, 2), 16);
    const g = parseInt(value.slice(2, 4), 16);
    const b = parseInt(value.slice(4, 6), 16);

    return "rgba(" + r + ", " + g + ", " + b + ", " + alpha + ")";
};
