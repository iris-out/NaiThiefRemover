// content script로부터 메시지를 수신하고, 'download' 액션일 경우 다운로드를 실행합니다.
chrome.runtime.onMessage.addListener(
  function(request, sender, sendResponse) {
    if (request.action === "download") {
      chrome.downloads.download({ 
        url: request.url,
        filename: request.filename,
        saveAs: false // 저장 대화상자 표시 여부
      }, (downloadId) => {
        if (chrome.runtime.lastError) {
          console.error("다운로드 실패:", chrome.runtime.lastError.message);
        } else {
          console.log(`다운로드 요청 처리됨 (ID: ${downloadId}, 파일: ${request.filename})`);
        }
      });
      return true; // 비동기 응답을 위해 true 반환
    }
  }
);