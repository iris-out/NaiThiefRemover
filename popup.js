(() => {
    // 중복 실행 방지 플래그
    if (window.popupInitialized) {
        return;
    }
    window.popupInitialized = true;

    // 팝업이 로드될 때 초기화 함수를 실행합니다.
    document.addEventListener('DOMContentLoaded', initPopup);

    // 팝업의 모든 UI 요소와 이벤트를 초기화합니다.
    function initPopup() {
        const ui = collectElements();
        const defaults = getDefaultSettings();
        const fieldTypes = getFieldTypes();

        applySettingsFromStorage();
        renderHistoryCards();

        // 탭 전환 이벤트를 설정합니다.
        if (ui.tabs) {
            ui.tabs.addEventListener('click', (event) => switchTab(event, ui));
        }

        // 키워드 버튼 클릭 이벤트를 설정합니다.
        document.querySelectorAll('.keyword-buttons').forEach(container => {
            container.addEventListener('click', (event) => {
                if (event.target.classList.contains('keyword-btn')) {
                    const keyword = event.target.dataset.keyword;
                    const targetInputId = event.currentTarget.dataset.targetInput;
                    const targetInput = document.getElementById(targetInputId);
                    if (targetInput) {
                        insertAtCursor(targetInput, keyword);
                    }
                }
            });
        });

        ui.quality.addEventListener('input', () => updateQualityDisplay(ui));
        ui.format.addEventListener('change', () => updateQualityDisplay(ui));
        ui.saveBtn.addEventListener('click', () => saveSettings(ui, fieldTypes, defaults));
        ui.resetBtn.addEventListener('click', () => resetSettings(ui, defaults));

        ui.clearLogBtn?.addEventListener('click', () => clearLogs(ui));
        ui.refreshLogBtn?.addEventListener('click', () => loadLogs(ui));
        ui.clearHistoryBtn?.addEventListener('click', () => clearHistory(renderHistoryCards));
        ui.refreshHistoryBtn?.addEventListener('click', () => renderHistoryCards());
        ui.resetUiPositionBtn?.addEventListener('click', () => resetContainerPosition(ui));
        ui.promptSearch?.addEventListener('input', () => {
            const searchTerm = ui.promptSearch.value;
            renderHistoryCards(searchTerm);
        });

        // 스토리지에서 설정을 불러와 UI에 적용합니다.
        function applySettingsFromStorage() {
            chrome.storage.sync.get('settings', (data) => {
                const merged = { ...defaults, ...data.settings };
                applySettings(ui, merged, fieldTypes);
            });
        }
    }

    // 팝업 UI의 모든 DOM 요소를 수집합니다.
    function collectElements() {
        return {
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
            logDisplay: document.getElementById('log-display'),
            clearLogBtn: document.getElementById('clearLogBtn'),
            refreshLogBtn: document.getElementById('refreshLogBtn'),
            historyCards: document.getElementById('history-cards'),
            clearHistoryBtn: document.getElementById('clearHistoryBtn'),
            refreshHistoryBtn: document.getElementById('refreshHistoryBtn'),
            promptSearch: document.getElementById('prompt-search'),
            tabButtons: document.querySelectorAll('.tab-button'),
            tabContents: document.querySelectorAll('.tab-content'),
            tabs: document.querySelector('.tab-bar'),
            resetUiPositionBtn: document.getElementById('resetUiPositionBtn')
        };
    }

    // 기본 설정 값을 반환합니다.
    function getDefaultSettings() {
        return {
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
    }

    // 각 설정 필드의 데이터 타입을 반환합니다.
    function getFieldTypes() {
        return {
            filename: 'text',
            subDir: 'text',
            format: 'text',
            quality: 'number',
            autoCount: 'int',
            showButtons: 'checkbox',
            showProgress: 'checkbox',
            loadDelay: 'int',
            repeatDelay: 'int'
        };
    }

    // 텍스트 입력 필드의 현재 커서 위치에 텍스트를 삽입합니다.
    function insertAtCursor(input, textToInsert) {
        const start = input.selectionStart;
        const end = input.selectionEnd;
        const text = input.value;
        input.value = text.substring(0, start) + textToInsert + text.substring(end);
        input.focus();
        input.selectionEnd = start + textToInsert.length;
    }

    // 상태 메시지를 잠시 보여줍니다.
    function flashStatus(ui, message) {
        if (!ui.status) return;
        ui.status.textContent = message;
        setTimeout(() => {
            if (ui.status.textContent === message) {
                ui.status.textContent = '';
            }
        }, 3000);
    }

    // UI에 설정 값을 적용합니다.
    function applySettings(ui, values, fieldTypes) {
        for (const [key, fieldType] of Object.entries(fieldTypes)) {
            const input = ui[key];
            if (!input) continue;
            const value = values[key];

            if (fieldType === 'checkbox') {
                input.checked = Boolean(value);
            } else {
                input.value = value ?? '';
            }
        }
        updateQualityDisplay(ui);
    }

    // UI에서 현재 설정 값을 읽어옵니다.
    function readSettings(ui, fieldTypes, defaults) {
        const result = {};
        for (const [key, fieldType] of Object.entries(fieldTypes)) {
            const input = ui[key];
            if (!input) continue;
            if (fieldType === 'checkbox') {
                result[key] = input.checked;
            } else if (fieldType === 'number') {
                const numberValue = parseFloat(input.value);
                result[key] = Number.isNaN(numberValue) ? defaults[key] : numberValue;
            } else if (fieldType === 'int') {
                const intValue = parseInt(input.value, 10);
                result[key] = Number.isNaN(intValue) ? defaults[key] : intValue;
            } else {
                result[key] = input.value.trim();
            }
        }
        return result;
    }

    // 품질 슬라이더의 표시를 업데이트합니다.
    function updateQualityDisplay(ui) {
        ui.qualityVal.textContent = Number(ui.quality.value).toFixed(2);
        ui.quality.disabled = ui.format.value === 'png';
    }

    // 현재 설정을 스토리지에 저장합니다.
    function saveSettings(ui, fieldTypes, defaults) {
        const settings = readSettings(ui, fieldTypes, defaults);
        chrome.storage.sync.set({ settings }, () => flashStatus(ui, '설정이 저장되었습니다!'));
    }

    // 모든 설정을 기본값으로 되돌립니다.
    function resetSettings(ui, defaults) {
        if (!confirm('모든 설정을 기본값으로 되돌리시겠습니까?')) return;
        applySettings(ui, defaults, getFieldTypes());
        chrome.storage.sync.set({ settings: defaults }, () => flashStatus(ui, '설정을 초기화했습니다.'));
    }

    // 저장된 로그를 불러와 표시합니다.
    function loadLogs(ui) {
        chrome.storage.local.get('logs', (data) => {
            const logs = Array.isArray(data.logs) ? data.logs : [];
            ui.logDisplay.innerHTML = '';
            if (!logs.length) {
                ui.logDisplay.textContent = '기록된 로그가 없습니다.';
                return;
            }

            for (const log of [...logs].reverse()) {
                const entry = document.createElement('div');
                entry.classList.add('log-entry', log.type);
                const timeString = new Date(log.timestamp).toLocaleTimeString();
                entry.textContent = `[${timeString}] ${log.message}`;
                ui.logDisplay.appendChild(entry);
            }
            ui.logDisplay.scrollTop = 0;
        });
    }

    // 모든 로그 기록을 삭제합니다.
    function clearLogs(ui) {
        if (!confirm('모든 로그 기록을 삭제하시겠습니까?')) return;
        chrome.storage.local.set({ logs: [] }, () => {
            ui.logDisplay.textContent = '로그 기록이 삭제되었습니다.';
        });
    }

    // 모든 메타데이터 기록을 삭제합니다.
    function clearHistory(callback) {
        if (!confirm('모든 메타데이터 내역을 삭제하시겠습니까?')) return;
        chrome.storage.local.set({ metadataCards: [] }, () => {
            callback();
        });
    }

    const CardBuilder = {
        build(card) {
            const wrapper = document.createElement('article');
            wrapper.className = 'history-card';

            const header = this.buildHeader(card.createdAt);
            const body = this.buildBody(card);

            wrapper.appendChild(header);
            wrapper.appendChild(body);
            return wrapper;
        },

        buildHeader(isoString) {
            const header = document.createElement('div');
            header.className = 'history-card-header';
            const date = new Date(isoString);
            header.textContent = Number.isNaN(date.getTime()) ? isoString : date.toLocaleString();
            return header;
        },

        buildBody(card) {
            const body = document.createElement('div');
            body.className = 'history-card-body';

            if (card.prompt) {
                body.appendChild(this.buildSection('프롬프트', card.prompt));
            }
            if (card.characters && card.characters.length > 0) {
                body.appendChild(this.buildCharactersSection(card.characters));
            }
            if (card.artistTags && card.artistTags.length > 0) {
                body.appendChild(this.buildArtistTagsSection(card.artistTags));
            }
            if (card.uc) {
                body.appendChild(this.buildCollapsibleSection('부정 프롬프트', card.uc));
            }
            body.appendChild(this.buildMetaGrid(card));
            
            return body;
        },

        buildSection(label, content) {
            const section = document.createElement('section');
            section.className = 'history-section';
            const heading = document.createElement('h3');
            heading.textContent = label;
            section.appendChild(heading);
            const paragraph = document.createElement('p');
            paragraph.textContent = content;
            section.appendChild(paragraph);
            return section;
        },

        buildCharactersSection(characters) {
            const section = document.createElement('section');
            section.className = 'history-section';
            const heading = document.createElement('h3');
            heading.textContent = '캐릭터';
            section.appendChild(heading);

            characters.forEach((char, index) => {
                const charSection = document.createElement('div');
                charSection.style.marginBottom = '8px';
                const charHeading = document.createElement('h4');
                charHeading.textContent = `캐릭터 ${index + 1}`;
                charHeading.style.margin = '0 0 4px 0';
                charHeading.style.fontSize = '0.85rem';
                charHeading.style.fontWeight = '600';
                charHeading.style.color = 'rgba(176, 194, 236, 0.95)';
                charSection.appendChild(charHeading);
                const charParagraph = document.createElement('p');
                charParagraph.textContent = char;
                charParagraph.style.margin = '0';
                charParagraph.style.fontSize = '0.8rem';
                charParagraph.style.whiteSpace = 'pre-wrap';
                charParagraph.style.wordBreak = 'break-word';
                charSection.appendChild(charParagraph);
                section.appendChild(charSection);
            });
            return section;
        },

        buildArtistTagsSection(tags) {
            const section = document.createElement('section');
            section.className = 'history-section';
            const heading = document.createElement('h3');
            heading.textContent = '작가 태그';
            section.appendChild(heading);

            const tagsContainer = document.createElement('div');
            tagsContainer.className = 'artist-tags';
            tags.forEach(tag => {
                const tagEl = document.createElement('span');
                tagEl.className = 'artist-tag';
                tagEl.textContent = tag;
                tagsContainer.appendChild(tagEl);
            });
            section.appendChild(tagsContainer);
            return section;
        },

        buildCollapsibleSection(label, content) {
            const details = document.createElement('details');
            details.className = 'metadata-details';
            const summary = document.createElement('summary');
            summary.textContent = label;
            details.appendChild(summary);
            
            const paragraph = document.createElement('p');
            paragraph.textContent = content;
            paragraph.style.padding = '8px 10px';
            paragraph.style.margin = '0';
            paragraph.style.fontSize = '0.8rem';
            paragraph.style.whiteSpace = 'pre-wrap';
            paragraph.style.wordBreak = 'break-word';
            details.appendChild(paragraph);
            
            return details;
        },

        buildMetaGrid(card) {
            const grid = document.createElement('div');
            grid.className = 'history-meta-grid';
            
            const items = {
                'Seed': card.seed,
                'Sampler': card.sampler,
                'Scale': card.scale,
                'Steps': card.steps,
                'Model': card.model,
                'Size': card.width && card.height ? `${card.width}x${card.height}` : null
            };

            for (const [label, value] of Object.entries(items)) {
                if (value !== null && value !== undefined) {
                    const item = document.createElement('div');
                    item.className = 'meta-item';
                    item.innerHTML = `<span class="meta-item-label">${label}</span><span class="meta-item-value">${value}</span>`;
                    grid.appendChild(item);
                }
            }
            return grid;
        },

    };

    // 메타데이터 기록을 카드 형태로 렌더링합니다.
    function renderHistoryCards(searchTerm = '') {
        const container = document.getElementById('history-cards');
        if (!container) return;

        chrome.storage.local.get('metadataCards', (data) => {
            const cards = Array.isArray(data.metadataCards) ? data.metadataCards : [];
            container.innerHTML = '';

            const filteredCards = searchTerm
                ? cards.filter(card => {
                    const searchableText = [
                        card.prompt,
                        card.artistTags?.join(' '),
                        card.model,
                        card.sampler,
                        String(card.seed)
                    ]
                        .filter(Boolean)
                        .join(' ')
                        .toLowerCase();
                    return searchableText.includes(searchTerm.toLowerCase());
                })
                : cards;

            if (!filteredCards.length) {
                const empty = document.createElement('div');
                empty.className = 'empty-state';
                empty.textContent = searchTerm ? '검색 결과가 없습니다.' : '아직 저장된 메타데이터가 없습니다.';
                container.appendChild(empty);
                return;
            }

            const reversed = [...filteredCards].reverse();
            for (const card of reversed) {
                container.appendChild(CardBuilder.build(card));
            }
        });
    }

    function extractPromptWords(cards) {
        return cards.flatMap(card => {
            const cleanedPrompt = (card.prompt || '')
                .replace(/artist:([^,:]+)/gi, '')
                .replace(/art:([^,:]+)/gi, '')
                .replace(/\(([^)]*):\d+\.?\d*\)/g, '$1')
                .replace(/:\d+\.?\d*/g, '')
                .replace(/::/g, ' ');
            return cleanedPrompt.split(',')
                .map(word => word.trim())
                .filter(word => word.length > 0);
        });
    }

    function renderAnalyticsContent(container, cards) {
        container.innerHTML = '';
        
        if (cards.length < 3) {
            const empty = document.createElement('div');
            empty.className = 'empty-state';
            empty.textContent = '분석할 데이터가 부족합니다. (최소 3개 필요)';
            container.appendChild(empty);
            return;
        }

        const artistCounts = countOccurrences(cards.flatMap(card => card.artistTags || []));
        const samplerCounts = countOccurrences(cards.map(card => card.sampler).filter(Boolean));
        const modelCounts = countOccurrences(cards.map(card => card.model).filter(Boolean));
        const promptWords = extractPromptWords(cards);
        const wordCounts = countOccurrences(promptWords);

        container.appendChild(createAnalyticsSection('가장 많이 쓴 작가 태그', artistCounts));
        container.appendChild(createAnalyticsSection('가장 많이 쓴 프롬프트 단어', wordCounts));
        container.appendChild(createAnalyticsSection('가장 많이 쓴 샘플러', samplerCounts));
        container.appendChild(createAnalyticsSection('가장 많이 쓴 모델', modelCounts));
    }

    async function renderAnalytics() {
        const container = document.getElementById('analytics-content');
        if (!container) return;

        container.innerHTML = '<div class="empty-state">분석 중...</div>';

        const storageElement = await renderStorageAnalytics();

        chrome.storage.local.get('metadataCards', (data) => {
            container.innerHTML = '';
            container.appendChild(storageElement);

            const cards = Array.isArray(data.metadataCards) ? data.metadataCards : [];
            renderAnalyticsContent(container, cards);
        });
    }

    async function renderStorageAnalytics() {
        const container = document.createElement('div');
        container.id = 'storage-analytics';

        const formatBytes = (bytes) => {
            if (bytes === 0) return '0 B';
            const k = 1024;
            const sizes = ['B', 'KB', 'MB', 'GB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
        };

        const createProgressBar = async (type) => {
            const storage = chrome.storage[type];
            const quota = storage.QUOTA_BYTES;
            const inUse = await new Promise(resolve => storage.getBytesInUse(null, resolve));
            const percentage = quota > 0 ? (inUse / quota) * 100 : 0;

            const section = document.createElement('div');
            section.className = 'storage-section';
            
            const title = type === 'sync' ? '설정 동기화' : '로컬 데이터';

            section.innerHTML = `
                <div class="storage-label">
                    <span>${title} 사용량</span>
                    <span>${formatBytes(inUse)} / ${formatBytes(quota)}</span>
                </div>
                <div class="progress-bar-container">
                    <div class="progress-bar" style="width: ${percentage.toFixed(2)}%;"></div>
                </div>
            `;
            return section;
        };
        
        const syncBar = await createProgressBar('sync');
        const localBar = await createProgressBar('local');
        container.appendChild(syncBar);
        container.appendChild(localBar);
        return container;
    }

    function countOccurrences(arr) {
        const counts = arr.reduce((acc, value) => {
            const lowerValue = value.toLowerCase();
            acc[lowerValue] = (acc[lowerValue] || 0) + 1;
            return acc;
        }, {});
        return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 15);
    }

    function createAnalyticsSection(title, data) {
        const section = document.createElement('div');
        section.className = 'analytics-section';
        
        const heading = document.createElement('h3');
        heading.textContent = title;
        section.appendChild(heading);

        if (data.length === 0) {
            const empty = document.createElement('p');
            empty.textContent = '데이터가 없습니다.';
            empty.className = 'empty-state';
            section.appendChild(empty);
            return section;
        }

        const list = document.createElement('ul');
        list.className = 'analytics-list';
        data.forEach(([label, count]) => {
            const item = document.createElement('li');
            item.className = 'analytics-list-item';
            item.innerHTML = `<span class="analytics-item-label">${label}</span><span class="analytics-item-count">${count}</span>`;
            list.appendChild(item);
        });
        section.appendChild(list);
        return section;
    }


    // 탭 버튼 클릭 시 해당 탭을 보여줍니다.
    function switchTab(event, ui) {
        const button = event.target.closest('.tab-button');
        if (!button) return;

        const targetId = button.dataset.tab;
        for (const tabButton of ui.tabButtons) {
            tabButton.classList.toggle('active', tabButton === button);
        }
        for (const tab of ui.tabContents) {
            tab.classList.toggle('active', tab.id === targetId);
        }

        if (targetId === 'log') {
            loadLogs(ui);
        } else if (targetId === 'history') {
            renderHistoryCards();
        } else if (targetId === 'analytics') {
            renderAnalytics();
        }
    }

    // 컨트롤 패널의 위치를 초기화합니다.
    function resetContainerPosition(ui) {
        if (!confirm('컨트롤 패널의 위치를 초기화하시겠습니까?')) return;
        const defaultPosition = { top: 16, left: 16 };
        chrome.storage.sync.set({ containerPosition: defaultPosition }, () => {
            flashStatus(ui, 'UI 위치가 초기화되었습니다.');
            // content script에 메시지를 보내 UI 위치를 업데이트합니다.
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs[0]) {
                    chrome.tabs.sendMessage(tabs[0].id, { action: 'resetContainerPosition', position: defaultPosition });
                }
            });
        });
    }
})();
