/* ============================================================
   DEV WATERMARK - توقيع المطور العائم
   يُضاف تلقائياً لكل الصفحات
   ============================================================ */

(function () {
    'use strict';

    // لا تضفه في صفحة المطور نفسها
    if (window.location.pathname.includes('developer.html')) return;

    // CSS
    const style = document.createElement('style');
    style.textContent = `
        .dev-watermark {
            position: fixed;
            bottom: 20px;
            left: 20px;
            z-index: 9999;
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 10px 18px;
            background: rgba(10, 65, 121, 0.92);
            backdrop-filter: blur(15px);
            -webkit-backdrop-filter: blur(15px);
            border: 1px solid rgba(138, 196, 255, 0.3);
            border-radius: 50px;
            color: white;
            text-decoration: none;
            font-family: 'Tajawal', sans-serif;
            font-size: 13px;
            font-weight: 700;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
            transition: all 0.35s cubic-bezier(0.4, 0, 0.2, 1);
            opacity: 0.85;
            cursor: pointer;
            animation: wmSlideIn 0.6s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .dev-watermark:hover {
            opacity: 1;
            transform: translateY(-4px) scale(1.05);
            background: linear-gradient(135deg, #0a4179, #499bda);
            border-color: #8ac4ff;
            box-shadow: 0 15px 40px rgba(73, 155, 218, 0.5);
        }

        .dev-watermark .wm-icon {
            width: 32px;
            height: 32px;
            border-radius: 50%;
            background: linear-gradient(135deg, #499bda, #8ac4ff);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 15px;
            color: white;
            flex-shrink: 0;
            box-shadow: 0 4px 12px rgba(73, 155, 218, 0.5);
        }

        .dev-watermark .wm-text {
            display: flex;
            flex-direction: column;
            gap: 1px;
            line-height: 1.3;
        }

        .dev-watermark .wm-text .wm-small {
            font-size: 10px;
            font-weight: 500;
            opacity: 0.75;
            color: #b8d4ec;
            letter-spacing: 0.5px;
        }

        .dev-watermark .wm-text .wm-name {
            font-family: 'Great Vibes', 'Tajawal', cursive;
            font-size: 16px;
            font-weight: 400;
            color: #ffffff;
            letter-spacing: 0.5px;
        }

        @keyframes wmSlideIn {
            from {
                opacity: 0;
                transform: translateY(30px) scale(0.9);
            }
            to {
                opacity: 0.85;
                transform: translateY(0) scale(1);
            }
        }

        /* Hover indicator pulse */
        .dev-watermark::before {
            content: '';
            position: absolute;
            inset: -2px;
            border-radius: 50px;
            background: linear-gradient(135deg, #499bda, #8ac4ff);
            opacity: 0;
            z-index: -1;
            animation: wmPulse 3s ease-in-out infinite;
        }

        @keyframes wmPulse {
            0%, 100% { opacity: 0; transform: scale(1); }
            50% { opacity: 0.25; transform: scale(1.05); }
        }

        /* موبايل */
        @media (max-width: 600px) {
            .dev-watermark {
                bottom: 12px;
                left: 12px;
                padding: 8px 14px;
                font-size: 11px;
            }

            .dev-watermark .wm-icon {
                width: 26px;
                height: 26px;
                font-size: 12px;
            }

            .dev-watermark .wm-text .wm-name {
                font-size: 13px;
            }

            .dev-watermark .wm-text .wm-small {
                font-size: 9px;
            }
        }

        /* لو الصفحة فيها floating-home، نرفع التوقيع فوقه */
        body:has(.floating-home) .dev-watermark {
            bottom: 90px;
        }

        @media (max-width: 600px) {
            body:has(.floating-home) .dev-watermark {
                bottom: 75px;
            }
        }
    `;
    document.head.appendChild(style);

    // HTML
    const watermark = document.createElement('a');
    watermark.className = 'dev-watermark';
    watermark.href = 'developer.html';
    watermark.title = 'تطوير: أحمد حسين';
    watermark.innerHTML = `
        <div class="wm-icon">
            <i class="fas fa-code"></i>
        </div>
        <div class="wm-text">
            <span class="wm-small">تطوير</span>
            <span class="wm-name">Ahmed Hussein</span>
        </div>
    `;

    // إضافته بعد تحميل الصفحة
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => document.body.appendChild(watermark));
    } else {
        document.body.appendChild(watermark);
    }
})();