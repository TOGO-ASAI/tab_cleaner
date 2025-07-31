document.addEventListener('DOMContentLoaded', function() {
  const closeAllTabsBtn = document.getElementById('closeAllTabs');
  const closeDuplicatesBtn = document.getElementById('closeDuplicates');
  const closeInactiveTabsBtn = document.getElementById('closeInactiveTabs');
  const previewInactiveTabsBtn = document.getElementById('previewInactiveTabs');
  const inactiveTimeSelect = document.getElementById('inactiveTime');
  const autoCleanupCheckbox = document.getElementById('autoCleanup');
  const tabCountElement = document.getElementById('tabCount');
  const inactiveCountElement = document.getElementById('inactiveCount');
  
  // Pin and favorite elements
  const showPinnedTabsBtn = document.getElementById('showPinnedTabs');
  const showFavoriteTabsBtn = document.getElementById('showFavoriteTabs');
  const manageFavoritesBtn = document.getElementById('manageFavorites');
  const pinnedTabsList = document.getElementById('pinnedTabsList');
  const favoriteTabsList = document.getElementById('favoriteTabsList');
  const pinnedCountElement = document.getElementById('pinnedCount');
  const favoriteCountElement = document.getElementById('favoriteCount');

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
        pinnedCountElement.textContent = 'Pinned tabs: Error';
        favoriteCountElement.textContent = 'Favorite tabs: Error';
        return;
      }
      
      tabCountElement.textContent = `Total tabs: ${tabs.length}`;
      
      const pinnedTabs = tabs.filter(tab => tab.pinned);
      pinnedCountElement.textContent = `Pinned tabs: ${pinnedTabs.length}`;
      
      const inactiveMinutes = parseInt(inactiveTimeSelect.value);
      getInactiveTabs(inactiveMinutes, function(inactiveTabs) {
        inactiveCountElement.textContent = `Inactive tabs: ${inactiveTabs.length}`;
      });
      
      getFavoriteTabs(function(favoriteTabs) {
        favoriteCountElement.textContent = `Favorite tabs: ${favoriteTabs.length}`;
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

  // Pin and favorite functions
  function getFavoriteTabs(callback) {
    chrome.storage.sync.get(['favoriteTabs'], function(result) {
      if (chrome.runtime.lastError) {
        callback([]);
        return;
      }
      callback(result.favoriteTabs || []);
    });
  }

  function saveFavoriteTabs(favoriteTabs, callback) {
    chrome.storage.sync.set({favoriteTabs: favoriteTabs}, function() {
      if (callback) callback();
    });
  }

  function addToFavorites(tab) {
    getFavoriteTabs(function(favoriteTabs) {
      const favoriteTab = {
        id: tab.id,
        url: tab.url,
        title: tab.title,
        favIconUrl: tab.favIconUrl,
        dateAdded: Date.now()
      };
      
      const exists = favoriteTabs.some(fav => fav.url === tab.url);
      if (!exists) {
        favoriteTabs.push(favoriteTab);
        saveFavoriteTabs(favoriteTabs, function() {
          updateTabCounts();
          if (!favoriteTabsList.classList.contains('hidden')) {
            displayFavoriteTabs();
          }
        });
      }
    });
  }

  function removeFromFavorites(url) {
    getFavoriteTabs(function(favoriteTabs) {
      const filteredFavorites = favoriteTabs.filter(fav => fav.url !== url);
      saveFavoriteTabs(filteredFavorites, function() {
        updateTabCounts();
        if (!favoriteTabsList.classList.contains('hidden')) {
          displayFavoriteTabs();
        }
      });
    });
  }

  function createTabItem(tab, isFavorite = false) {
    const tabItem = document.createElement('div');
    tabItem.className = 'tab-item';
    
    const favicon = document.createElement('img');
    favicon.className = 'tab-favicon';
    favicon.src = tab.favIconUrl || 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" fill="%23f0f0f0"/></svg>';
    favicon.onerror = function() {
      this.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" fill="%23f0f0f0"/></svg>';
    };
    
    const tabInfo = document.createElement('div');
    tabInfo.className = 'tab-info';
    
    const tabTitle = document.createElement('div');
    tabTitle.className = 'tab-title';
    tabTitle.textContent = tab.title || 'Untitled';
    
    const tabUrl = document.createElement('div');
    tabUrl.className = 'tab-url';
    tabUrl.textContent = tab.url;
    
    tabInfo.appendChild(tabTitle);
    tabInfo.appendChild(tabUrl);
    
    const tabActions = document.createElement('div');
    tabActions.className = 'tab-actions';
    
    if (!isFavorite && !tab.pinned) {
      const pinBtn = document.createElement('button');
      pinBtn.className = 'tab-action-btn';
      pinBtn.textContent = '📌';
      pinBtn.title = 'Pin tab';
      pinBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        chrome.tabs.update(tab.id, {pinned: true}, function() {
          if (!chrome.runtime.lastError) {
            updateTabCounts();
            if (!pinnedTabsList.classList.contains('hidden')) {
              displayPinnedTabs();
            }
          }
        });
      });
      tabActions.appendChild(pinBtn);
    }
    
    if (!isFavorite) {
      const favoriteBtn = document.createElement('button');
      favoriteBtn.className = 'tab-action-btn';
      favoriteBtn.textContent = '⭐';
      favoriteBtn.title = 'Add to favorites';
      favoriteBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        addToFavorites(tab);
      });
      tabActions.appendChild(favoriteBtn);
    } else {
      const removeBtn = document.createElement('button');
      removeBtn.className = 'tab-action-btn danger';
      removeBtn.textContent = '🗑️';
      removeBtn.title = 'Remove from favorites';
      removeBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        removeFromFavorites(tab.url);
      });
      tabActions.appendChild(removeBtn);
      
      const openBtn = document.createElement('button');
      openBtn.className = 'tab-action-btn';
      openBtn.textContent = '🔗';
      openBtn.title = 'Open tab';
      openBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        chrome.tabs.create({url: tab.url, active: true});
      });
      tabActions.appendChild(openBtn);
    }
    
    tabItem.appendChild(favicon);
    tabItem.appendChild(tabInfo);
    tabItem.appendChild(tabActions);
    
    if (!isFavorite) {
      tabItem.addEventListener('click', function() {
        chrome.tabs.update(tab.id, {active: true});
        window.close();
      });
    }
    
    return tabItem;
  }

  function displayPinnedTabs() {
    chrome.tabs.query({pinned: true}, function(tabs) {
      if (chrome.runtime.lastError) {
        pinnedTabsList.innerHTML = '<div style="padding: 16px; text-align: center; color: var(--text-muted);">Error loading pinned tabs</div>';
        return;
      }
      
      pinnedTabsList.innerHTML = '';
      
      if (tabs.length === 0) {
        pinnedTabsList.innerHTML = '<div style="padding: 16px; text-align: center; color: var(--text-muted);">No pinned tabs</div>';
        return;
      }
      
      tabs.forEach(tab => {
        const tabItem = createTabItem(tab, false);
        pinnedTabsList.appendChild(tabItem);
      });
    });
  }

  function displayFavoriteTabs() {
    getFavoriteTabs(function(favoriteTabs) {
      favoriteTabsList.innerHTML = '';
      
      if (favoriteTabs.length === 0) {
        favoriteTabsList.innerHTML = '<div style="padding: 16px; text-align: center; color: var(--text-muted);">No favorite tabs</div>';
        return;
      }
      
      favoriteTabs
        .sort((a, b) => b.dateAdded - a.dateAdded)
        .forEach(tab => {
          const tabItem = createTabItem(tab, true);
          favoriteTabsList.appendChild(tabItem);
        });
    });
  }

  function displayManageFavorites() {
    chrome.tabs.query({}, function(allTabs) {
      if (chrome.runtime.lastError) {
        alert('Error accessing tabs.');
        return;
      }
      
      getFavoriteTabs(function(favoriteTabs) {
        favoriteTabsList.innerHTML = '';
        
        const header = document.createElement('div');
        header.style.padding = '12px 16px';
        header.style.fontSize = '14px';
        header.style.fontWeight = '600';
        header.style.color = 'var(--text-primary)';
        header.style.borderBottom = '1px solid var(--border)';
        header.textContent = 'Click ⭐ to add tabs to favorites';
        favoriteTabsList.appendChild(header);
        
        allTabs.forEach(tab => {
          const isFavorite = favoriteTabs.some(fav => fav.url === tab.url);
          if (!isFavorite) {
            const tabItem = createTabItem(tab, false);
            favoriteTabsList.appendChild(tabItem);
          }
        });
        
        if (allTabs.every(tab => favoriteTabs.some(fav => fav.url === tab.url))) {
          const noMoreTabs = document.createElement('div');
          noMoreTabs.style.padding = '16px';
          noMoreTabs.style.textAlign = 'center';
          noMoreTabs.style.color = 'var(--text-muted)';
          noMoreTabs.textContent = 'All tabs are already in favorites';
          favoriteTabsList.appendChild(noMoreTabs);
        }
      });
    });
  }

  // Event listeners for pin and favorite buttons
  showPinnedTabsBtn.addEventListener('click', function() {
    const isVisible = !pinnedTabsList.classList.contains('hidden');
    
    pinnedTabsList.classList.toggle('hidden');
    favoriteTabsList.classList.add('hidden');
    
    if (!isVisible) {
      displayPinnedTabs();
    }
  });

  showFavoriteTabsBtn.addEventListener('click', function() {
    const isVisible = !favoriteTabsList.classList.contains('hidden');
    
    favoriteTabsList.classList.toggle('hidden');
    pinnedTabsList.classList.add('hidden');
    
    if (!isVisible) {
      displayFavoriteTabs();
    }
  });

  manageFavoritesBtn.addEventListener('click', function() {
    favoriteTabsList.classList.remove('hidden');
    pinnedTabsList.classList.add('hidden');
    displayManageFavorites();
  });

  loadSettings();
  updateTabCounts();
  setInterval(updateTabCounts, 5000);
});