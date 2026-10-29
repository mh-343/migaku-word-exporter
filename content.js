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
  btn.title = 'Drag to move';
  document.body.appendChild(btn);

  const POS_KEY = 'migakuExportBtnPos';
  const DRAG_THRESHOLD = 5;
  let savedPos = null;
  let dragState = null;
  let suppressClick = false;

  // Position is stored as distance from the right/top edge so the button stays
  // anchored to the right side when the window is resized.
  function applyPosition(pos) {
    const maxRight = Math.max(0, window.innerWidth - btn.offsetWidth);
    const maxTop = Math.max(0, window.innerHeight - btn.offsetHeight);
    btn.style.right = Math.min(Math.max(0, pos.right), maxRight) + 'px';
    btn.style.top = Math.min(Math.max(0, pos.top), maxTop) + 'px';
  }

  function currentPosition() {
    const cs = getComputedStyle(btn);
    return { right: parseFloat(cs.right), top: parseFloat(cs.top) };
  }

  function updateVisibility() {
    btn.style.display = isAuthPage() ? 'none' : 'flex';
    if (savedPos && !isAuthPage()) applyPosition(savedPos);
  }
  updateVisibility();

  chrome.storage.local.get([POS_KEY], (result) => {
    if (result && result[POS_KEY]) {
      savedPos = result[POS_KEY];
      if (!isAuthPage()) applyPosition(savedPos);
    }
  });

  window.addEventListener('resize', () => {
    if (savedPos && !isAuthPage()) applyPosition(savedPos);
  });

  btn.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    suppressClick = false;
    const pos = currentPosition();
    dragState = { id: e.pointerId, x: e.clientX, y: e.clientY, right: pos.right, top: pos.top, moved: false };
    btn.setPointerCapture(e.pointerId);
  });

  btn.addEventListener('pointermove', (e) => {
    if (!dragState || e.pointerId !== dragState.id) return;
    const dx = e.clientX - dragState.x;
    const dy = e.clientY - dragState.y;
    if (!dragState.moved) {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      dragState.moved = true;
      btn.classList.add('dragging');
    }
    applyPosition({ right: dragState.right - dx, top: dragState.top + dy });
  });

  function endDrag(e) {
    if (!dragState || e.pointerId !== dragState.id) return;
    if (dragState.moved) {
      btn.classList.remove('dragging');
      suppressClick = e.type === 'pointerup';
      savedPos = currentPosition();
      chrome.storage.local.set({ [POS_KEY]: savedPos });
    }
    dragState = null;
  }
  btn.addEventListener('pointerup', endDrag);
  btn.addEventListener('pointercancel', endDrag);

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

    // Show the toast next to the button, below it or above it if the button sits in the lower half
    const r = btn.getBoundingClientRect();
    if (r.width) {
      toast.style.right = Math.max(8, window.innerWidth - r.right) + 'px';
      if (r.top + r.height / 2 < window.innerHeight / 2) {
        toast.style.top = (r.bottom + 10) + 'px';
      } else {
        toast.style.top = 'auto';
        toast.style.bottom = (window.innerHeight - r.top + 10) + 'px';
      }
    }

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

      const dataToStore = [];
      for (const item of allData) {
        if (item.data && item.data.byteLength > 0) {
          dataToStore.push({
            path: item.path,
            data: Array.from(new Uint8Array(item.data))
          });
        }
      }

      if (dataToStore.length === 0) {
        throw new Error('No database files found');
      }

      chrome.storage.local.set({ migakuExportData: dataToStore }, () => {
        if (chrome.runtime.lastError) {
          showToast('Storage error: ' + chrome.runtime.lastError.message, true);
          return;
        }
        showToast('Opening converter...');
        window.open(chrome.runtime.getURL('converter.html'), '_blank');
      });

    } catch (err) {
      console.error(err);
      showToast(err.message || 'Export failed', true);
    } finally {
      setLoading(false);
    }
  }

  btn.addEventListener('click', () => {
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    exportWords();
  });
})();
