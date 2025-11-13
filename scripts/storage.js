export const defaultSettings = {
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

export const METADATA_STORAGE_KEY = 'metadataCards';
export const METADATA_MAX_ENTRIES = 500; // 메타데이터 최대 저장 개수

// Chrome 동기화 스토리지에서 데이터를 가져옵니다.
export const getFromSync = (keys) => new Promise((resolve) => chrome.storage.sync.get(keys, resolve));
// Chrome 로컬 스토리지에서 데이터를 가져옵니다.
export const getFromLocal = (keys) => new Promise((resolve) => chrome.storage.local.get(keys, resolve));
// Chrome 로컬 스토리지에 데이터를 저장합니다.
export const setToLocal = (items) => new Promise((resolve) => chrome.storage.local.set(items, resolve));
// Sync와 Local의 차이 : Sync는 브라우저 종료 시 데이터가 삭제되지 않지만, Local은 삭제됨.

