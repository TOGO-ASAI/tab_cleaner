document.addEventListener('DOMContentLoaded', function() {
  const closeAllTabsBtn = document.getElementById('closeAllTabs');
  const closeDuplicatesBtn = document.getElementById('closeDuplicates');
  const closeInactiveTabsBtn = document.getElementById('closeInactiveTabs');
  const previewInactiveTabsBtn = document.getElementById('previewInactiveTabs');
  const groupTabsByDomainBtn = document.getElementById('groupTabsByDomain');
  const ungroupAllTabsBtn = document.getElementById('ungroupAllTabs');
  const inactiveTimeSelect = document.getElementById('inactiveTime');
  const autoCleanupCheckbox = document.getElementById('autoCleanup');
  const tabCountElement = document.getElementById('tabCount');
  const inactiveCountElement = document.getElementById('inactiveCount');
  const groupCountElement = document.getElementById('groupCount');

  // Utility functions for better UX
  function setButtonLoading(button, isLoading) {
    if (isLoading) {
      button.classList.add('loading');
      button.disabled = true;
    } else {
      button.classList.remove('loading');
      button.disabled = false;
    }
  }

  function showNotification(message, type = 'info') {
    // Create a simple notification system
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    notification.style.cssText = `
      position: fixed;
      top: 10px;
      right: 10px;
      background: ${type === 'success' ? '#48bb78' : type === 'error' ? '#f56565' : '#4fc3f7'};
      color: white;
      padding: 12px 16px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      font-size: 13px;
      font-weight: 500;
      z-index: 1000;
      animation: slideInRight 0.3s ease;
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
      notification.style.animation = 'slideOutRight 0.3s ease';
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  }

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
    // Add loading animation to status items
    const statusCounts = [tabCountElement, inactiveCountElement, groupCountElement];
    statusCounts.forEach(item => {
      item.style.opacity = '0.5';
      item.textContent = '...';
    });

    chrome.tabs.query({}, function(tabs) {
      if (chrome.runtime.lastError) {
        statusCounts.forEach(item => {
          item.style.opacity = '1';
          item.textContent = '?';
        });
        return;
      }
      
      tabCountElement.textContent = tabs.length;
      tabCountElement.style.opacity = '1';
      
      const inactiveMinutes = parseInt(inactiveTimeSelect.value);
      getInactiveTabs(inactiveMinutes, function(inactiveTabs) {
        inactiveCountElement.textContent = inactiveTabs.length;
        inactiveCountElement.style.opacity = '1';
        
        // Update button state based on inactive tabs
        if (inactiveTabs.length > 0) {
          closeInactiveTabsBtn.classList.remove('btn-disabled');
          previewInactiveTabsBtn.classList.remove('btn-disabled');
        } else {
          closeInactiveTabsBtn.classList.add('btn-disabled');
          previewInactiveTabsBtn.classList.add('btn-disabled');
        }
      });

      chrome.tabGroups.query({}, function(groups) {
        if (chrome.runtime.lastError) {
          groupCountElement.style.opacity = '1';
          groupCountElement.textContent = '?';
          return;
        }
        groupCountElement.textContent = groups.length;
        groupCountElement.style.opacity = '1';
      });
    });
  }

  function formatTime(minutes) {
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins === 0 ? `${hours}h` : `${hours}h ${mins}m`;
  }

  function getDomainFromUrl(url) {
    try {
      const domain = new URL(url).hostname;
      return domain.replace(/^www\./, '');
    } catch {
      return 'other';
    }
  }

  function getGroupColors() {
    return ['blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange'];
  }

  function groupTabsByDomain() {
    setButtonLoading(groupTabsByDomainBtn, true);
    
    chrome.tabs.query({}, function(tabs) {
      if (chrome.runtime.lastError) {
        setButtonLoading(groupTabsByDomainBtn, false);
        showNotification('Error accessing tabs', 'error');
        return;
      }

      const domainGroups = {};
      const pinnedTabs = [];
      
      tabs.forEach(tab => {
        if (tab.pinned) {
          pinnedTabs.push(tab);
          return;
        }
        
        const domain = getDomainFromUrl(tab.url);
        if (!domainGroups[domain]) {
          domainGroups[domain] = [];
        }
        domainGroups[domain].push(tab);
      });

      const colors = getGroupColors();
      let colorIndex = 0;
      let groupsCreated = 0;
      const groupabledomains = Object.entries(domainGroups).filter(([domain, domainTabs]) => domainTabs.length >= 2);

      if (groupabledomains.length === 0) {
        setButtonLoading(groupTabsByDomainBtn, false);
        showNotification('No domains with 2+ tabs found', 'info');
        return;
      }

      groupabledomains.forEach(([domain, domainTabs]) => {
        const tabIds = domainTabs.map(tab => tab.id);
        const groupColor = colors[colorIndex % colors.length];
        
        chrome.tabs.group({ tabIds: tabIds }, function(groupId) {
          if (chrome.runtime.lastError) {
            return;
          }
          
          chrome.tabGroups.update(groupId, {
            title: domain,
            color: groupColor
          }, function() {
            if (!chrome.runtime.lastError) {
              groupsCreated++;
            }
            
            // Check if this was the last group
            if (groupsCreated === groupabledomains.length) {
              setButtonLoading(groupTabsByDomainBtn, false);
              showNotification(`Created ${groupsCreated} tab groups by domain`, 'success');
              updateTabCounts();
            }
          });
        });
        
        colorIndex++;
      });
    });
  }

  function ungroupAllTabs() {
    setButtonLoading(ungroupAllTabsBtn, true);
    
    chrome.tabGroups.query({}, function(groups) {
      if (chrome.runtime.lastError) {
        setButtonLoading(ungroupAllTabsBtn, false);
        showNotification('Error accessing tab groups', 'error');
        return;
      }

      if (groups.length === 0) {
        setButtonLoading(ungroupAllTabsBtn, false);
        showNotification('No tab groups found', 'info');
        return;
      }

      if (confirm(`Ungroup all ${groups.length} tab groups?`)) {
        let ungroupedCount = 0;
        
        groups.forEach(group => {
          chrome.tabs.ungroup(group.id, function() {
            ungroupedCount++;
            if (ungroupedCount === groups.length) {
              setButtonLoading(ungroupAllTabsBtn, false);
              showNotification(`Ungrouped ${groups.length} tab groups`, 'success');
              updateTabCounts();
            }
          });
        });
      } else {
        setButtonLoading(ungroupAllTabsBtn, false);
      }
    });
  }

  closeInactiveTabsBtn.addEventListener('click', function() {
    const inactiveMinutes = parseInt(inactiveTimeSelect.value);
    setButtonLoading(closeInactiveTabsBtn, true);
    
    getInactiveTabs(inactiveMinutes, function(inactiveTabs) {
      setButtonLoading(closeInactiveTabsBtn, false);
      
      if (inactiveTabs.length === 0) {
        showNotification('No inactive tabs found', 'info');
        return;
      }

      const timeStr = formatTime(inactiveMinutes);
      if (confirm(`Close ${inactiveTabs.length} tabs inactive for more than ${timeStr}?`)) {
        setButtonLoading(closeInactiveTabsBtn, true);
        const tabIds = inactiveTabs.map(tab => tab.id);
        
        chrome.tabs.remove(tabIds, function() {
          setButtonLoading(closeInactiveTabsBtn, false);
          if (!chrome.runtime.lastError) {
            showNotification(`Successfully closed ${inactiveTabs.length} inactive tabs`, 'success');
            updateTabCounts();
          } else {
            showNotification('Error closing tabs', 'error');
          }
        });
      }
    });
  });

  previewInactiveTabsBtn.addEventListener('click', function() {
    const inactiveMinutes = parseInt(inactiveTimeSelect.value);
    setButtonLoading(previewInactiveTabsBtn, true);
    
    getInactiveTabs(inactiveMinutes, function(inactiveTabs) {
      setButtonLoading(previewInactiveTabsBtn, false);
      
      if (inactiveTabs.length === 0) {
        showNotification('No inactive tabs found', 'info');
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
      setButtonLoading(closeAllTabsBtn, true);
      
      chrome.tabs.query({}, function(tabs) {
        if (chrome.runtime.lastError) {
          setButtonLoading(closeAllTabsBtn, false);
          showNotification('Error accessing tabs', 'error');
          return;
        }
        
        const currentTab = tabs.find(tab => tab.active);
        const tabsToClose = tabs.filter(tab => tab.id !== currentTab.id);
        const tabIds = tabsToClose.map(tab => tab.id);
        
        if (tabIds.length === 0) {
          setButtonLoading(closeAllTabsBtn, false);
          showNotification('Only current tab open', 'info');
          return;
        }
        
        chrome.tabs.remove(tabIds, function() {
          setButtonLoading(closeAllTabsBtn, false);
          if (!chrome.runtime.lastError) {
            showNotification(`Closed ${tabIds.length} tabs`, 'success');
            updateTabCounts();
          } else {
            showNotification('Error closing tabs', 'error');
          }
        });
      });
    }
  });

  closeDuplicatesBtn.addEventListener('click', function() {
    setButtonLoading(closeDuplicatesBtn, true);
    
    chrome.tabs.query({}, function(tabs) {
      setButtonLoading(closeDuplicatesBtn, false);
      
      if (chrome.runtime.lastError) {
        showNotification('Error accessing tabs', 'error');
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
          setButtonLoading(closeDuplicatesBtn, true);
          chrome.tabs.remove(duplicateIds, function() {
            setButtonLoading(closeDuplicatesBtn, false);
            if (!chrome.runtime.lastError) {
              showNotification(`Successfully removed ${duplicateIds.length} duplicate tabs`, 'success');
              updateTabCounts();
            } else {
              showNotification('Error removing duplicates', 'error');
            }
          });
        }
      } else {
        showNotification('No duplicate tabs found', 'info');
      }
    });
  });

  inactiveTimeSelect.addEventListener('change', function() {
    saveSettings();
    updateTabCounts();
  });

  autoCleanupCheckbox.addEventListener('change', saveSettings);

  groupTabsByDomainBtn.addEventListener('click', groupTabsByDomain);
  ungroupAllTabsBtn.addEventListener('click', ungroupAllTabs);

  loadSettings();
  updateTabCounts();
  setInterval(updateTabCounts, 5000);
});