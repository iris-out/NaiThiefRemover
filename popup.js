document.addEventListener('DOMContentLoaded', () => {
    // UI 요소들
    const ui = {
        // 설정 탭 요소
        filename: document.getElementById('filename'),
        subDir: document.getElementById('subDir'),
        format: document.getElementById('format'),
        quality: document.getElementById('quality'),
        qualityVal: document.getElementById('qualityVal'),
        autoCount: document.getElementById('autoCount'), 
        showButtons: document.getElementById('showButtons'), 
        showProgress: document.getElementById('showProgress'),
        loadDelay: document.getElementById('loadDelay'),
        repeatDelay: document.getElementById('repeatDelay'),
        saveBtn: document.getElementById('saveBtn'),
        resetBtn: document.getElementById('resetBtn'),
        status: document.getElementById('status'),
        // 로그 탭 요소
        logDisplay: document.getElementById('log-display'),
        clearLogBtn: document.getElementById('clearLogBtn'),
        // 탭 요소
        tabButtons: document.querySelectorAll('.tab-button'),
        tabContents: document.querySelectorAll('.tab-content')
    };

    // 기본 설정 값
    const defaultSettings = {
        filename: '{timestamp}_{index}',
        subDir: '', 
        format: 'jpeg',
        quality: 1.0,
        autoCount: 0, 
        showButtons: true,
        showProgress: true,
        loadDelay: 500,     
        repeatDelay: 1000   
    };

    // 탭 전환 로직 
    ui.tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const targetTab = button.dataset.tab;

            // 탭 버튼 활성화 상태 업데이트
            ui.tabButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');

            // 탭 내용 표시
            ui.tabContents.forEach(content => {
                content.classList.remove('active');
                if (content.id === targetTab) {
                    content.classList.add('active');
                }
            });

            // 로그 탭으로 전환 시 로그 로드
            if (targetTab === 'log') {
                loadLogs();
            }
        });
    });


    // 설정을 UI에 적용하는 함수
    const applySettings = (settings) => {
        ui.filename.value = settings.filename;
        ui.subDir.value = settings.subDir;
        ui.format.value = settings.format;
        ui.quality.value = settings.quality;
        ui.autoCount.value = settings.autoCount; 
        ui.showButtons.checked = settings.showButtons; 
        
        // 새로운 설정 항목 적용
        if (ui.showProgress) ui.showProgress.checked = settings.showProgress;
        if (ui.loadDelay) ui.loadDelay.value = settings.loadDelay;
        if (ui.repeatDelay) ui.repeatDelay.value = settings.repeatDelay;
        
        updateQualityDisplay();
    };
    
    // UI에서 설정 값을 가져오는 함수
    const getSettingsFromUI = () => ({
        filename: ui.filename.value.trim(),
        subDir: ui.subDir.value.trim(),
        format: ui.format.value,
        quality: parseFloat(ui.quality.value),
        autoCount: parseInt(ui.autoCount.value, 10) || 0,
        showButtons: ui.showButtons.checked,
        
        // 새로운 설정 항목의 값 가져오기
        showProgress: ui.showProgress ? ui.showProgress.checked : true,
        loadDelay: ui.loadDelay ? parseInt(ui.loadDelay.value, 10) || 500 : 500,
        repeatDelay: ui.repeatDelay ? parseInt(ui.repeatDelay.value, 10) || 1000 : 1000
    });

    // 화질 슬라이더 값 표시 및 PNG 선택 시 비활성화 처리
    const updateQualityDisplay = () => {
        ui.qualityVal.textContent = parseFloat(ui.quality.value).toFixed(2);
        ui.quality.disabled = (ui.format.value === 'png');
    };

    // 설정 저장 함수
    const saveSettings = () => {
        const settings = getSettingsFromUI();
        // 저장 시, 이전에 저장된 설정을 덮어쓰고 content.js에 변경을 알립니다.
        chrome.storage.sync.set({ settings }, () => {
            ui.status.textContent = '설정이 저장되었습니다!';
            setTimeout(() => ui.status.textContent = '', 3000);
        });
    };
    
    // 설정 초기화 함수
    const resetSettings = () => {
        if (confirm('모든 설정을 기본값으로 되돌리시겠습니까?')) {
            applySettings(defaultSettings);
            // 저장된 설정 삭제 (초기화)
            chrome.storage.sync.remove('settings', () => {
                ui.status.textContent = '설정을 초기화했습니다.';
                // 재적용하여 content.js에 변경 사항 반영
                saveSettings(); 
            });
        }
    };

    // 로그 관련 로직
    // 로그 불러오기 함수
    const loadLogs = () => {
        chrome.storage.local.get('logs', (data) => {
            const logs = data.logs || [];
            ui.logDisplay.innerHTML = ''; 
            if (logs.length === 0) {
                ui.logDisplay.textContent = '기록된 로그가 없습니다.';
                return;
            }

            logs.slice().reverse().forEach(log => {
                const logEntry = document.createElement('div');
                logEntry.classList.add('log-entry', log.type); 
                
                const timeStr = new Date(log.timestamp).toLocaleTimeString();
                logEntry.textContent = `[${timeStr}] ${log.message}`;
                
                ui.logDisplay.appendChild(logEntry);
            });
            
            if (document.getElementById('log').classList.contains('active')) {
                ui.logDisplay.scrollTop = 0;
            }
        });
    };

    // 로그 삭제 함수
    if (ui.clearLogBtn) {
        ui.clearLogBtn.addEventListener('click', () => {
            if (confirm('모든 로그 기록을 삭제하시겠습니까?')) {
                chrome.storage.local.set({ logs: [] }, () => {
                    ui.logDisplay.textContent = '로그 기록이 삭제되었습니다.';
                });
            }
        });
    }

    // 이벤트 리스너 등록
    ui.quality.addEventListener('input', updateQualityDisplay);
    ui.format.addEventListener('change', updateQualityDisplay);
    ui.saveBtn.addEventListener('click', saveSettings);
    ui.resetBtn.addEventListener('click', resetSettings);

    // 팝업이 열릴 때 저장된 설정을 불러옴
    chrome.storage.sync.get('settings', (data) => {
        // 저장된 설정이 있다면 기본값 위에 덮어씌웁니다.
        const settings = { ...defaultSettings, ...data.settings };
        applySettings(settings);
    });
});