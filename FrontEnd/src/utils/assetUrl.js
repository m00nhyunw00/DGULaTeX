/**
 * =================================================================
 * [Utility] Asset URL Resolver
 * 설명: 백엔드에서 내려온 에셋 경로를 브라우저에서 접근 가능한 URL로 정규화함
 * =================================================================
 */
const API_BASE_URL =
    import.meta.env.VITE_API_URL;

export const buildAssetUrl = (assetUrl) => {
    if (!assetUrl) return '';

    // 이미 절대 URL이면 그대로 사용
    if (
        assetUrl.startsWith('http://') ||
        assetUrl.startsWith('https://')
    ) {
        return assetUrl;
    }

    // blob/data URI도 그대로 허용
    if (
        assetUrl.startsWith('blob:') ||
        assetUrl.startsWith('data:')
    ) {
        return assetUrl;
    }

    // 상대경로 → 백엔드 서버 URL 결합
    return `${API_BASE_URL}${
        assetUrl.startsWith('/')
            ? assetUrl
            : `/${assetUrl}`
    }`;
};