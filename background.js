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
      return true; 
    }
  }
);