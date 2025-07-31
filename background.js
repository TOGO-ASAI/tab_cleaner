chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get(['autoCleanup', 'inactiveTime'], function(result) {
    if (chrome.runtime.lastError) {
      return;
    }
    if (result.autoCleanup) {
      setupAutoCleanup(result.inactiveTime || 60);
    }
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  try {
    if (message.action === 'enableAutoCleanup') {
      setupAutoCleanup(message.time);
    } else if (message.action === 'disableAutoCleanup') {
      chrome.alarms.clear('autoCleanup');
    }
  } catch (error) {
    // Handle errors silently in production
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
}

function performAutoCleanup() {
  chrome.storage.sync.get(['inactiveTime', 'autoCleanup'], function(result) {
    if (chrome.runtime.lastError) {
      return;
    }
    
    if (!result.autoCleanup) {
      chrome.alarms.clear('autoCleanup');
      return;
    }
    
    const inactiveMinutes = result.inactiveTime || 60;
    const cutoffTime = Date.now() - (inactiveMinutes * 60 * 1000);
    
    chrome.tabs.query({}, function(tabs) {
      if (chrome.runtime.lastError) {
        return;
      }
      
      const currentTab = tabs.find(tab => tab.active);
      const inactiveTabs = tabs.filter(tab => 
        tab.lastAccessed < cutoffTime && 
        tab.id !== currentTab.id &&
        !tab.pinned
      );
      
      if (inactiveTabs.length > 0) {
        const tabIds = inactiveTabs.map(tab => tab.id);
        
        // Save to closed tabs history before removing
        const tabsToSave = inactiveTabs.map(tab => ({
          url: tab.url,
          title: tab.title,
          timestamp: Date.now(),
          id: Math.random().toString(36).substr(2, 9)
        }));

        chrome.storage.local.get(['closedTabsHistory'], function(result) {
          const history = result.closedTabsHistory || [];
          const newHistory = [...tabsToSave, ...history].slice(0, 20);
          chrome.storage.local.set({ closedTabsHistory: newHistory });
        });

        chrome.tabs.remove(tabIds, function() {
          if (chrome.runtime.lastError) {
            return;
          }
          
          chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icons/icon48.png',
            title: 'Tab Cleaner',
            message: `Auto cleanup: closed ${inactiveTabs.length} inactive tabs`
          }, function() {
            // Notification created, ignore any errors
          });
        });
      }
    });
  });
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // Tab updated event - no action needed
});

chrome.action.onClicked.addListener((tab) => {
  // Extension icon clicked - handled by popup
});