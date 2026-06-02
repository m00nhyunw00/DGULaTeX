/**
 * =================================================================
 * [Logic] Authentication Core Logic
 * 설명: DB 및 LDAP 인증 모드 판단과 로그인 검증 유틸리티를 처리함
 * =================================================================
 */
const ldap = require('ldapjs');

const authLogic = {
    /** .env에서 현재 인증 모드 획득 */
    getAuthMode: () => process.env.AUTH_MODE,

    /** LDAP 서버 인증 (Promise 기반) */
    authenticateViaLdap: (studentId, password) => {
        return new Promise((resolve, reject) => {
            const host = process.env.LDAP_URL;
            const port = process.env.LDAP_PORT;
            const client = ldap.createClient({ url: `${host}:${port}`, connectTimeout: 5000 });

            client.bind(studentId, password, (err) => {
                const url = client.url.href;
                // 바인딩 시도 후 즉시 리소스 해제
                try { client.unbind(); client.destroy(); } catch (e) {}

                if (err) {
                    reject(authLogic.parseLdapError(err, url));
                } else {
                    resolve({ id: studentId, name: '동국인(LDAP)' });
                }
            });
        });
    },

    /** LDAP 에러 파싱 및 상태 코드 매핑 */
    parseLdapError: (err, url) => {
        if (err.code === 'ECONNREFUSED' || err.message?.includes('ECONNREFUSED')) {
            return { code: 503, message: `LDAP 서버 연결 불가 (${url})` };
        }
        if (err.name === 'InvalidCredentialsError') {
            return { code: 401, message: 'LDAP 인증 실패: 비밀번호를 확인하세요.' };
        }
        return { code: 500, message: `LDAP 서버 에러: ${err.name}` };
    }
};

module.exports = authLogic;