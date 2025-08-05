document.addEventListener('DOMContentLoaded', function() {
  const closeAllTabsBtn = document.getElementById('closeAllTabs');
  const closeDuplicatesBtn = document.getElementById('closeDuplicates');
  const closeInactiveTabsBtn = document.getElementById('closeInactiveTabs');
  const previewInactiveTabsBtn = document.getElementById('previewInactiveTabs');
  const groupTabsByDomainBtn = document.getElementById('groupTabsByDomain');
  const ungroupAllTabsBtn = document.getElementById('ungroupAllTabs');
  const saveSessionBtn = document.getElementById('saveSession');
  const manageBookmarksBtn = document.getElementById('manageBookmarks');
  const inactiveTimeSelect = document.getElementById('inactiveTime');
  const autoCleanupCheckbox = document.getElementById('autoCleanup');
  const tabCountElement = document.getElementById('tabCount');
  const inactiveCountElement = document.getElementById('inactiveCount');
  const groupCountElement = document.getElementById('groupCount');
  const sessionCountElement = document.getElementById('sessionCount');
  
  // Bookmark modal elements
  const bookmarkModal = document.getElementById('bookmarkModal');
  const closeModal = document.querySelector('.close');
  const bookmarkSearch = document.getElementById('bookmarkSearch');
  const restoreAllSessionsBtn = document.getElementById('restoreAllSessions');
  const cleanupBookmarksBtn = document.getElementById('cleanupBookmarks');
  const exportBookmarksBtn = document.getElementById('exportBookmarks');
  const bookmarkList = document.getElementById('bookmarkList');

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
        sessionCountElement.textContent = 'Saved sessions: Error';
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

      updateSessionCount();
    });
  }

  function updateSessionCount() {
    chrome.bookmarks.getSubTree('1', function(bookmarkTree) {
      if (chrome.runtime.lastError) {
        sessionCountElement.textContent = 'Saved sessions: Error';
        return;
      }
      
      const tabCleanerFolder = findTabCleanerFolder(bookmarkTree[0]);
      if (tabCleanerFolder) {
        const sessionCount = tabCleanerFolder.children ? tabCleanerFolder.children.length : 0;
        sessionCountElement.textContent = `Saved sessions: ${sessionCount}`;
      } else {
        sessionCountElement.textContent = 'Saved sessions: 0';
      }
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

  // Bookmark functionality
  function findTabCleanerFolder(bookmarksBar) {
    if (!bookmarksBar || !bookmarksBar.children) return null;
    return bookmarksBar.children.find(folder => folder.title === 'Tab Cleaner Sessions');
  }

  function createTabCleanerFolder(callback) {
    chrome.bookmarks.create({
      parentId: '1',
      title: 'Tab Cleaner Sessions'
    }, callback);
  }

  function saveCurrentSession() {
    chrome.tabs.query({}, function(tabs) {
      if (chrome.runtime.lastError || tabs.length === 0) {
        alert('Error: Could not access tabs or no tabs found.');
        return;
      }

      const sessionName = prompt('Enter session name:', `Session ${new Date().toLocaleDateString()}`);
      if (!sessionName) return;

      chrome.bookmarks.getSubTree('1', function(bookmarkTree) {
        if (chrome.runtime.lastError) {
          alert('Error accessing bookmarks.');
          return;
        }

        let tabCleanerFolder = findTabCleanerFolder(bookmarkTree[0]);
        
        function createSession(folderId) {
          chrome.bookmarks.create({
            parentId: folderId,
            title: sessionName
          }, function(sessionFolder) {
            if (chrome.runtime.lastError) {
              alert('Error creating session folder.');
              return;
            }

            let createdCount = 0;
            const totalTabs = tabs.length;

            tabs.forEach(tab => {
              if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
                createdCount++;
                if (createdCount === totalTabs) {
                  alert(`Session "${sessionName}" saved with ${totalTabs} tabs.`);
                  updateSessionCount();
                }
                return;
              }

              chrome.bookmarks.create({
                parentId: sessionFolder.id,
                title: tab.title || tab.url,
                url: tab.url
              }, function() {
                createdCount++;
                if (createdCount === totalTabs) {
                  alert(`Session "${sessionName}" saved with ${totalTabs} tabs.`);
                  updateSessionCount();
                }
              });
            });
          });
        }

        if (tabCleanerFolder) {
          createSession(tabCleanerFolder.id);
        } else {
          createTabCleanerFolder(function(folder) {
            if (chrome.runtime.lastError) {
              alert('Error creating Tab Cleaner folder.');
              return;
            }
            createSession(folder.id);
          });
        }
      });
    });
  }

  function loadBookmarkSessions() {
    chrome.bookmarks.getSubTree('1', function(bookmarkTree) {
      if (chrome.runtime.lastError) {
        bookmarkList.innerHTML = '<div class="loading">Error loading bookmarks.</div>';
        return;
      }

      const tabCleanerFolder = findTabCleanerFolder(bookmarkTree[0]);
      if (!tabCleanerFolder || !tabCleanerFolder.children || tabCleanerFolder.children.length === 0) {
        bookmarkList.innerHTML = '<div class="loading">No saved sessions found.</div>';
        return;
      }

      const sessions = tabCleanerFolder.children;
      let html = '';

      sessions.forEach(session => {
        const tabCount = session.children ? session.children.length : 0;
        const sessionDate = new Date(session.dateAdded).toLocaleDateString();
        
        html += `
          <div class="bookmark-session" data-session-id="${session.id}">
            <div class="session-header" onclick="toggleSession('${session.id}')">
              <div>
                <div class="session-title">${session.title}</div>
                <div class="session-meta">${tabCount} tabs • ${sessionDate}</div>
              </div>
              <div class="session-actions" onclick="event.stopPropagation()">
                <button class="btn secondary" onclick="restoreSession('${session.id}')">🔄 Restore</button>
                <button class="btn danger" onclick="deleteSession('${session.id}')">🗑️ Delete</button>
              </div>
            </div>
            <div class="session-tabs" id="tabs-${session.id}">
        `;

        if (session.children) {
          session.children.forEach(bookmark => {
            if (bookmark.url) {
              const favicon = `https://www.google.com/s2/favicons?domain=${new URL(bookmark.url).hostname}&sz=16`;
              html += `
                <div class="tab-item">
                  <img class="tab-favicon" src="${favicon}" onerror="this.style.display='none'" />
                  <div class="tab-info">
                    <div class="tab-title">${bookmark.title}</div>
                    <div class="tab-url">${bookmark.url}</div>
                  </div>
                </div>
              `;
            }
          });
        }

        html += `</div></div>`;
      });

      bookmarkList.innerHTML = html;
    });
  }

  function restoreSession(sessionId) {
    if (!confirm('Restore this session? This will open all tabs from this session.')) return;

    chrome.bookmarks.getSubTree(sessionId, function(sessionTree) {
      if (chrome.runtime.lastError || !sessionTree[0].children) {
        alert('Error loading session.');
        return;
      }

      const bookmarks = sessionTree[0].children.filter(bookmark => bookmark.url);
      if (bookmarks.length === 0) {
        alert('No valid URLs found in this session.');
        return;
      }

      bookmarks.forEach(bookmark => {
        chrome.tabs.create({ url: bookmark.url, active: false });
      });

      alert(`Restored ${bookmarks.length} tabs from session.`);
    });
  }

  function deleteSession(sessionId) {
    chrome.bookmarks.getSubTree(sessionId, function(sessionTree) {
      if (chrome.runtime.lastError) return;
      
      const sessionName = sessionTree[0].title;
      if (!confirm(`Delete session "${sessionName}"? This action cannot be undone.`)) return;

      chrome.bookmarks.removeTree(sessionId, function() {
        if (chrome.runtime.lastError) {
          alert('Error deleting session.');
          return;
        }
        
        loadBookmarkSessions();
        updateSessionCount();
        alert(`Session "${sessionName}" deleted.`);
      });
    });
  }

  function toggleSession(sessionId) {
    const tabsElement = document.getElementById(`tabs-${sessionId}`);
    if (tabsElement) {
      tabsElement.classList.toggle('expanded');
    }
  }

  function restoreAllSessions() {
    if (!confirm('Restore all saved sessions? This will open all tabs from all sessions.')) return;

    chrome.bookmarks.getSubTree('1', function(bookmarkTree) {
      if (chrome.runtime.lastError) {
        alert('Error accessing bookmarks.');
        return;
      }

      const tabCleanerFolder = findTabCleanerFolder(bookmarkTree[0]);
      if (!tabCleanerFolder || !tabCleanerFolder.children || tabCleanerFolder.children.length === 0) {
        alert('No saved sessions found.');
        return;
      }

      let totalTabs = 0;
      tabCleanerFolder.children.forEach(session => {
        if (session.children) {
          session.children.forEach(bookmark => {
            if (bookmark.url) {
              chrome.tabs.create({ url: bookmark.url, active: false });
              totalTabs++;
            }
          });
        }
      });

      alert(`Restored ${totalTabs} tabs from ${tabCleanerFolder.children.length} sessions.`);
    });
  }

  function cleanupDeadBookmarks() {
    if (!confirm('Remove dead/broken bookmarks? This will check all bookmark links.')) return;

    chrome.bookmarks.getSubTree('1', function(bookmarkTree) {
      if (chrome.runtime.lastError) {
        alert('Error accessing bookmarks.');
        return;
      }

      const tabCleanerFolder = findTabCleanerFolder(bookmarkTree[0]);
      if (!tabCleanerFolder || !tabCleanerFolder.children) {
        alert('No saved sessions found.');
        return;
      }

      let checkedCount = 0;
      let removedCount = 0;
      let totalBookmarks = 0;

      tabCleanerFolder.children.forEach(session => {
        if (session.children) {
          totalBookmarks += session.children.length;
        }
      });

      if (totalBookmarks === 0) {
        alert('No bookmarks to check.');
        return;
      }

      tabCleanerFolder.children.forEach(session => {
        if (session.children) {
          session.children.forEach(bookmark => {
            if (bookmark.url) {
              fetch(bookmark.url, { method: 'HEAD', mode: 'no-cors' })
                .catch(() => {
                  chrome.bookmarks.remove(bookmark.id);
                  removedCount++;
                })
                .finally(() => {
                  checkedCount++;
                  if (checkedCount === totalBookmarks) {
                    alert(`Cleanup complete. Removed ${removedCount} dead bookmarks.`);
                    loadBookmarkSessions();
                    updateSessionCount();
                  }
                });
            } else {
              checkedCount++;
              if (checkedCount === totalBookmarks) {
                alert(`Cleanup complete. Removed ${removedCount} dead bookmarks.`);
                loadBookmarkSessions();
                updateSessionCount();
              }
            }
          });
        }
      });
    });
  }

  function exportBookmarkSessions() {
    chrome.bookmarks.getSubTree('1', function(bookmarkTree) {
      if (chrome.runtime.lastError) {
        alert('Error accessing bookmarks.');
        return;
      }

      const tabCleanerFolder = findTabCleanerFolder(bookmarkTree[0]);
      if (!tabCleanerFolder || !tabCleanerFolder.children || tabCleanerFolder.children.length === 0) {
        alert('No saved sessions found.');
        return;
      }

      const exportData = {
        exportDate: new Date().toISOString(),
        sessions: tabCleanerFolder.children.map(session => ({
          title: session.title,
          dateAdded: session.dateAdded,
          tabs: session.children ? session.children.map(bookmark => ({
            title: bookmark.title,
            url: bookmark.url
          })).filter(tab => tab.url) : []
        }))
      };

      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tab-cleaner-sessions-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      alert('Sessions exported successfully!');
    });
  }

  function filterBookmarks(searchTerm) {
    const sessions = document.querySelectorAll('.bookmark-session');
    const term = searchTerm.toLowerCase();

    sessions.forEach(session => {
      const sessionTitle = session.querySelector('.session-title').textContent.toLowerCase();
      const tabTitles = Array.from(session.querySelectorAll('.tab-title')).map(el => el.textContent.toLowerCase());
      const tabUrls = Array.from(session.querySelectorAll('.tab-url')).map(el => el.textContent.toLowerCase());

      const matches = sessionTitle.includes(term) || 
                     tabTitles.some(title => title.includes(term)) ||
                     tabUrls.some(url => url.includes(term));

      session.style.display = matches ? 'block' : 'none';
    });
  }

  // Global functions for onclick handlers
  window.toggleSession = toggleSession;
  window.restoreSession = restoreSession;
  window.deleteSession = deleteSession;

  // Event listeners for bookmark functionality
  saveSessionBtn.addEventListener('click', saveCurrentSession);
  
  manageBookmarksBtn.addEventListener('click', function() {
    bookmarkModal.style.display = 'block';
    loadBookmarkSessions();
  });

  closeModal.addEventListener('click', function() {
    bookmarkModal.style.display = 'none';
  });

  window.addEventListener('click', function(event) {
    if (event.target === bookmarkModal) {
      bookmarkModal.style.display = 'none';
    }
  });

  bookmarkSearch.addEventListener('input', function() {
    filterBookmarks(this.value);
  });

  restoreAllSessionsBtn.addEventListener('click', restoreAllSessions);
  cleanupBookmarksBtn.addEventListener('click', cleanupDeadBookmarks);
  exportBookmarksBtn.addEventListener('click', exportBookmarkSessions);

  loadSettings();
  updateTabCounts();
  setInterval(updateTabCounts, 5000);
});