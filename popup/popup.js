document.addEventListener('DOMContentLoaded', function() {
  const closeAllTabsBtn = document.getElementById('closeAllTabs');
  const closeDuplicatesBtn = document.getElementById('closeDuplicates');
  const closeInactiveTabsBtn = document.getElementById('closeInactiveTabs');
  const previewInactiveTabsBtn = document.getElementById('previewInactiveTabs');
  const inactiveTimeSelect = document.getElementById('inactiveTime');
  const autoCleanupCheckbox = document.getElementById('autoCleanup');
  const tabCountElement = document.getElementById('tabCount');
  const inactiveCountElement = document.getElementById('inactiveCount');
  const saveSessionBtn = document.getElementById('saveSession');
  const sessionNameInput = document.getElementById('sessionName');
  const savedSessionsContainer = document.getElementById('savedSessions');
  const recentlyClosedContainer = document.getElementById('recentlyClosed');
  const clearHistoryBtn = document.getElementById('clearHistory');
  const suggestionsContainer = document.getElementById('suggestionsList');

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

  // Session Management Functions
  function saveCurrentSession() {
    const sessionName = sessionNameInput.value.trim();
    if (!sessionName) {
      alert('Please enter a session name.');
      return;
    }

    chrome.tabs.query({}, function(tabs) {
      if (chrome.runtime.lastError) {
        alert('Error accessing tabs.');
        return;
      }

      const sessionData = {
        name: sessionName,
        timestamp: Date.now(),
        tabCount: tabs.length,
        tabs: tabs.map(tab => ({
          url: tab.url,
          title: tab.title,
          pinned: tab.pinned,
          active: tab.active
        }))
      };

      chrome.storage.local.get(['savedSessions'], function(result) {
        const savedSessions = result.savedSessions || [];
        
        // Check if session name already exists
        const existingIndex = savedSessions.findIndex(session => session.name === sessionName);
        if (existingIndex !== -1) {
          if (!confirm(`Session "${sessionName}" already exists. Overwrite it?`)) {
            return;
          }
          savedSessions[existingIndex] = sessionData;
        } else {
          savedSessions.push(sessionData);
        }

        chrome.storage.local.set({ savedSessions }, function() {
          if (!chrome.runtime.lastError) {
            sessionNameInput.value = '';
            loadSavedSessions();
            updateStatistics('sessionsCreated', 1);
            alert(`Session "${sessionName}" saved successfully!`);
          }
        });
      });
    });
  }

  function loadSavedSessions() {
    chrome.storage.local.get(['savedSessions'], function(result) {
      const savedSessions = result.savedSessions || [];
      displaySavedSessions(savedSessions);
    });
  }

  function displaySavedSessions(sessions) {
    savedSessionsContainer.innerHTML = '';

    if (sessions.length === 0) {
      savedSessionsContainer.innerHTML = '<p style="color: var(--text-muted); font-size: 13px; text-align: center; padding: 20px;">No saved sessions</p>';
      return;
    }

    sessions.forEach((session, index) => {
      const sessionItem = document.createElement('div');
      sessionItem.className = 'session-item';
      
      const date = new Date(session.timestamp);
      const dateStr = date.toLocaleDateString();
      const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      sessionItem.innerHTML = `
        <div class="session-info">
          <div class="session-name">${escapeHtml(session.name)}</div>
          <div class="session-meta">
            <span>📅 ${dateStr}</span>
            <span>⏰ ${timeStr}</span>
            <span>📄 ${session.tabCount} tabs</span>
          </div>
        </div>
        <div class="session-actions">
          <button onclick="restoreSession(${index})" title="Restore Session">🔄</button>
          <button onclick="deleteSession(${index})" class="danger" title="Delete Session">🗑️</button>
        </div>
      `;

      savedSessionsContainer.appendChild(sessionItem);
    });
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Make functions global for onclick handlers
  window.restoreSession = function(index) {
    chrome.storage.local.get(['savedSessions'], function(result) {
      const savedSessions = result.savedSessions || [];
      const session = savedSessions[index];
      
      if (!session) {
        alert('Session not found.');
        return;
      }

      if (confirm(`Restore session "${session.name}" with ${session.tabCount} tabs? This will open all tabs from the session.`)) {
        session.tabs.forEach((tabData, tabIndex) => {
          if (tabData.url && tabData.url !== 'chrome://newtab/') {
            chrome.tabs.create({
              url: tabData.url,
              active: tabIndex === 0, // Make first tab active
              pinned: tabData.pinned
            });
          }
        });
        
        alert(`Session "${session.name}" restored successfully!`);
        window.close();
      }
    });
  };

  window.deleteSession = function(index) {
    chrome.storage.local.get(['savedSessions'], function(result) {
      const savedSessions = result.savedSessions || [];
      const session = savedSessions[index];
      
      if (!session) {
        alert('Session not found.');
        return;
      }

      if (confirm(`Delete session "${session.name}"? This action cannot be undone.`)) {
        savedSessions.splice(index, 1);
        chrome.storage.local.set({ savedSessions }, function() {
          if (!chrome.runtime.lastError) {
            loadSavedSessions();
          }
        });
      }
    });
  };

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
            addToClosedTabsHistory(inactiveTabs);
            updateStatistics('tabsClosed', inactiveTabs.length);
            updateStatistics('memoryFreed', inactiveTabs.length * 50); // Estimate 50MB per tab
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
        const tabsToClose = tabs.filter(tab => tab.id !== currentTab.id);
        const tabIds = tabsToClose.map(tab => tab.id);
        chrome.tabs.remove(tabIds, function() {
          if (!chrome.runtime.lastError) {
            addToClosedTabsHistory(tabsToClose);
            updateStatistics('tabsClosed', tabsToClose.length);
            updateStatistics('memoryFreed', tabsToClose.length * 50);
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
          // Get the duplicate tabs info before removing them
          const duplicateTabs = tabs.filter(tab => duplicateIds.includes(tab.id));
          chrome.tabs.remove(duplicateIds, function() {
            if (!chrome.runtime.lastError) {
              addToClosedTabsHistory(duplicateTabs);
              updateStatistics('tabsClosed', duplicateTabs.length);
              updateStatistics('memoryFreed', duplicateTabs.length * 50);
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

  saveSessionBtn.addEventListener('click', saveCurrentSession);

  sessionNameInput.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
      saveCurrentSession();
    }
  });

  clearHistoryBtn.addEventListener('click', clearClosedTabsHistory);

  loadSettings();
  updateTabCounts();
  loadSavedSessions();
  loadRecentlyClosed();
  loadStatistics();
  loadSmartSuggestions();
  setInterval(updateTabCounts, 5000);

  // Recovery System Functions
  function addToClosedTabsHistory(tabs) {
    const tabsToSave = tabs.map(tab => ({
      url: tab.url,
      title: tab.title,
      timestamp: Date.now(),
      id: generateId()
    }));

    chrome.storage.local.get(['closedTabsHistory'], function(result) {
      const history = result.closedTabsHistory || [];
      
      // Add new tabs to beginning and limit to 20 recent items
      const newHistory = [...tabsToSave, ...history].slice(0, 20);
      
      chrome.storage.local.set({ closedTabsHistory: newHistory }, function() {
        if (!chrome.runtime.lastError) {
          loadRecentlyClosed();
        }
      });
    });
  }

  function loadRecentlyClosed() {
    chrome.storage.local.get(['closedTabsHistory'], function(result) {
      const history = result.closedTabsHistory || [];
      displayRecentlyClosed(history);
    });
  }

  function displayRecentlyClosed(history) {
    recentlyClosedContainer.innerHTML = '';

    if (history.length === 0) {
      recentlyClosedContainer.innerHTML = '<p style="color: var(--text-muted); font-size: 13px; text-align: center; padding: 20px;">No recently closed tabs</p>';
      return;
    }

    history.slice(0, 5).forEach((tab) => {
      const tabItem = document.createElement('div');
      tabItem.className = 'closed-tab-item';
      
      const timeAgo = getTimeAgo(tab.timestamp);

      tabItem.innerHTML = `
        <div class="closed-tab-info">
          <div class="closed-tab-title">${escapeHtml(tab.title || 'Untitled')}</div>
          <div class="closed-tab-url">${escapeHtml(tab.url)} • ${timeAgo}</div>
        </div>
        <button class="closed-tab-restore" onclick="restoreClosedTab('${tab.id}')">📤</button>
      `;

      recentlyClosedContainer.appendChild(tabItem);
    });
  }

  function getTimeAgo(timestamp) {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return 'Just now';
  }

  function generateId() {
    return Math.random().toString(36).substr(2, 9);
  }

  window.restoreClosedTab = function(tabId) {
    chrome.storage.local.get(['closedTabsHistory'], function(result) {
      const history = result.closedTabsHistory || [];
      const tab = history.find(t => t.id === tabId);
      
      if (!tab) {
        alert('Tab not found in history.');
        return;
      }

      chrome.tabs.create({ url: tab.url, active: true }, function() {
        if (!chrome.runtime.lastError) {
          // Remove from history after restoring
          const newHistory = history.filter(t => t.id !== tabId);
          chrome.storage.local.set({ closedTabsHistory: newHistory }, function() {
            updateStatistics('tabsRestored', 1);
            loadRecentlyClosed();
          });
        }
      });
    });
  };

  function clearClosedTabsHistory() {
    if (confirm('Clear all recently closed tabs history? This action cannot be undone.')) {
      chrome.storage.local.set({ closedTabsHistory: [] }, function() {
        if (!chrome.runtime.lastError) {
          loadRecentlyClosed();
        }
      });
    }
  }

  // Statistics Functions
  function loadStatistics() {
    chrome.storage.local.get(['statistics'], function(result) {
      const stats = result.statistics || {
        totalTabsClosed: 0,
        memoryFreed: 0,
        sessionsCreated: 0,
        tabsRestored: 0
      };

      document.getElementById('totalTabsClosed').textContent = stats.totalTabsClosed;
      document.getElementById('memoryFreed').textContent = `${stats.memoryFreed}MB`;
      document.getElementById('sessionsCreated').textContent = stats.sessionsCreated;
      document.getElementById('tabsRestored').textContent = stats.tabsRestored;
    });
  }

  function updateStatistics(key, increment) {
    chrome.storage.local.get(['statistics'], function(result) {
      const stats = result.statistics || {
        totalTabsClosed: 0,
        memoryFreed: 0,
        sessionsCreated: 0,
        tabsRestored: 0
      };

      switch(key) {
        case 'tabsClosed':
          stats.totalTabsClosed += increment;
          break;
        case 'memoryFreed':
          stats.memoryFreed += increment;
          break;
        case 'sessionsCreated':
          stats.sessionsCreated += increment;
          break;
        case 'tabsRestored':
          stats.tabsRestored += increment;
          break;
      }

      chrome.storage.local.set({ statistics: stats }, function() {
        if (!chrome.runtime.lastError) {
          loadStatistics();
        }
      });
    });
  }

  // Smart Suggestions Functions
  function loadSmartSuggestions() {
    chrome.tabs.query({}, function(tabs) {
      if (chrome.runtime.lastError || !tabs.length) {
        suggestionsContainer.innerHTML = '<p style="color: var(--text-muted); font-size: 13px; text-align: center; padding: 20px;">No suggestions available</p>';
        return;
      }

      const suggestions = generateSmartSuggestions(tabs);
      displaySmartSuggestions(suggestions);
    });
  }

  function generateSmartSuggestions(tabs) {
    const suggestions = [];
    const now = Date.now();
    const inactiveTime = parseInt(inactiveTimeSelect.value) * 60 * 1000;

    // Find duplicate domains
    const domainCount = {};
    tabs.forEach(tab => {
      try {
        const domain = new URL(tab.url).hostname;
        domainCount[domain] = (domainCount[domain] || 0) + 1;
      } catch (e) {
        // Invalid URL, skip
      }
    });

    // Suggest closing duplicate domains
    for (const [domain, count] of Object.entries(domainCount)) {
      if (count > 3) {
        suggestions.push({
          type: 'close_domain_duplicates',
          title: `Close ${count - 1} duplicate ${domain} tabs`,
          reason: `You have ${count} tabs open from ${domain}`,
          domain: domain,
          count: count
        });
      }
    }

    // Suggest tabs that haven't been accessed recently
    const veryOldTabs = tabs.filter(tab => 
      !tab.active && 
      !tab.pinned && 
      tab.lastAccessed && 
      (now - tab.lastAccessed) > (inactiveTime * 2)
    );

    if (veryOldTabs.length > 0) {
      suggestions.push({
        type: 'close_very_old',
        title: `Close ${veryOldTabs.length} very old tabs`,
        reason: `These tabs haven't been used in over ${formatTime(parseInt(inactiveTimeSelect.value) * 2)}`,
        tabs: veryOldTabs
      });
    }

    // Suggest session save if many tabs are open
    if (tabs.length > 10) {
      suggestions.push({
        type: 'save_session',
        title: 'Save current session',
        reason: `You have ${tabs.length} tabs open - consider saving as a session`,
        tabCount: tabs.length
      });
    }

    return suggestions.slice(0, 3); // Limit to 3 suggestions
  }

  function displaySmartSuggestions(suggestions) {
    suggestionsContainer.innerHTML = '';

    if (suggestions.length === 0) {
      suggestionsContainer.innerHTML = '<p style="color: var(--text-muted); font-size: 13px; text-align: center; padding: 20px;">No suggestions at this time</p>';
      return;
    }

    suggestions.forEach((suggestion, index) => {
      const suggestionItem = document.createElement('div');
      suggestionItem.className = 'suggestion-item';
      
      suggestionItem.innerHTML = `
        <div class="suggestion-info">
          <div class="suggestion-title">${escapeHtml(suggestion.title)}</div>
          <div class="suggestion-reason">${escapeHtml(suggestion.reason)}</div>
        </div>
        <button class="suggestion-action" onclick="applySuggestion(${index})">Apply</button>
      `;

      suggestionsContainer.appendChild(suggestionItem);
    });

    // Store suggestions for the apply function
    window.currentSuggestions = suggestions;
  }

  window.applySuggestion = function(index) {
    const suggestion = window.currentSuggestions[index];
    if (!suggestion) return;

    switch (suggestion.type) {
      case 'close_domain_duplicates':
        closeDomainDuplicates(suggestion.domain);
        break;
      case 'close_very_old':
        closeTabsSuggestion(suggestion.tabs, 'very old');
        break;
      case 'save_session':
        sessionNameInput.value = `Session ${new Date().toLocaleDateString()}`;
        sessionNameInput.focus();
        break;
    }
  };

  function closeDomainDuplicates(domain) {
    chrome.tabs.query({}, function(tabs) {
      const domainTabs = tabs.filter(tab => {
        try {
          return new URL(tab.url).hostname === domain && !tab.active && !tab.pinned;
        } catch (e) {
          return false;
        }
      });

      if (domainTabs.length > 0 && confirm(`Close ${domainTabs.length} duplicate tabs from ${domain}?`)) {
        const tabIds = domainTabs.map(tab => tab.id);
        chrome.tabs.remove(tabIds, function() {
          if (!chrome.runtime.lastError) {
            addToClosedTabsHistory(domainTabs);
            updateStatistics('tabsClosed', domainTabs.length);
            updateTabCounts();
            loadSmartSuggestions();
          }
        });
      }
    });
  }

  function closeTabsSuggestion(tabsToClose, type) {
    if (confirm(`Close ${tabsToClose.length} ${type} tabs?`)) {
      const tabIds = tabsToClose.map(tab => tab.id);
      chrome.tabs.remove(tabIds, function() {
        if (!chrome.runtime.lastError) {
          addToClosedTabsHistory(tabsToClose);
          updateStatistics('tabsClosed', tabsToClose.length);
          updateTabCounts();
          loadSmartSuggestions();
        }
      });
    }
  }
});