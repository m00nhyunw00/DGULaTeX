/**
 * =================================================================
 * [Entry] React Application Mount
 * 설명: React 애플리케이션을 DOM에 마운트하고 전역 스타일을 로드함
 * =================================================================
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

/* ---------------------------------------------------------
 * SECTION 1: Style Layering & Specificity
 * --------------------------------------------------------- */

// 1. 외부 프레임워크 스타일 (Bootstrap)을 가장 먼저 로드
import 'bootstrap/dist/css/bootstrap.min.css';

// 2. 어플리케이션 메인 컴포넌트 로드
// [시정] 현재 폴더 위치를 명확히 표시
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';

// 3. 커스텀 전역 스타일 (App.css)
// Bootstrap을 덮어쓰기 위해 하단에 배치
import './App.css';

/* ---------------------------------------------------------
 * SECTION 2: DOM Rendering
 * --------------------------------------------------------- */

const rootElement = document.getElementById('root');

if (!rootElement) {
    console.error("Critical Error: 'root' element not found in index.html");
} else {
    createRoot(rootElement).render(
        <StrictMode>
            <BrowserRouter>
                <App />
            </BrowserRouter>
        </StrictMode>
    );
}