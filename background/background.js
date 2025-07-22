
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url && !tab.url.startsWith('chrome://')) {
    chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: ['content/content.js']
    }).catch(err => console.error('注入脚本失败:', err));
  }
});

// 监听安装事件
chrome.runtime.onInstalled.addListener(() => {
  console.log('Webpack JS Extractor 已安装');
}); 