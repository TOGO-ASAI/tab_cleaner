chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get(['autoCleanup', 'inactiveTime'], function(result) {
    if (chrome.runtime.lastError) {
      return;
    }
    if (result.autoCleanup) {
      setupAutoCleanup(result.inactiveTime || 60);
    }
  });
  
  setupArchiveCleanup();
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
  } else if (alarm.name === 'archiveCleanup') {
    performArchiveCleanup();
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

function setupArchiveCleanup() {
  chrome.alarms.clear('archiveCleanup');
  
  chrome.alarms.create('archiveCleanup', {
    delayInMinutes: 60,
    periodInMinutes: 60
  });
}

function performArchiveCleanup() {
  chrome.storage.local.get(['archivedTabs'], function(result) {
    if (chrome.runtime.lastError) {
      return;
    }
    
    const archivedTabs = result.archivedTabs || [];
    const cutoffTime = Date.now() - (24 * 60 * 60 * 1000);
    
    const remainingTabs = archivedTabs.filter(tab => tab.archivedAt > cutoffTime);
    const deletedCount = archivedTabs.length - remainingTabs.length;
    
    if (deletedCount > 0) {
      chrome.storage.local.set({ archivedTabs: remainingTabs }, function() {
        if (!chrome.runtime.lastError && deletedCount > 0) {
          chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icons/icon.png',
            title: 'Tab Cleaner - Archive Cleanup',
            message: `Automatically deleted ${deletedCount} archived tabs older than 24 hours`
          }, function() {
            // Notification created
          });
        }
      });
    }
  });
}