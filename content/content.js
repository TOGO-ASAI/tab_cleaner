console.log('Tab Cleaner content script loaded');

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getPageInfo') {
    const pageInfo = {
      title: document.title,
      url: window.location.href,
      timestamp: Date.now()
    };
    sendResponse(pageInfo);
  }
});

document.addEventListener('DOMContentLoaded', function() {
  console.log('Page loaded:', document.title);
});