(async () => {
    const constantsModule = await import(chrome.runtime.getURL('scripts/constants.js'));
    const storageModule = await import(chrome.runtime.getURL('scripts/storage.js'));
    const metadataModule = await import(chrome.runtime.getURL('scripts/metadata.js'));
    const uiModule = await import(chrome.runtime.getURL('scripts/ui.js'));

    const { GRID_SELECTOR, IMAGE_SELECTOR, CONTAINER_ID, SVG_ICONS } = constantsModule;
    const { defaultSettings, getFromSync } = storageModule;
    const { parsePngMetadata, saveMetadataCard, fetchImageBuffer, convertBufferToDataUrl, convertCanvasToDataUrl } = metadataModule;
    const { showToast, createControlPanel } = uiModule;
    
        let settings = { ...defaultSettings }; // 기본 설정 값을 가져옴
        let containerPosition = { top: 16, left: 16, isExpanded: true };
        let controls = null;
    
        // 컨트롤 패널의 위치를 스토리지에 저장합니다.
        const persistContainerPosition = () => {
                try {
                chrome.storage.sync.set({ containerPosition });
                } catch (error) {
                console.warn('컨트롤 위치 저장 실패:', error);
            }
        };
    
        // 'Generate' 버튼을 페이지에서 찾습니다.
        function findGenerateButton() {
            const button = Array.from(document.querySelectorAll('button')).find((btn) => {
                const text = btn.textContent || btn.innerText || '';
                return text.includes('Anlas') && text.includes('Generate');
            });
            if (!button) console.warn('NAI 페이지 변경됨. 업데이트 필요.');
            return button || null;
        }
    
        // 패턴과 메타데이터를 기반으로 최종 파일 경로를 생성합니다.
        function generatePath(pattern, metadata, extension) {
            const now = new Date();
            const replacements = {
                index: String(metadata.index).padStart(2, '0'),
                timestamp: now.getTime(),
                date: now.toISOString().split('T')[0],
                time: now.toTimeString().split(' ')[0].replace(/:/g, ''),
                model: metadata.model || 'unknown',
                prompt: (metadata.prompt || 'unknown').substring(0, 40),
                steps: metadata.steps || 'unknown',
                sampler: metadata.sampler || 'unknown',
                seed: metadata.seed || 'unknown',
                strength: metadata.strength || 'unknown',
                noise: metadata.noise || 'unknown',
                scale: metadata.scale || 'unknown'
            };
    
            const path = pattern.replace(/{(\w+)}/g, (match, key) => {
                return replacements[key] || 'unknown';
            });
    
            return `${path}.${extension}`.replace(/[\\:*?"<>|]/g, '_');
        }
    
        // URL에서 파일 확장자를 추출합니다.
        function extractExtension(url) {
            const withoutQuery = url.split('?')[0];
            const parts = withoutQuery.split('.');
            return parts.length > 1 ? parts.pop() : 'jpg';
        }
        
        // 현재 화면에 보이는 이미지들을 가져옵니다.
        function getVisibleImages() {
            const grid = document.querySelector(GRID_SELECTOR);
            if (!grid) return { grid, images: [] };
            const images = Array.from(grid.querySelectorAll(`img${IMAGE_SELECTOR}`)).filter((img) => img.src);
            return { grid, images };
        }
        
        // 이미지 소스를 로드하여 Image 객체로 반환합니다.
        function loadImage(src) {
            return new Promise((resolve, reject) => {
                const image = new Image();
                image.crossOrigin = 'anonymous';
                image.onload = () => resolve(image);
                image.onerror = () => reject(new Error('이미지 로드 실패'));
                image.src = src;
            });
        }
        
        // 이미지를 Canvas를 이용해 다른 포맷으로 변환합니다.
        async function convertImage(src, mimeType, quality) {
            try {
                const image = await loadImage(src);
                const canvas = document.createElement('canvas');
                canvas.width = image.naturalWidth;
                canvas.height = image.naturalHeight;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(image, 0, 0);
                return await convertCanvasToDataUrl(canvas, mimeType, quality);
            } catch (error) {
                console.error('이미지 변환 실패:', error);
                return null;
            }
        }
        
        // 이미지 처리 및 메타데이터 추출
        async function processImage(originalUrl, index, settings) {
            const finalFormat = (settings.format || 'jpeg').toLowerCase();
            const finalMimeType = finalFormat === 'png' ? 'image/png' : finalFormat === 'webp' ? 'image/webp' : 'image/jpeg';
            const finalQuality = finalMimeType === 'image/png' ? 1.0 : settings.quality;
    
            let dataUrl = null;
            let metadata = { index };
    
            try {
                showToast({ message: `이미지 ${index} 분석 중...`, type: 'download', duration: 0, progress: 40 });
                const fetched = await fetchImageBuffer(originalUrl);
                if (fetched?.buffer) {
                    if (fetched.mimeType === 'image/png') {
                        const chunks = await parsePngMetadata(fetched.buffer);
                        if (chunks.length) {
                            const savedResult = await saveMetadataCard({ filename: 'temp', sourceUrl: originalUrl, mimeType: fetched.mimeType, chunks });
                            if (savedResult.success && savedResult.entry) {
                                metadata = { ...metadata, ...savedResult.entry };
                            }
                        }
                    }
                    dataUrl = await convertBufferToDataUrl(fetched.buffer, fetched.mimeType, finalMimeType, finalQuality);
                }
            } catch (error) {
                console.error('이미지 버퍼 처리 실패:', error);
            }
    
            if (!dataUrl) {
                showToast({ message: `이미지 ${index} 변환 중...`, type: 'download', duration: 0, progress: 70 });
                dataUrl = await convertImage(originalUrl, finalMimeType, finalQuality);
            }
    
            return { dataUrl, metadata, finalFormat };
        }
        
        // 단일 이미지 항목을 다운로드합니다.
        async function downloadItem(imageElement, index) {
            if (!imageElement.src) return;
        
            showToast({ message: `이미지 ${index} 처리 중...`, type: 'download', duration: 0, progress: 10 });
    
            const { dataUrl, metadata, finalFormat } = await processImage(imageElement.src, index, settings);
            
            const filenamePattern = settings.filename || defaultSettings.filename;
            const subDirPattern = settings.subDir || defaultSettings.subDir;
            const combinedPattern = subDirPattern ? `${subDirPattern}/${filenamePattern}` : filenamePattern;
            const finalPath = generatePath(combinedPattern, metadata, finalFormat);
            
            if (!dataUrl) {
                showToast({ message: '이미지 변환 실패. 원본 다운로드.', type: 'warn' });
                chrome.runtime.sendMessage({ action: 'download', url: imageElement.src, filename: finalPath });
                return;
            }
        
            chrome.runtime.sendMessage({ action: 'download', url: dataUrl, filename: finalPath });
            showToast({ message: `이미지 ${index} 다운로드 완료`, type: 'success', progress: 100 });
            console.log(`다운로드 요청: ${finalPath}`);
        }
    
        // 현재 보이는 모든 이미지를 다운로드합니다.
        function downloadVisible() {
            try {
                const { grid, images } = getVisibleImages();
                if (!grid) {
                    showToast({ message: '생성된 이미지가 없거나, 찾을 수 없습니다.', type: 'error' });
                    return false;
                }
                if (!images.length) {
                    showToast({ message: '다운로드할 이미지를 찾지 못했습니다.', type: 'info' });
                    return false;
                }
                showToast({ message: `${images.length}개의 이미지 다운로드 시작`, type: 'success' });
                images.forEach((imageElement, index) => {
                    void downloadItem(imageElement, index + 1);
                });
                return true;
            } catch (error) {
                showToast({ message: `다운로드 처리 중 오류: ${error.message}`, type: 'error' });
                console.error(error);
                return false;
            }
        }
    
        const autoDownloader = {
            maxCount: 0,
            count: 0,
            isRunning: false,
            checkInterval: null,
            button: null,
            progressEl: null,
    
            // 자동 다운로더의 UI 상태를 설정합니다.
            setUiState() {
                if (!this.button) return;
                this.button.classList.toggle('is-running', this.isRunning);
                this.button.innerHTML = this.isRunning ? SVG_ICONS.PAUSE : SVG_ICONS.PLAY;
            },
    
            // 진행 상태 표시를 업데이트합니다.
            updateProgressDisplay(show = this.isRunning) {
                if (!this.progressEl) return;
                const shouldShow = settings.showProgress && show && this.isRunning;
                this.progressEl.textContent = shouldShow ? `진행: ${this.count} / ${this.maxCount}` : '';
                this.progressEl.classList.toggle('is-visible', shouldShow);
            },
    
            // 생성 버튼 확인 타이머를 해제합니다.
            clearInterval() {
                if (this.checkInterval) {
                    clearInterval(this.checkInterval);
                    this.checkInterval = null;
                    console.log('버튼 상태 감시 타이머 해제.');
                }
            },
    
            // 자동 다운로드를 시작합니다.
            start() {
                if (this.isRunning) return;
                this.maxCount = settings.autoCount;
                if (this.maxCount <= 0) {
                    showToast({ message: '자동 반복 횟수가 0입니다.', type: 'warn' });
                    return;
                }
                this.isRunning = true;
                this.count = 0;
                showToast({ message: `자동 다운로드 시작: 총 ${this.maxCount}회`, type: 'info', duration: 0 });
                this.setUiState();
                this.updateProgressDisplay(true);
                this.pressGenButton();
            },
    
            // 자동 다운로드를 중지합니다.
            stop() {
                if (!this.isRunning) return;
                this.isRunning = false;
                this.clearInterval();
                showToast({ message: `자동 다운로드 중지: ${this.count}회 실행됨.`, type: 'warn' });
                this.setUiState();
                this.updateProgressDisplay(false);
            },
    
            // 생성 버튼을 누릅니다.
            pressGenButton() {
                if (!this.isRunning) return;
                if (this.count >= this.maxCount) {
                    this.stop();
                    showToast({ message: '자동 다운로드를 완료했습니다.', type: 'success' });
                    return;
                }
    
                this.updateProgressDisplay(true);
                const generateBtn = findGenerateButton();
    
                if (generateBtn && !generateBtn.disabled) {
                    generateBtn.click();
                    this.count += 1;
                    const progress = (this.count / this.maxCount) * 100;
                    showToast({
                        message: `[${this.count}/${this.maxCount}] 이미지 생성 요청...`,
                        type: 'download',
                        duration: 0,
                        progress
                    });
                    this.startCheckLoop();
                } else if (!generateBtn) {
                    showToast({ message: '생성 버튼을 찾을 수 없습니다. 자동 다운로드 중지.', type: 'error' });
                    this.stop();
                } else {
                    console.warn('생성 버튼이 비활성화 상태입니다. 대기합니다.');
                    this.startCheckLoop();
                }
            },
    
            // 생성 버튼의 상태가 바뀔 때까지 확인하는 루프를 시작합니다.
            startCheckLoop() {
                this.clearInterval();
                this.checkInterval = setInterval(() => {
                    const generateBtn = findGenerateButton();
                    if (!this.isRunning) {
                        this.clearInterval();
                        return;
                    }
                    if (generateBtn && !generateBtn.disabled) {
                        this.clearInterval();
                        this.imageGenCompleted();
                    }
                }, settings.loadDelay);
                console.log(`버튼 상태 감시 타이머 시작. (간격: ${settings.loadDelay}ms)`);
            },
    
            // 이미지 생성이 완료된 후 처리를 담당합니다.
            imageGenCompleted() {
                if (!this.isRunning) return;
                const downloaded = downloadVisible();
                if (downloaded) {
                    this.updateProgressDisplay(true);
                    const progress = (this.count / this.maxCount) * 100;
                    showToast({
                        message: `[${this.count}/${this.maxCount}] 다운로드 완료. 다음 생성 대기...`,
                        type: 'download',
                        duration: settings.repeatDelay,
                        progress
                    });
                    setTimeout(() => this.pressGenButton(), settings.repeatDelay);
                } else {
                    showToast({ message: '다운로드 실패. 자동 다운로드 중지.', type: 'error' });
                    this.stop();
                }
            }
        };
    
        // 컨트롤 패널 UI를 렌더링합니다.
        async function renderControls() {
            autoDownloader.button = null;
            autoDownloader.progressEl = null;
    
            if (!settings.showButtons) {
                document.getElementById(CONTAINER_ID)?.remove();
                controls = null;
                return;
            }
    
            controls = createControlPanel({
                settings,
                containerPosition,
                onManualDownload: () => {
                    void downloadVisible();
                },
                onAutoToggle: () => {
                    if (autoDownloader.isRunning) {
                        autoDownloader.stop();
                    } else {
                        autoDownloader.start();
                    }
                },
                onPositionChange: ({ top, left }) => {
                    containerPosition = { ...containerPosition, top, left };
                    persistContainerPosition();
                },
                onExpandChange: (isExpanded) => {
                    containerPosition = { ...containerPosition, isExpanded };
                    persistContainerPosition();
                }
            });
    
            autoDownloader.button = controls.autoBtn;
            autoDownloader.progressEl = controls.progressEl;
            autoDownloader.setUiState();
            autoDownloader.updateProgressDisplay();
        }
    
        // 확장 프로그램을 초기화합니다.
        async function init() {
            console.log('NaiThiefRemover 확장 프로그램 초기화 시작.');
            try {
                const storedSettings = await getFromSync('settings');
                if (storedSettings.settings) {
                    settings = { ...settings, ...storedSettings.settings };
                }
            } catch (error) {
                console.error('설정 불러오기 실패:', error);
            }
    
            try {
                const storedPosition = await getFromSync('containerPosition');
                if (storedPosition.containerPosition) {
                    containerPosition = { ...containerPosition, ...storedPosition.containerPosition };
                }
            } catch (error) {
                console.warn('UI 위치 불러오기에 실패했습니다.', error);
            }
    
            await renderControls();
    
            chrome.storage.onChanged.addListener((changes, area) => { 
                if (area !== 'sync') return;
                if (changes.settings) {
                    const oldShowButtons = settings.showButtons;
                    settings = { ...settings, ...changes.settings.newValue };
                    if (oldShowButtons !== settings.showButtons) {
                        renderControls().catch(console.error);
                    } else {
                        autoDownloader.updateProgressDisplay();
                    }
                    if (autoDownloader.isRunning) {
                        autoDownloader.maxCount = settings.autoCount;
                        autoDownloader.updateProgressDisplay(true);
                        autoDownloader.setUiState();
                    }
                    console.log('설정 변경 감지 및 업데이트 완료.');
                }
                if (changes.containerPosition && changes.containerPosition.newValue) {
                    containerPosition = { ...containerPosition, ...changes.containerPosition.newValue };
                    if (controls?.container) {
                        const { container, toggleBtn } = controls;
                        container.style.top = `${containerPosition.top}px`;
                        container.style.left = `${containerPosition.left}px`;
                        container.classList.toggle('is-collapsed', !containerPosition.isExpanded);
                        if (toggleBtn) {
                            toggleBtn.innerHTML = containerPosition.isExpanded
                                ? SVG_ICONS.TOGGLE_CLOSE
                                : SVG_ICONS.TOGGLE_OPEN;
                        }
                    }
                }
            });
    
            chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
                if (message.action === 'resetContainerPosition') {
                    containerPosition = { ...containerPosition, ...message.position };
                    if (controls?.container) {
                        controls.container.style.top = `${containerPosition.top}px`;
                        controls.container.style.left = `${containerPosition.left}px`;
                    }
                    sendResponse({ status: 'UI position reset' });
                }
            });
    
            console.log('확장 프로그램 초기화 성공.');
        }
    
        init().catch((error) => console.error('초기화 실패:', error));
    })();
     
 