// Migaku Word Exporter - Content Script
// Exports words directly via extension storage

(function() {
  'use strict';

  if (document.getElementById('migaku-export-btn')) return;

  function isAuthPage() {
    const p = window.location.pathname;
    return p === '/login' || p === '/register' || p.startsWith('/login') || p.startsWith('/register');
  }

  const btn = document.createElement('button');
  btn.id = 'migaku-export-btn';
  btn.innerHTML = `
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path>
    </svg>
    Export Words
  `;
  document.body.appendChild(btn);

  function updateVisibility() {
    btn.style.display = isAuthPage() ? 'none' : 'flex';
  }
  updateVisibility();

  // Watch SPA navigation (history.pushState / back/forward)
  const origPushState = history.pushState.bind(history);
  history.pushState = function(...args) {
    origPushState(...args);
    updateVisibility();
  };
  const origReplaceState = history.replaceState.bind(history);
  history.replaceState = function(...args) {
    origReplaceState(...args);
    updateVisibility();
  };
  window.addEventListener('popstate', updateVisibility);

  function showToast(message, isError = false) {
    const existing = document.getElementById('migaku-export-toast');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.id = 'migaku-export-toast';
    if (isError) toast.classList.add('error');
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
  }

  function setLoading(loading) {
    if (loading) {
      btn.classList.add('loading');
      btn.innerHTML = '<div class="spinner"></div> Exporting...';
    } else {
      btn.classList.remove('loading');
      btn.innerHTML = `
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path>
        </svg>
        Export Words
      `;
    }
  }

  async function exportWords() {
    setLoading(true);

    try {
      // Open IndexedDB
      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open('srs');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(new Error('Could not open database'));
      });

      const tx = db.transaction('data', 'readonly');
      const store = tx.objectStore('data');

      const allData = await new Promise((resolve, reject) => {
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(new Error('Could not read data'));
      });

      db.close();

      if (!allData || allData.length === 0) {
        throw new Error('No data found. Are you logged in?');
      }

      // Convert to array for storage
      const dataToStore = [];
      for (const item of allData) {
        if (item.data && item.data.byteLength > 0) {
          // Convert Uint8Array to regular array for JSON serialization
          dataToStore.push({
            path: item.path,
            data: Array.from(new Uint8Array(item.data))
          });
        }
      }

      if (dataToStore.length === 0) {
        throw new Error('No database files found');
      }

      // Store in chrome.storage.local and open converter
      chrome.storage.local.set({ migakuExportData: dataToStore }, () => {
        if (chrome.runtime.lastError) {
          showToast('Storage error: ' + chrome.runtime.lastError.message, true);
          return;
        }
        showToast('Opening converter...');
        window.open(chrome.runtime.getURL('converter.html'), '_blank');
      });

    } catch (err) {
      console.error('Migaku Export Error:', err);
      showToast(err.message || 'Export failed', true);
    } finally {
      setLoading(false);
    }
  }

  btn.addEventListener('click', exportWords);
  console.log('Migaku Word Exporter loaded');
})();
