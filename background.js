chrome.runtime.onInstalled.addListener(() => {
  console.log('Tab Cleaner Extension installed');
  
  chrome.storage.sync.get(['autoCleanup', 'inactiveTime'], function(result) {
    if (result.autoCleanup) {
      setupAutoCleanup(result.inactiveTime || 60);
    }
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'enableAutoCleanup') {
    setupAutoCleanup(message.time);
  } else if (message.action === 'disableAutoCleanup') {
    chrome.alarms.clear('autoCleanup');
  }
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'autoCleanup') {
    performAutoCleanup();
  }
});

function setupAutoCleanup(inactiveMinutes) {
  chrome.alarms.clear('autoCleanup');
  
  const checkIntervalMinutes = Math.min(inactiveMinutes / 4, 30);
  
  chrome.alarms.create('autoCleanup', {
    delayInMinutes: checkIntervalMinutes,
    periodInMinutes: checkIntervalMinutes
  });
  
  console.log(`Auto cleanup enabled: checking every ${checkIntervalMinutes} minutes for tabs inactive longer than ${inactiveMinutes} minutes`);
}

function performAutoCleanup() {
  chrome.storage.sync.get(['inactiveTime', 'autoCleanup'], function(result) {
    if (!result.autoCleanup) {
      chrome.alarms.clear('autoCleanup');
      return;
    }
    
    const inactiveMinutes = result.inactiveTime || 60;
    const cutoffTime = Date.now() - (inactiveMinutes * 60 * 1000);
    
    chrome.tabs.query({}, function(tabs) {
      const currentTab = tabs.find(tab => tab.active);
      const inactiveTabs = tabs.filter(tab => 
        tab.lastAccessed < cutoffTime && 
        tab.id !== currentTab.id &&
        !tab.pinned
      );
      
      if (inactiveTabs.length > 0) {
        const tabIds = inactiveTabs.map(tab => tab.id);
        chrome.tabs.remove(tabIds);
        console.log(`Auto cleanup: closed ${inactiveTabs.length} inactive tabs`);
        
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icons/icon48.png',
          title: 'Tab Cleaner',
          message: `Auto cleanup: closed ${inactiveTabs.length} inactive tabs`
        });
      }
    });
  });
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete') {
    console.log('Tab updated:', tab.url);
  }
});

chrome.action.onClicked.addListener((tab) => {
  console.log('Extension icon clicked');
});