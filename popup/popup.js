document.addEventListener('DOMContentLoaded', function() {
  const closeAllTabsBtn = document.getElementById('closeAllTabs');
  const closeDuplicatesBtn = document.getElementById('closeDuplicates');
  const closeInactiveTabsBtn = document.getElementById('closeInactiveTabs');
  const previewInactiveTabsBtn = document.getElementById('previewInactiveTabs');
  const inactiveTimeSelect = document.getElementById('inactiveTime');
  const autoCleanupCheckbox = document.getElementById('autoCleanup');
  const tabCountElement = document.getElementById('tabCount');
  const inactiveCountElement = document.getElementById('inactiveCount');

  function loadSettings() {
    chrome.storage.sync.get(['inactiveTime', 'autoCleanup'], function(result) {
      if (chrome.runtime.lastError) {
        return;
      }
      inactiveTimeSelect.value = result.inactiveTime || '60';
      autoCleanupCheckbox.checked = result.autoCleanup || false;
    });
  }

  function saveSettings() {
    const settings = {
      inactiveTime: parseInt(inactiveTimeSelect.value),
      autoCleanup: autoCleanupCheckbox.checked
    };
    chrome.storage.sync.set(settings, function() {
      if (chrome.runtime.lastError) {
        return;
      }
      
      if (settings.autoCleanup) {
        chrome.runtime.sendMessage({action: 'enableAutoCleanup', time: settings.inactiveTime});
      } else {
        chrome.runtime.sendMessage({action: 'disableAutoCleanup'});
      }
    });
  }

  function getInactiveTabs(inactiveMinutes, callback) {
    const cutoffTime = Date.now() - (inactiveMinutes * 60 * 1000);
    chrome.tabs.query({}, function(tabs) {
      if (chrome.runtime.lastError) {
        callback([]);
        return;
      }
      
      const currentTab = tabs.find(tab => tab.active);
      const inactiveTabs = tabs.filter(tab => 
        tab.lastAccessed < cutoffTime && 
        tab.id !== currentTab.id &&
        !tab.pinned
      );
      callback(inactiveTabs);
    });
  }

  function updateTabCounts() {
    chrome.tabs.query({}, function(tabs) {
      if (chrome.runtime.lastError) {
        tabCountElement.textContent = 'Total tabs: Error';
        inactiveCountElement.textContent = 'Inactive tabs: Error';
        return;
      }
      
      tabCountElement.textContent = `Total tabs: ${tabs.length}`;
      
      const inactiveMinutes = parseInt(inactiveTimeSelect.value);
      getInactiveTabs(inactiveMinutes, function(inactiveTabs) {
        inactiveCountElement.textContent = `Inactive tabs: ${inactiveTabs.length}`;
      });
    });
  }

  function formatTime(minutes) {
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins === 0 ? `${hours}h` : `${hours}h ${mins}m`;
  }

  closeInactiveTabsBtn.addEventListener('click', function() {
    const inactiveMinutes = parseInt(inactiveTimeSelect.value);
    getInactiveTabs(inactiveMinutes, function(inactiveTabs) {
      if (inactiveTabs.length === 0) {
        alert('No inactive tabs found.');
        return;
      }

      const timeStr = formatTime(inactiveMinutes);
      if (confirm(`Close ${inactiveTabs.length} tabs inactive for more than ${timeStr}?`)) {
        const tabIds = inactiveTabs.map(tab => tab.id);
        chrome.tabs.remove(tabIds, function() {
          if (!chrome.runtime.lastError) {
            updateTabCounts();
          }
        });
      }
    });
  });

  previewInactiveTabsBtn.addEventListener('click', function() {
    const inactiveMinutes = parseInt(inactiveTimeSelect.value);
    getInactiveTabs(inactiveMinutes, function(inactiveTabs) {
      if (inactiveTabs.length === 0) {
        alert('No inactive tabs found.');
        return;
      }

      const timeStr = formatTime(inactiveMinutes);
      const tabList = inactiveTabs
        .slice(0, 10)
        .map(tab => `• ${tab.title || tab.url}`)
        .join('\n');
      
      const moreText = inactiveTabs.length > 10 ? `\n... and ${inactiveTabs.length - 10} more` : '';
      alert(`${inactiveTabs.length} tabs inactive for more than ${timeStr}:\n\n${tabList}${moreText}`);
    });
  });

  closeAllTabsBtn.addEventListener('click', function() {
    if (confirm('Close all tabs? This action cannot be undone.')) {
      chrome.tabs.query({}, function(tabs) {
        if (chrome.runtime.lastError) {
          return;
        }
        
        const currentTab = tabs.find(tab => tab.active);
        const tabIds = tabs.filter(tab => tab.id !== currentTab.id).map(tab => tab.id);
        chrome.tabs.remove(tabIds, function() {
          if (!chrome.runtime.lastError) {
            updateTabCounts();
          }
        });
      });
    }
  });

  closeDuplicatesBtn.addEventListener('click', function() {
    chrome.tabs.query({}, function(tabs) {
      if (chrome.runtime.lastError) {
        alert('Error accessing tabs.');
        return;
      }
      
      const urlSet = new Set();
      const duplicateIds = [];
      
      tabs.forEach(tab => {
        if (urlSet.has(tab.url)) {
          duplicateIds.push(tab.id);
        } else {
          urlSet.add(tab.url);
        }
      });
      
      if (duplicateIds.length > 0) {
        if (confirm(`Close ${duplicateIds.length} duplicate tabs?`)) {
          chrome.tabs.remove(duplicateIds, function() {
            if (!chrome.runtime.lastError) {
              updateTabCounts();
            }
          });
        }
      } else {
        alert('No duplicate tabs found.');
      }
    });
  });

  inactiveTimeSelect.addEventListener('change', function() {
    saveSettings();
    updateTabCounts();
  });

  autoCleanupCheckbox.addEventListener('change', saveSettings);

  loadSettings();
  updateTabCounts();
  setInterval(updateTabCounts, 5000);
});