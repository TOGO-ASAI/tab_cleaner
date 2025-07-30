chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  try {
    if (request.action === 'getPageInfo') {
      const pageInfo = {
        title: document.title,
        url: window.location.href,
        timestamp: Date.now()
      };
      sendResponse(pageInfo);
    }
  } catch (error) {
    sendResponse({error: 'Failed to get page info'});
  }
});

document.addEventListener('DOMContentLoaded', function() {
  // Page loaded - no action needed
});