/**
 * =================================================================
 * [Hook] Login State & Workflow
 * 설명: 화면 상태, 사용자 액션, 서비스 호출 흐름을 React 훅으로 관리함
 * =================================================================
 */
import { useState } from 'react';
import { AuthService } from '../services/AuthService';

/**
 * @param {Function} setIsLoggedIn - 전역 인증 상태 변경 세터
 * @param {Function} setUser - 전역 사용자 정보 세터
 */
export const useLogin = (setIsLoggedIn, setUser) => {

    /* ---------------------------------------------------------
     * SECTION 1: Login Input State
     * --------------------------------------------------------- */
    const [studentId, setStudentId] = useState('');
    const [password, setPassword] = useState('');

    /* ---------------------------------------------------------
     * SECTION 2: Register Input State
     * --------------------------------------------------------- */
    const [authMode, setAuthMode] = useState('login');
    const [registerStudentId, setRegisterStudentId] = useState('');
    const [registerPassword, setRegisterPassword] = useState('');
    const [registerPasswordConfirm, setRegisterPasswordConfirm] = useState('');
    const [registerUserName, setRegisterUserName] = useState('');

    /* ---------------------------------------------------------
     * SECTION 3: Change Password Input State
     * --------------------------------------------------------- */
    const [changePasswordStudentId, setChangePasswordStudentId] = useState('');
    const [oldPassword, setOldPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [newPasswordConfirm, setNewPasswordConfirm] = useState('');

    /* ---------------------------------------------------------
     * SECTION 4: Feedback State
     * --------------------------------------------------------- */
    const [error, setError] = useState('');
    const [successMessage, setSuccessMessage] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    /* ---------------------------------------------------------
     * SECTION 5: Mode Handlers
     * --------------------------------------------------------- */
    const switchAuthMode = (nextMode) => {
        setAuthMode(nextMode);
        setError('');
        setSuccessMessage('');
    };

    /* ---------------------------------------------------------
     * SECTION 6: Login Handler
     * --------------------------------------------------------- */
    const handleLogin = async (e) => {
        if (e && e.preventDefault) e.preventDefault();

        setError('');
        setSuccessMessage('');
        setIsSubmitting(true);

        try {
            const result = await AuthService.login(studentId, password);

            if (result.success) {
                setUser(result.user);
                setIsLoggedIn(true);
                setError('');
            } else {
                setError(result.message || '인증 정보가 올바르지 않습니다.');
            }
        } catch (err) {
            setIsLoggedIn(false);
            const finalErrorMessage = err.message || '인증 처리 중 알 수 없는 오류가 발생했습니다.';

            setError(finalErrorMessage);
        } finally {
            setIsSubmitting(false);
        }
    };

    /* ---------------------------------------------------------
     * SECTION 7: Register Handler
     * --------------------------------------------------------- */
    const handleRegister = async (e) => {
        if (e && e.preventDefault) e.preventDefault();

        const trimmedStudentId = registerStudentId.trim();
        const trimmedUserName = registerUserName.trim();

        setError('');
        setSuccessMessage('');

        if (!trimmedStudentId || !registerPassword || !trimmedUserName) {
            setError('학번, 이름, 비밀번호를 모두 입력해주세요.');
            return;
        }

        if (registerPassword !== registerPasswordConfirm) {
            setError('비밀번호 확인이 일치하지 않습니다.');
            return;
        }

        setIsSubmitting(true);

        try {
            const result = await AuthService.register({
                studentId: trimmedStudentId,
                password: registerPassword,
                userName: trimmedUserName
            });

            if (!result.success) {
                setError(result.message || '회원가입에 실패했습니다.');
                return;
            }

            setStudentId(trimmedStudentId);
            setPassword('');
            setRegisterPassword('');
            setRegisterPasswordConfirm('');
            setRegisterUserName('');
            setRegisterStudentId('');
            setAuthMode('login');
            setSuccessMessage(result.message || '회원가입이 완료되었습니다. 로그인해주세요.');
        } catch (err) {
            const finalErrorMessage = err.message || '회원가입 처리 중 알 수 없는 오류가 발생했습니다.';

            setError(finalErrorMessage);
        } finally {
            setIsSubmitting(false);
        }
    };

    /* ---------------------------------------------------------
     * SECTION 8: Change Password Handler
     * --------------------------------------------------------- */
    const handleChangePassword = async (e) => {
        if (e && e.preventDefault) e.preventDefault();

        const trimmedStudentId = changePasswordStudentId.trim();

        setError('');
        setSuccessMessage('');

        if (!trimmedStudentId || !oldPassword || !newPassword || !newPasswordConfirm) {
            setError('학번, 기존 비밀번호, 새 비밀번호를 모두 입력해주세요.');
            return;
        }

        if (newPassword !== newPasswordConfirm) {
            setError('새 비밀번호 확인이 일치하지 않습니다.');
            return;
        }

        if (oldPassword === newPassword) {
            setError('새 비밀번호는 기존 비밀번호와 달라야 합니다.');
            return;
        }

        setIsSubmitting(true);

        try {
            const result = await AuthService.changePassword({
                studentId: trimmedStudentId,
                oldPassword,
                newPassword,
                newPasswordConfirm
            });

            if (!result.success) {
                setError(result.message || '비밀번호 변경에 실패했습니다.');
                return;
            }

            setStudentId(trimmedStudentId);
            setPassword('');
            setChangePasswordStudentId('');
            setOldPassword('');
            setNewPassword('');
            setNewPasswordConfirm('');
            setAuthMode('login');
            setSuccessMessage(result.message || '비밀번호가 변경되었습니다. 새 비밀번호로 로그인해주세요.');
        } catch (err) {
            const finalErrorMessage = err.message || '비밀번호 변경 처리 중 알 수 없는 오류가 발생했습니다.';

            setError(finalErrorMessage);
        } finally {
            setIsSubmitting(false);
        }
    };

    /* ---------------------------------------------------------
     * SECTION 9: Public API
     * --------------------------------------------------------- */
    return {
        studentId,
        setStudentId,
        password,
        setPassword,
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
        handleLogin,
        handleRegister,
        handleChangePassword
    };
};
