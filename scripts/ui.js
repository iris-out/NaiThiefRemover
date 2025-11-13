import { CONTAINER_ID, STYLE_ID, SVG_ICONS } from './constants.js';

let dynamicToast = null;
let hideTimeout = null;

// 필요한 스타일을 문서에 주입합니다.
function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
#ntr-dynamic-toast {
    position: fixed;
    top: 20px;
    right: 20px;
    z-index: 10000;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 16px;
    background: rgba(28, 36, 54, 0.92);
    color: #E5ECFF;
    font-family: sans-serif;
    border-radius: 24px;
    border: 1px solid rgba(108, 138, 210, 0.25);
    box-shadow: 0 12px 28px rgba(6, 10, 22, 0.4);
    backdrop-filter: blur(16px);
    transform: translateY(-20px) scale(0.95);
    opacity: 0;
    transition: transform 0.35s cubic-bezier(0.2, 1, 0.3, 1), opacity 0.35s ease;
    pointer-events: none;
    position: relative;
    overflow: hidden;
    max-width: 300px;
    word-break: break-word;
}
#ntr-dynamic-toast.is-visible {
    transform: translateY(0) scale(1);
    opacity: 1;
    pointer-events: auto;
}
.ntr-di-icon {
    width: 24px;
    height: 24px;
    fill: currentColor;
}
.ntr-di-message {
    font-size: 0.9rem;
    font-weight: 500;
}
.ntr-di-progress-bar {
    position: absolute;
    bottom: 0;
    left: 0;
    height: 3px;
    width: 0;
    background: linear-gradient(90deg, #6CA6FF, #347DFF);
    border-radius: 0 0 0 3px;
    transition: width 0.4s ease;
}
#${CONTAINER_ID}{position:fixed;z-index:9999;display:flex;flex-direction:column;align-items:center;gap:10px;min-width:65px;background:rgba(16,22,36,0.96);border:1px solid rgba(108,138,210,0.32);box-shadow:0 14px 32px rgba(6,10,22,0.45);border-radius:999px;padding:9px 11px;cursor:grab;touch-action:none;user-select:none;backdrop-filter:blur(16px);transition:box-shadow .25s ease,transform .25s ease}
#${CONTAINER_ID}[data-dragging="true"]{box-shadow:0 18px 40px rgba(6,10,22,0.55);transform:scale(1.01);cursor:grabbing}
#${CONTAINER_ID}.is-collapsed .ntr-button-list,#${CONTAINER_ID}.is-collapsed .ntr-progress{display:none}
.ntr-button-list{display:flex;flex-direction:column;align-items:center;gap:10px;width:100%}
.ntr-btn{flex-shrink:0;width:49px;height:49px;padding:0;border:none;border-radius:50%;color:#E5ECFF;display:flex;align-items:center;justify-content:center;background:rgba(70,92,140,0.88);cursor:pointer;transition:transform .18s ease,filter .18s ease,background .18s ease;backdrop-filter:blur(6px);font-size:0.92rem;font-weight:600;letter-spacing:0}
.ntr-btn svg{width:20px;height:20px;display:block;pointer-events:none;fill:currentColor}
.ntr-btn:hover{transform:translateY(-1px);filter:brightness(1.08)}
.ntr-btn:focus-visible{outline:2px solid rgba(120,160,255,0.7);outline-offset:3px}
.ntr-btn--manual{background:linear-gradient(135deg,rgba(108,166,255,0.96),rgba(74,128,230,0.95))}
.ntr-btn--manual:hover{filter:brightness(1.07)}
.ntr-btn--auto{background:linear-gradient(135deg,rgba(118,204,255,0.95),rgba(90,162,235,0.95))}
.ntr-btn--auto.is-running{background:linear-gradient(135deg,rgba(255,130,149,0.92),rgba(255,96,122,0.92))}
.ntr-btn--toggle{align-self:center;width:40px;height:40px;min-width:40px;min-height:40px;background:rgba(52,70,112,0.92);border-radius:50%;padding:0;color:#E5ECFF}
.ntr-btn--toggle svg{width:16px;height:16px;fill:currentColor}
.ntr-progress{display:none;color:rgba(200,214,255,0.85);font-size:11px;padding:4px 10px;border-radius:999px;background:rgba(29,38,58,0.88);border:1px solid rgba(112,142,210,0.4);align-self:center}
#${CONTAINER_ID}:not(.is-collapsed) .ntr-progress.is-visible{display:inline-flex}
@media (max-width: 768px){
    #${CONTAINER_ID}{min-width:58px;padding:7px 9px}
    .ntr-button-list{gap:9px}
    .ntr-btn{width:44px;height:44px;font-size:0.84rem}
    .ntr-btn svg{width:18px;height:18px}
    .ntr-btn--toggle{width:34px;height:34px;min-width:34px;min-height:34px}
}
    `;
    (document.head || document.documentElement).appendChild(style);
} // AI가 디자인 훨씬 잘 함. 

function createDynamicToast() { 
    ensureStyles();
    if (document.getElementById('ntr-dynamic-toast')) {
        return document.getElementById('ntr-dynamic-toast');
    }
    const toast = document.createElement('div');
    toast.id = 'ntr-dynamic-toast';
    toast.innerHTML = `
        <div class="ntr-di-icon">${SVG_ICONS.INFO}</div>
        <div class="ntr-di-message"></div>
        <div class="ntr-di-progress-bar"></div>
    `;
    document.body.appendChild(toast);
    return toast;
}

function updateDynamicToast({ icon, message, progress }) {
    if (!dynamicToast) {
        dynamicToast = createDynamicToast();
    }

    const iconEl = dynamicToast.querySelector('.ntr-di-icon');
    const messageEl = dynamicToast.querySelector('.ntr-di-message');
    const progressEl = dynamicToast.querySelector('.ntr-di-progress-bar');

    if (icon) iconEl.innerHTML = icon;
    if (message) messageEl.textContent = message;
    
    if (progress !== undefined && progress !== null) {
        progressEl.style.width = `${progress}%`;
    } else {
        progressEl.style.width = '0%';
    }
}

function showDynamicToast(options) {
    updateDynamicToast(options);
    requestAnimationFrame(() => {
        dynamicToast.classList.add('is-visible');
    });
}

function hideDynamicToast(delay = 0) {
    if (hideTimeout) clearTimeout(hideTimeout);
    hideTimeout = setTimeout(() => {
        if (dynamicToast) {
            dynamicToast.classList.remove('is-visible');
        }
    }, delay);
}

// 로그 항목을 스토리지에 추가합니다.
function appendLogEntry(entry) {
    try {
        if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) return;
        chrome.storage.local.get('logs', (data = {}) => {
            const logs = Array.isArray(data.logs) ? data.logs : [];
            logs.push(entry);
            const trimmed = logs.slice(-200);
            chrome.storage.local.set({ logs: trimmed });
        });
    } catch (error) {
        console.warn('NTR 로그 저장 실패:', error);
    }
}

export function showToast({ message, type = 'info', duration = 4000, progress }) {
    const iconMap = {
        success: SVG_ICONS.SUCCESS,
        error: SVG_ICONS.ERROR,
        warn: SVG_ICONS.WARN,
        info: SVG_ICONS.INFO,
        download: SVG_ICONS.DOWNLOAD,
    };

    if (hideTimeout) clearTimeout(hideTimeout);

    showDynamicToast({
        icon: iconMap[type] || SVG_ICONS.INFO,
        message,
        progress
    });

    appendLogEntry({
        type,
        message,
        timestamp: Date.now()
    });

    if (duration > 0) {
        hideDynamicToast(duration);
    }
}

// 컨트롤 패널의 드래그 이동 로직을 설정합니다.
function setupDragging(container, onPositionChange) {
    let pointerId = null;
    let startX = 0;
    let startY = 0;
    let originLeft = 0;
    let originTop = 0;
    let moved = false;
    const DRAG_THRESHOLD = 5;

    const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

    const handleMove = (event) => {
        if (pointerId === null || event.pointerId !== pointerId) return;
        const dx = event.clientX - startX;
        const dy = event.clientY - startY;
        if (!moved && Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return;
        moved = true;
        const maxLeft = Math.max(10, window.innerWidth - container.offsetWidth - 10);
        const maxTop = Math.max(10, window.innerHeight - container.offsetHeight - 10);
        const newLeft = clamp(originLeft + dx, 10, maxLeft);
        const newTop = clamp(originTop + dy, 10, maxTop);
        container.style.left = `${newLeft}px`;
        container.style.top = `${newTop}px`;
    };

    const finish = (event, cancelled = false) => {
        if (pointerId === null || (event && event.pointerId !== pointerId)) return;
        container.releasePointerCapture?.(pointerId);
        container.dataset.dragging = 'false';
        window.removeEventListener('pointermove', handleMove);
        window.removeEventListener('pointerup', finish);
        window.removeEventListener('pointercancel', cancel);
        if (!cancelled && moved) {
            onPositionChange?.({
                left: container.offsetLeft,
                top: container.offsetTop
            });
        }
        pointerId = null;
        moved = false;
    };

    const cancel = (event) => finish(event, true);

    const shouldDrag = (event) => !event.target.closest('.ntr-btn');

    container.addEventListener('pointerdown', (event) => {
        if (!shouldDrag(event)) return;
        pointerId = event.pointerId;
        moved = false;
        startX = event.clientX;
        startY = event.clientY;
        originLeft = container.offsetLeft;
        originTop = container.offsetTop;
        container.dataset.dragging = 'true';
        container.setPointerCapture?.(pointerId);
        window.addEventListener('pointermove', handleMove);
        window.addEventListener('pointerup', finish);
        window.addEventListener('pointercancel', cancel);
        event.preventDefault();
    });
}

// 컨트롤 패널 UI를 생성하고 페이지에 추가합니다.
export function createControlPanel({
    settings,
    containerPosition,
    onManualDownload,
    onAutoToggle,
    onPositionChange,
    onExpandChange
}) {
    document.getElementById(CONTAINER_ID)?.remove();
    ensureStyles();

    const container = document.createElement('div');
    container.id = CONTAINER_ID;
    container.dataset.dragging = 'false';
    container.style.top = `${containerPosition.top}px`;
    container.style.left = `${containerPosition.left}px`;
    container.classList.toggle('is-collapsed', !containerPosition.isExpanded);

    const buttonList = document.createElement('div');
    buttonList.className = 'ntr-button-list';

    const manualBtn = document.createElement('button');
    manualBtn.type = 'button';
    manualBtn.id = 'manual-download-btn';
    manualBtn.className = 'ntr-btn ntr-btn--manual';
    manualBtn.innerHTML = SVG_ICONS.DOWNLOAD;
    manualBtn.addEventListener('click', () => onManualDownload?.());
    buttonList.appendChild(manualBtn);

    const autoBtn = document.createElement('button');
    autoBtn.type = 'button';
    autoBtn.id = 'auto-download-btn';
    autoBtn.className = 'ntr-btn ntr-btn--auto';
    autoBtn.addEventListener('click', () => onAutoToggle?.());
    buttonList.appendChild(autoBtn);

    container.appendChild(buttonList);

    const progress = document.createElement('div');
    progress.id = 'auto-progress-display';
    progress.className = 'ntr-progress';
    container.appendChild(progress);

    const toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.id = 'toggle-expand-btn';
    toggleBtn.className = 'ntr-btn ntr-btn--toggle';
    toggleBtn.innerHTML = containerPosition.isExpanded ? SVG_ICONS.TOGGLE_CLOSE : SVG_ICONS.TOGGLE_OPEN;
    toggleBtn.addEventListener('click', () => {
        container.classList.toggle('is-collapsed');
        const isExpanded = !container.classList.contains('is-collapsed');
        toggleBtn.innerHTML = isExpanded ? SVG_ICONS.TOGGLE_CLOSE : SVG_ICONS.TOGGLE_OPEN;
        onExpandChange?.(isExpanded);
    });
    container.appendChild(toggleBtn);

    document.body.appendChild(container);

    setupDragging(container, onPositionChange);

    return {
        container,
        manualBtn,
        autoBtn,
        progressEl: progress,
        toggleBtn
    };
}

