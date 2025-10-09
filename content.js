(() => {
    // 전역 변수 및 상수 정의
    const GRID_SELECTOR = '.display-grid-images'; // 이미지 그리드 컨테이너
    const IMAGE_SELECTOR = '.image-grid-image'; // 개별 이미지 요소 (<img>)
    const GENERATE_BUTTON_SELECTOR = '.sc-883533e0-3.dISzhx'; // 이미지 생성 버튼
    const CONTAINER_ID = 'downloader-container'; // 버튼 컨테이너의 고유 ID

    // 확장 프로그램 설정값 (초기값)
    let settings = { 
        filename: '{timestamp}_{index}', // 파일명 패턴
        subDir: '', // 하위 폴더 이름
        format: 'jpeg',
        quality: 1.0, 
        autoCount: 0, 
        showButtons: true, 
        showProgress: true, 
        loadDelay: 500, // 이미지 로딩/완료 확인 대기 시간 (ms)
        repeatDelay: 1000 // 반복 생성 사이 대기 시간 (ms)
    };
    
    // UI 위치 및 상태 저장 변수 (isExpanded 상태 추가)
    let containerPosition = { top: 20, left: 20, isExpanded: true }; 

    // 자동 다운로드 관리 객체
    let autoDownloader = null; 
    let lastDownloadImageSrc = null; 
    
    // 아이콘 SVG (내장)
    const SVG_ICONS = {
        DOWNLOAD: '&#x21E9;', 
        PLAY: '<svg viewBox="0 0 24 24" fill="currentColor" width="1em" height="1em"><path d="M6 3l12 9-12 9V3z"/></svg>', 
        PAUSE: '<svg viewBox="0 0 24 24" fill="currentColor" width="1em" height="1em"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>',
        TOGGLE_IN: '&#x25C0;', // < (접기 아이콘)
        TOGGLE_OUT: '&#x25B6;' // > (펴기 아이콘)
    };

    function logMessage(message, type = "info") { // 로그 메시지 저장 및 콘솔 출력
        const logEntry = {
            message: message,
            type: type,
            timestamp: Date.now()
        };

        chrome.storage.local.get('logs', (data) => {
            const logs = data.logs || [];
            logs.push(logEntry);
            if (logs.length > 200) {
                logs.shift(); 
            }
            chrome.storage.local.set({ logs: logs });
        });
        
        console.log(`[LOG - ${type.toUpperCase()}] ${message}`);
    }

    // 사용자에게 알림 메시지를 표시하는 함수
    function showMsg(message, type = "info") {
        logMessage(message, type); 

        let msgContainer = document.getElementById('downloader-msg-container');
        if (!msgContainer) {
            msgContainer = document.createElement('div');
            msgContainer.id = 'downloader-msg-container';
            Object.assign(msgContainer.style, { 
                position: 'fixed', top: '20px', right: '20px', zIndex: '10000', 
                display: 'flex', flexDirection: 'column', gap: '10px', maxWidth: '300px' 
            });
            document.body.appendChild(msgContainer);
        }
        
        const pill = document.createElement('div');
        pill.textContent = message;
        const colors = { success: '#A3BE8C', error: '#BF616A', info: '#81A1C1', warn: '#EBCB8B' };
        Object.assign(pill.style, { 
            padding: '10px 20px', borderRadius: '20px', color: 'white', fontFamily: 'sans-serif', 
            boxShadow: '0 2px 5px rgba(0,0,0,0.2)', transition: 'all 0.3s ease-out', opacity: '0', 
            transform: 'translateY(-20px)', backgroundColor: colors[type] || colors.info 
        });
        
        msgContainer.prepend(pill); 
        setTimeout(() => { pill.style.opacity = '1'; pill.style.transform = 'translateY(0)'; }, 10);
        setTimeout(() => { 
            pill.style.opacity = '0'; 
            pill.style.transform = 'translateY(-20px)'; 
            pill.addEventListener('transitionend', () => pill.remove()); 
        }, 4000);
    }
    
    // 파일명 생성 함수
    function generateFilename(pattern, index) {
        const now = new Date();
        
        // 플레이스홀더와 그에 대응하는 실제 값
        const replacements = { 
            index: String(index).padStart(2, '0'), 
            timestamp: now.getTime(), 
            date: now.toISOString().split('T')[0], 
            time: now.toTimeString().split(' ')[0].replace(/:/g, '') 
        };
        
        const patternToUse = pattern || '{timestamp}_{index}';
        
        // 플레이스홀더를 실제 값으로 대체
        let filename = patternToUse.replace(/{(\w+)}/g, (match, key) => {
            if (replacements[key]) {
                return replacements[key];
            } else {
                logMessage(`알 수 없는 플레이스홀더 발견: ${match}. 'unknown'으로 대체됩니다.`, "warn");
                return 'unknown'; 
            }
        });
        
        // 파일명에 포함될 수 없는 모든 경로 및 특수 문자를 제거합니다.
        filename = filename.replace(/[\/\\]/g, '-').replace(/[\\:*?"<>|]/g, '_');
        
        return filename;
    }

    // 다운로드 처리 함수
    async function downloadItem(img, index) {
    if (!img.src) return;
    
    try {
        const baseFilename = generateFilename(settings.filename, index);
        
        let folderPath = '';
        if (settings.subDir) {
            folderPath = settings.subDir.replace(/\\/g, '/').trim();
            folderPath = folderPath.replace(/^\/+|\/+$/g, '');
            if (folderPath) {
                folderPath = folderPath + '/';
            }
        }
        
        // 모든 이미지를 최고 품질 JPEG로 변환하여 메타데이터를 제거합니다.
        const originalImage = new Image();
        originalImage.crossOrigin = 'anonymous';
        
        const jpegDataUrl = await new Promise((resolve, reject) => {
            originalImage.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                canvas.width = originalImage.naturalWidth;
                canvas.height = originalImage.naturalHeight;
                ctx.drawImage(originalImage, 0, 0);

                try {
                    // 1차 변환: 메타데이터 제거를 위해 최고 품질 JPEG로 강제 변환
                    const tempJpegUrl = canvas.toDataURL('image/jpeg', 1.0); 
                    resolve(tempJpegUrl);
                } catch (e) {
                    logMessage(`1차 JPEG 변환 실패. 원본 URL 다운로드 시도: ${e.message}`, "error");
                    resolve(img.src);
                }
            };
            
            originalImage.onerror = (e) => {
                logMessage(`원본 이미지 로드 실패. 원본 URL 다운로드 시도.`, "error");
                resolve(img.src);
            };
            
            originalImage.src = img.src;
        });

        if (!jpegDataUrl.startsWith('data:image/jpeg')) {
             // 1차 변환이 실패했으면 원본 URL로 다운로드 요청을 보냅니다.
             showMsg("메타데이터 제거 실패. 원본 URL로 다운로드합니다.", "warn");
             
             chrome.runtime.sendMessage({
                action: "download",
                url: img.src,
                filename: `${folderPath}${baseFilename}.${img.src.split('.').pop().split('?')[0]}` 
             });
             return;
        }


        const finalFormat = settings.format.toLowerCase();
        let finalMimeType;
        let finalQuality = settings.quality;

        switch(finalFormat) {
            case 'jpeg':
                finalMimeType = 'image/jpeg'; 
                break;
            case 'webp':
                finalMimeType = 'image/webp';
                break;
            case 'png':
                finalMimeType = 'image/png'; // PNG는 품질 설정 무시됨
                finalQuality = 1.0; 
                break;
            default:
                finalMimeType = 'image/jpeg';
                finalQuality = 1.0;
        }

        const finalDataUrl = await new Promise((resolve, reject) => {
            // 1차 변환된 JPEG Data URL을 다시 Image 객체로 로드합니다.
            const tempImage = new Image();
            tempImage.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                canvas.width = tempImage.naturalWidth;
                canvas.height = tempImage.naturalHeight;
                ctx.drawImage(tempImage, 0, 0);
                
                try {
                    // 2차 변환: 최종 포맷으로 변환
                    const resultDataUrl = canvas.toDataURL(finalMimeType, finalQuality);
                    resolve(resultDataUrl);
                } catch (e) {
                    logMessage(`2차 변환 실패. 1차 JPEG URL로 다운로드 시도: ${e.message}`, "error");
                    resolve(jpegDataUrl); // 2차 실패 시, 1차 JPEG라도 저장
                }
            };
            tempImage.onerror = () => {
                logMessage('1차 변환된 JPEG 로드 실패. 1차 JPEG URL로 다운로드 시도.', "error");
                resolve(jpegDataUrl);
            };
            tempImage.src = jpegDataUrl; // 1차 변환된 JPEG Data URL을 로드
        });

        // 최종 다운로드 요청 전송
        const finalPath = `${folderPath}${baseFilename}.${finalFormat}`;
        
        chrome.runtime.sendMessage({
            action: "download",
            url: finalDataUrl, 
            filename: finalPath 
        });

        logMessage(`다운로드 요청 전송 완료: ${finalPath} (2단계 변환 완료)`, "success");
        
    } catch (e) {
        showMsg('다운로드 요청 전송 중 심각한 오류 발생.', 'error');
        console.error('Download Request Error:', e);
    }
}

    // 생성된 이미지 다운로드 함수
    function downloadVisible() {
        try {
            const grid = document.querySelector(GRID_SELECTOR);
            if (!grid) {
                showMsg("생성된 이미지가 없거나, 찾을 수 없습니다.", "error");
                return false; 
            }
            
            const images = Array.from(grid.querySelectorAll('img' + IMAGE_SELECTOR))
                .filter(img => img.src); 
                
            if (images.length > 0) {
                lastDownloadImageSrc = images[0].src; 
                showMsg(`${images.length}개의 이미지를 다운로드합니다.`, "success");
                images.forEach((img, index) => downloadItem(img, index + 1));
                return true;
            } else {
                showMsg("다운로드할 이미지를 찾지 못했습니다.", "info");
                return false;
            }
        } catch (error) {
            showMsg("다운로드 처리 중 문제 발생.", "error");
            return false;
        }
    }

    // 자동 다운로드 관리 객체
    function AutoDownloaderLogic() {
        this.maxCount = settings.autoCount; 
        this.count = 0; 
        this.isRunning = false; 
        this.checkInterval = null; 

        const self = this; 

        // 자동 다운로드를 시작합니다.
        this.start = function() {
            if (self.isRunning) return;
            self.maxCount = settings.autoCount;

            if (self.maxCount <= 0) {
                 showMsg("자동 반복 횟수가 0입니다. 설정을 확인해 주세요.", "warn");
                 return;
            }

            self.isRunning = true;
            self.count = 0;
            showMsg(`자동 다운로드 시작: 총 ${self.maxCount}회 반복합니다.`, "info");
            
            self.pressGenButton(); 
        };

        /** 자동 다운로드를 중지합니다. */
        this.stop = function() {
            if (!self.isRunning) return;
            self.isRunning = false;
            self.clearInterval(); 
            showMsg(`자동 다운로드 중지: ${self.count}회 실행됨.`, "warn");

            const autoBtn = document.getElementById('auto-download-btn');
            if(autoBtn) {
                 autoBtn.innerHTML = SVG_ICONS.PLAY;
                 autoBtn.style.backgroundColor = '#A3BE8C';
            }
            self.updateProgressDisplay(false);
        };
        
        // 버튼 상태 감시 타이머를 해제합니다.
        this.clearInterval = function() {
            if (self.checkInterval) {
                clearInterval(self.checkInterval);
                self.checkInterval = null;
                logMessage("버튼 상태 감시 타이머 해제.");
            }
        }

        // 생성 버튼을 클릭하여 이미지를 생성 요청합니다.
        this.pressGenButton = function() {
            if (!self.isRunning) return;

            if (self.count >= self.maxCount) {
                self.stop(); 
                return;
            }
            
            self.updateProgressDisplay(true);

            const generateBtn = document.querySelector(GENERATE_BUTTON_SELECTOR);
            if (generateBtn) {
                generateBtn.click();
                self.count++;
                showMsg(`[${self.count}/${self.maxCount}] 이미지 생성 요청...`, "info");
                
                self.startCheckLoop(); 
            } else {
                showMsg("생성 버튼을 찾을 수 없습니다. 자동 다운로드 중지.", "error");
                self.stop();
            }
        };
        
        // 생성 버튼 클릭 후 이미지 생성 완료를 감시하는 타이머를 시작합니다. -> 이미지 생성이 완료되면, 버튼이 다시 활성화 되는 것을 이용함.
        this.startCheckLoop = function() {
            self.clearInterval(); 

            const checkButtonStateAndProceed = function() {
                const generateBtn = document.querySelector(GENERATE_BUTTON_SELECTOR);
                
                // 버튼이 활성화 되었다면 생성이 완료된 것입니다.
                if (generateBtn && !generateBtn.disabled) {
                    self.clearInterval(); 
                    self.imageGenCompleted(); // 다운로드 및 다음 단계로 이동
                } else if (!self.isRunning) {
                    self.clearInterval();
                }
            };
            
            // 설정된 로딩 대기 시간 간격으로 버튼 상태를 확인합니다.
            self.checkInterval = setInterval(checkButtonStateAndProceed, settings.loadDelay);
            logMessage(`버튼 상태 감시 타이머 시작. (간격: ${settings.loadDelay}ms)`);
        };

        // 이미지 생성이 완료되었을 때 호출되는 함수
        this.imageGenCompleted = function() {
            // 다운로드 시도
            const downloaded = downloadVisible();
            
            if(downloaded) {
                showMsg(`[${self.count}/${self.maxCount}] 다운로드 완료. 다음 생성까지 ${settings.repeatDelay}ms 대기.`, "success");
                setTimeout(() => {
                    self.pressGenButton(); 
                }, settings.repeatDelay); 
            } else {
                 showMsg("다운로드 실패. 자동 다운로드 중지.", "error");
                 self.stop();
            }
        };
        
        /// 진행 상황 표시 업데이트
        this.updateProgressDisplay = function(show) {
            let container = document.getElementById(CONTAINER_ID);
            if (!container) return;

            let progressDiv = document.getElementById('auto-progress-display');
            if (!progressDiv) {
                progressDiv = document.createElement('div');
                progressDiv.id = 'auto-progress-display';
                Object.assign(progressDiv.style, {
                    color: '#D8DEE9', fontSize: '10px', textAlign: 'center', marginTop: '5px',
                    padding: '3px', borderRadius: '5px', backgroundColor: '#4C566A'
                });
                container.appendChild(progressDiv);
            }

            if (settings.showProgress && show) {
                progressDiv.style.display = 'block';
                progressDiv.textContent = `진행: ${self.count} / ${self.maxCount}`;
            } else {
                progressDiv.style.display = 'none';
            }
        };
    }

    // 다운로드 버튼 UI 생성 함수
    async function createButton() {
        let container = document.getElementById(CONTAINER_ID);
        if (container) {
            container.remove();
        }
        
        // 1. 저장된 위치 및 상태 불러오기
        const data = await new Promise(resolve => {
            chrome.storage.sync.get('containerPosition', resolve);
        });
        if (data.containerPosition) {
            // 기존 값 (top, left)은 유지하고 isExpanded만 업데이트되도록 병합
            containerPosition = { ...containerPosition, ...data.containerPosition }; 
        }

        if (!settings.showButtons) {
            logMessage("설정에 따라 다운로드 버튼을 표시하지 않습니다.");
            return;
        }

        container = document.createElement('div');
        container.id = CONTAINER_ID;
        const btnSize = '39.6px'; // 일반 버튼의 크기
        const toggleBtnHeight = `${parseFloat(btnSize) * 0.6}px`; // 💡 토글 버튼 높이: 39.6px * 0.6 = 23.76px
        const fontSize = '20px'; 
        
        Object.assign(container.style, {
            position: 'fixed', 
            top: `${containerPosition.top}px`, // 저장된 위치 적용
            left: `${containerPosition.left}px`, // 저장된 위치 적용
            zIndex: '9999', 
            display: 'flex', flexDirection: 'column', gap: '5px', 
            backgroundColor: '#3B4252', 
            padding: '10px', // 높이 증가를 위해 10px로 변경
            borderRadius: '15px', boxShadow: '0 2px 5px rgba(0,0,0,0.3)',
            cursor: 'grab' // 드래그 가능 표시
        });

        // 버튼들을 담을 내부 컨테이너 (토글 시 숨겨질 부분)
        const innerButtonContainer = document.createElement('div');
        Object.assign(innerButtonContainer.style, {
            display: containerPosition.isExpanded ? 'flex' : 'none', // 초기 상태 적용
            flexDirection: 'column', 
            gap: '5px'
        });
        
        // =========================================================================
        // 2. 토글 버튼 로직 및 UI 추가
        // =========================================================================
        
        // 버튼 생성 헬퍼 함수
        function createStyledButton(html, bgColor, clickHandler, id = '', isToggle = false) {
            const btn = document.createElement('button');
            if (id) btn.id = id;
            btn.innerHTML = html; 
            Object.assign(btn.style, { 
                width: btnSize, 
                height: isToggle ? toggleBtnHeight : btnSize, // 💡 토글 버튼의 높이 적용
                borderRadius: '8px', 
                backgroundColor: bgColor, 
                color: 'white', border: 'none', 
                cursor: 'pointer', fontSize: fontSize, 
                display: 'flex', alignItems: 'center', justifyContent: 'center', 
                transition: 'background-color 0.2s', flexShrink: 0
            });
            btn.onclick = clickHandler;
            return btn;
        }

        // 토글 기능 함수 정의
        const toggleUI = () => {
            containerPosition.isExpanded = !containerPosition.isExpanded;
            
            // UI 상태 반영: innerButtonContainer 표시/숨김
            innerButtonContainer.style.display = containerPosition.isExpanded ? 'flex' : 'none';
            
            // 토글 버튼 아이콘 변경
            toggleBtn.innerHTML = containerPosition.isExpanded ? SVG_ICONS.TOGGLE_IN : SVG_ICONS.TOGGLE_OUT;

            // 상태 저장
            chrome.storage.sync.set({ containerPosition }, () => {
                logMessage(`UI 토글 상태 저장 완료: ${containerPosition.isExpanded ? '펼침' : '접힘'}`, "info");
            });
        };

        // 토글 버튼 (가장 위에 배치될 버튼)
        const toggleBtn = createStyledButton(
            containerPosition.isExpanded ? SVG_ICONS.TOGGLE_IN : SVG_ICONS.TOGGLE_OUT, 
            '#4C566A', 
            toggleUI, // 토글 기능 연결
            'toggle-expand-btn',
            true // 💡 isToggle 플래그
        );
        container.appendChild(toggleBtn); // 가장 먼저 추가
        
        // 수동 다운로드 버튼
        const manualBtn = createStyledButton(
            SVG_ICONS.DOWNLOAD, 
            '#5E81AC', 
            downloadVisible
        );
        manualBtn.onmouseover = () => manualBtn.style.backgroundColor = '#81A1C1';
        manualBtn.onmouseout = () => manualBtn.style.backgroundColor = '#5E81AC';
        innerButtonContainer.appendChild(manualBtn); 
        
        // 자동 다운로드 토글 버튼
        const autoBtn = createStyledButton(
            SVG_ICONS.PLAY, 
            '#A3BE8C', 
            function() {
                if (!autoDownloader) {
                    autoDownloader = new AutoDownloaderLogic();
                }
                if (autoDownloader.isRunning) {
                    autoDownloader.stop();
                } else {
                    autoDownloader.start();
                    if (autoDownloader.isRunning) {
                        this.innerHTML = SVG_ICONS.PAUSE;
                        this.style.backgroundColor = '#BF616A';
                    }
                }
            },
            'auto-download-btn'
        );
        innerButtonContainer.appendChild(autoBtn); 
        
        // innerButtonContainer를 주 컨테이너에 추가
        container.appendChild(innerButtonContainer);


        // =========================================================================
        // 3. 드래그 로직 (마우스 드래그 활성화, 조건부 허용)
        // =========================================================================
        
        let isDragging = false;
        let startX, startY, initialX, initialY;

        // 드래그 시작 함수 (마우스/터치 공통)
        const dragStart = (e) => {
            // 💡 마우스 이벤트의 경우, 이 함수를 호출하기 전에 이미 예외 처리를 합니다.
            
            isDragging = true;
            container.style.cursor = 'grabbing';
            container.style.transition = 'none'; // 드래그 중에는 transition 비활성화

            // 이벤트에 따라 시작 위치와 초기 컨테이너 위치 설정
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;
            
            startX = clientX;
            startY = clientY;
            initialX = container.offsetLeft;
            initialY = container.offsetTop;
            
            e.preventDefault(); // 기본 드래그 방지
        };

        // 드래그 이동 함수 (마우스/터치 공통)
        const dragMove = (e) => {
            if (!isDragging) return;
            
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;

            const dx = clientX - startX;
            const dy = clientY - startY;

            let newLeft = initialX + dx;
            let newTop = initialY + dy;
            
            // 화면 밖으로 나가지 않도록 경계 설정 
            const maxLeft = window.innerWidth - container.offsetWidth - 10;
            const maxTop = window.innerHeight - container.offsetHeight - 10;
            
            newLeft = Math.max(10, Math.min(newLeft, maxLeft));
            newTop = Math.max(10, Math.min(newTop, maxTop));


            container.style.left = `${newLeft}px`;
            container.style.top = `${newTop}px`;
            
            e.preventDefault(); 
        };

        // 드래그 종료 함수 (마우스/터치 공통)
        const dragEnd = () => {
            if (!isDragging) return;
            
            isDragging = false;
            container.style.cursor = 'grab';
            container.style.transition = ''; // transition 다시 활성화

            // 최종 위치 저장 (토글 상태도 함께 저장됨)
            containerPosition.left = container.offsetLeft;
            containerPosition.top = container.offsetTop;
            
            chrome.storage.sync.set({ containerPosition }, () => {
                logMessage(`UI 위치 저장 완료: (T: ${containerPosition.top}, L: ${containerPosition.left}, E: ${containerPosition.isExpanded})`, "info");
            });

            // 마우스 이벤트 리스너 제거
            document.removeEventListener('mousemove', dragMove);
            document.removeEventListener('mouseup', dragEnd);
        };
        
        // 💡 마우스 이벤트 리스너: 드래그 조건을 만족할 때만 dragStart 실행
        container.addEventListener('mousedown', (e) => {
             const targetId = e.target.id;

             // 1. UI가 접혀있고, 클릭 대상이 펼치기 버튼일 때만 드래그 허용 (토글 기능 오버라이드)
             if (targetId === 'toggle-expand-btn' && !containerPosition.isExpanded) {
                dragStart(e);
                document.addEventListener('mousemove', dragMove);
                document.addEventListener('mouseup', dragEnd);
             }
             // 2. 토글 버튼 외의 영역(다른 버튼이나 패딩 영역)을 클릭했을 때 드래그 시작
             else if (targetId !== 'toggle-expand-btn' && targetId !== 'auto-download-btn') {
                // 'auto-download-btn'도 눌렀을 때 드래그되지 않도록 추가 예외 처리
                dragStart(e);
                document.addEventListener('mousemove', dragMove);
                document.addEventListener('mouseup', dragEnd);
             }
             
             // 3. 토글 버튼 외의 기능성 버튼 (manualBtn)의 경우, dragStart를 호출하지 않아야
             //    클릭 이벤트가 정상 실행되고 드래그가 발생하지 않습니다.
        });
        
        // 터치 이벤트 리스너 (스마트폰/태블릿 고려)
        container.addEventListener('touchstart', (e) => {
             // 💡 터치 드래그는 토글 버튼을 누르는 경우에도 드래그로 해석되는 경우가 많아, 
             // 현재는 항상 드래그 가능하도록 이전 로직을 유지합니다.
             dragStart(e);
        });
        // document에서 터치 이벤트 리스너를 한 번만 추가
        document.removeEventListener('touchmove', dragMove); // 중복 방지
        document.removeEventListener('touchend', dragEnd); // 중복 방지
        document.addEventListener('touchmove', dragMove, { passive: false }); 
        document.addEventListener('touchend', dragEnd);


        document.body.appendChild(container);
        logMessage("다운로드 버튼 UI 생성 완료.", "success");
        
        if (settings.showProgress && autoDownloader) {
            autoDownloader.updateProgressDisplay(false);
        }
    }

    // 초기화 함수
    async function init() {
        logMessage("NaiThiefRemover 확장 프로그램 초기화 시작.");
        
        // 1. 저장된 설정 불러오기
        const loadedSettings = await new Promise(resolve => {
            chrome.storage.sync.get('settings', (data) => {
                settings = { ...settings, ...data.settings };
                resolve(settings);
            });
        });

        // 2. 버튼 생성 
        await createButton();
        
        // 3. 설정 변경 감지 리스너 
        chrome.storage.onChanged.addListener((changes) => {
            if (changes.settings) {
                const oldShowButtons = settings.showButtons;
                settings = { ...settings, ...changes.settings.newValue };
                
                if (oldShowButtons !== settings.showButtons) {
                    createButton(); 
                }
                
                logMessage("설정 변경 감지 및 업데이트 완료.");
                if (autoDownloader && autoDownloader.isRunning) {
                    autoDownloader.maxCount = settings.autoCount;
                    autoDownloader.updateProgressDisplay(true);
                }
            }
        });
        
        logMessage("확장 프로그램 초기화 성공.", "success");
    }

    init();
})();