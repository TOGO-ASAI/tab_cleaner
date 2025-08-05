document.addEventListener('DOMContentLoaded', function() {
  const closeAllTabsBtn = document.getElementById('closeAllTabs');
  const closeDuplicatesBtn = document.getElementById('closeDuplicates');
  const closeInactiveTabsBtn = document.getElementById('closeInactiveTabs');
  const archiveInactiveTabsBtn = document.getElementById('archiveInactiveTabs');
  const viewArchivedTabsBtn = document.getElementById('viewArchivedTabs');
  const restoreAllArchivedBtn = document.getElementById('restoreAllArchived');
  const previewInactiveTabsBtn = document.getElementById('previewInactiveTabs');
  const groupTabsByDomainBtn = document.getElementById('groupTabsByDomain');
  const ungroupAllTabsBtn = document.getElementById('ungroupAllTabs');
  const inactiveTimeSelect = document.getElementById('inactiveTime');
  const autoCleanupCheckbox = document.getElementById('autoCleanup');
  const tabCountElement = document.getElementById('tabCount');
  const inactiveCountElement = document.getElementById('inactiveCount');
  const groupCountElement = document.getElementById('groupCount');
  const archivedCountElement = document.getElementById('archivedCount');

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
        groupCountElement.textContent = 'Tab groups: Error';
        archivedCountElement.textContent = 'Archived tabs: Error';
        return;
      }
      
      tabCountElement.textContent = `Total tabs: ${tabs.length}`;
      
      const inactiveMinutes = parseInt(inactiveTimeSelect.value);
      getInactiveTabs(inactiveMinutes, function(inactiveTabs) {
        inactiveCountElement.textContent = `Inactive tabs: ${inactiveTabs.length}`;
      });

      chrome.tabGroups.query({}, function(groups) {
        if (chrome.runtime.lastError) {
          groupCountElement.textContent = 'Tab groups: Error';
          return;
        }
        groupCountElement.textContent = `Tab groups: ${groups.length}`;
      });

      getArchivedTabs(function(archivedTabs) {
        archivedCountElement.textContent = `Archived tabs: ${archivedTabs.length}`;
      });
    });
  }

  function formatTime(minutes) {
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins === 0 ? `${hours}h` : `${hours}h ${mins}m`;
  }

  function getArchivedTabs(callback) {
    chrome.storage.local.get(['archivedTabs'], function(result) {
      if (chrome.runtime.lastError) {
        callback([]);
        return;
      }
      callback(result.archivedTabs || []);
    });
  }

  function archiveTab(tab) {
    const archivedTab = {
      id: Date.now() + Math.random(),
      title: tab.title,
      url: tab.url,
      favIconUrl: tab.favIconUrl,
      archivedAt: Date.now(),
      groupId: tab.groupId
    };

    getArchivedTabs(function(archivedTabs) {
      archivedTabs.push(archivedTab);
      chrome.storage.local.set({ archivedTabs: archivedTabs }, function() {
        if (chrome.runtime.lastError) {
          return;
        }
      });
    });
  }

  function archiveInactiveTabs() {
    const inactiveMinutes = parseInt(inactiveTimeSelect.value);
    getInactiveTabs(inactiveMinutes, function(inactiveTabs) {
      if (inactiveTabs.length === 0) {
        alert('No inactive tabs found.');
        return;
      }

      const timeStr = formatTime(inactiveMinutes);
      if (confirm(`Archive ${inactiveTabs.length} tabs inactive for more than ${timeStr}? You can restore them later.`)) {
        inactiveTabs.forEach(tab => archiveTab(tab));
        
        const tabIds = inactiveTabs.map(tab => tab.id);
        chrome.tabs.remove(tabIds, function() {
          if (!chrome.runtime.lastError) {
            updateTabCounts();
            alert(`Successfully archived ${inactiveTabs.length} tabs.`);
          }
        });
      }
    });
  }

  function restoreTab(archivedTab, callback) {
    chrome.tabs.create({
      url: archivedTab.url,
      active: false
    }, function(newTab) {
      if (chrome.runtime.lastError) {
        callback(false);
        return;
      }
      callback(true);
    });
  }

  function showArchivedTabs() {
    getArchivedTabs(function(archivedTabs) {
      if (archivedTabs.length === 0) {
        alert('No archived tabs found.');
        return;
      }

      const tabList = archivedTabs
        .slice(0, 10)
        .map(tab => {
          const archivedDate = new Date(tab.archivedAt).toLocaleDateString();
          return `• ${tab.title || tab.url} (${archivedDate})`;
        })
        .join('\n');
      
      const moreText = archivedTabs.length > 10 ? `\n... and ${archivedTabs.length - 10} more` : '';
      const result = confirm(`${archivedTabs.length} archived tabs:\n\n${tabList}${moreText}\n\nClick OK to see restore options, Cancel to close.`);
      
      if (result) {
        showRestoreOptions(archivedTabs);
      }
    });
  }

  function showRestoreOptions(archivedTabs) {
    const options = [
      'Restore all tabs',
      'Restore specific tabs (will show list)',
      'Delete all archived tabs permanently'
    ];
    
    const choice = prompt(`Choose an option:\n1. ${options[0]}\n2. ${options[1]}\n3. ${options[2]}\n\nEnter 1, 2, or 3:`);
    
    if (choice === '1') {
      restoreAllArchivedTabs();
    } else if (choice === '2') {
      showSelectiveRestore(archivedTabs);
    } else if (choice === '3') {
      if (confirm('Permanently delete all archived tabs? This cannot be undone.')) {
        chrome.storage.local.set({ archivedTabs: [] }, function() {
          updateTabCounts();
          alert('All archived tabs have been permanently deleted.');
        });
      }
    }
  }

  function showSelectiveRestore(archivedTabs) {
    const tabListWithNumbers = archivedTabs
      .map((tab, index) => {
        const archivedDate = new Date(tab.archivedAt).toLocaleDateString();
        return `${index + 1}. ${tab.title || tab.url} (${archivedDate})`;
      })
      .join('\n');
    
    const indices = prompt(`Select tabs to restore by entering numbers separated by commas (e.g., 1,3,5):\n\n${tabListWithNumbers}`);
    
    if (indices) {
      const selectedIndices = indices.split(',').map(i => parseInt(i.trim()) - 1).filter(i => i >= 0 && i < archivedTabs.length);
      
      if (selectedIndices.length > 0) {
        let restoredCount = 0;
        const newArchivedTabs = [...archivedTabs];
        
        selectedIndices.forEach(index => {
          restoreTab(archivedTabs[index], function(success) {
            if (success) {
              restoredCount++;
            }
            
            if (restoredCount + (selectedIndices.length - restoredCount) === selectedIndices.length) {
              selectedIndices.sort((a, b) => b - a).forEach(index => {
                newArchivedTabs.splice(index, 1);
              });
              
              chrome.storage.local.set({ archivedTabs: newArchivedTabs }, function() {
                updateTabCounts();
                alert(`Restored ${restoredCount} tabs.`);
              });
            }
          });
        });
      }
    }
  }

  function restoreAllArchivedTabs() {
    getArchivedTabs(function(archivedTabs) {
      if (archivedTabs.length === 0) {
        alert('No archived tabs to restore.');
        return;
      }

      if (confirm(`Restore all ${archivedTabs.length} archived tabs?`)) {
        let restoredCount = 0;
        archivedTabs.forEach(archivedTab => {
          restoreTab(archivedTab, function(success) {
            if (success) {
              restoredCount++;
            }
            
            if (restoredCount + (archivedTabs.length - restoredCount) === archivedTabs.length) {
              chrome.storage.local.set({ archivedTabs: [] }, function() {
                updateTabCounts();
                alert(`Restored ${restoredCount} tabs. All archived tabs have been cleared.`);
              });
            }
          });
        });
      }
    });
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
    chrome.tabs.query({}, function(tabs) {
      if (chrome.runtime.lastError) {
        alert('Error accessing tabs.');
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

      Object.entries(domainGroups).forEach(([domain, domainTabs]) => {
        if (domainTabs.length < 2) return;

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
          });
        });
        
        colorIndex++;
      });

      setTimeout(() => {
        if (groupsCreated > 0) {
          alert(`Created ${groupsCreated} tab groups by domain.`);
          updateTabCounts();
        } else {
          alert('No groups created. Need at least 2 tabs per domain to create groups.');
        }
      }, 500);
    });
  }

  function ungroupAllTabs() {
    chrome.tabGroups.query({}, function(groups) {
      if (chrome.runtime.lastError) {
        alert('Error accessing tab groups.');
        return;
      }

      if (groups.length === 0) {
        alert('No tab groups found.');
        return;
      }

      if (confirm(`Ungroup all ${groups.length} tab groups?`)) {
        groups.forEach(group => {
          chrome.tabs.ungroup(group.id, function() {
            // Ignore errors - some groups might already be removed
          });
        });
        
        setTimeout(() => {
          alert('All tab groups have been ungrouped.');
          updateTabCounts();
        }, 300);
      }
    });
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

  groupTabsByDomainBtn.addEventListener('click', groupTabsByDomain);
  ungroupAllTabsBtn.addEventListener('click', ungroupAllTabs);

  archiveInactiveTabsBtn.addEventListener('click', archiveInactiveTabs);
  viewArchivedTabsBtn.addEventListener('click', showArchivedTabs);
  restoreAllArchivedBtn.addEventListener('click', restoreAllArchivedTabs);

  loadSettings();
  updateTabCounts();
  setInterval(updateTabCounts, 5000);
});