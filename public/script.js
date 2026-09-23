(function () {
  'use strict';

  const STORAGE_KEYS = {
    saved: 'briefdesk_saved',
    history: 'briefdesk_history'
  };

  let selectedFile = null;
  let activeSource = 'file'; // 'file' | 'text'
  let currentBrief = null;

  // ---------- STORAGE HELPERS ----------
  function loadJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  }
  function saveJSON(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); }
    catch (e) { console.warn('Could not save to localStorage', e); }
  }
  function getSaved() { return loadJSON(STORAGE_KEYS.saved, []); }
  function setSaved(list) { saveJSON(STORAGE_KEYS.saved, list); }
  function getHistory() { return loadJSON(STORAGE_KEYS.history, []); }
  function setHistory(list) { saveJSON(STORAGE_KEYS.history, list); }

  function briefId(brief) {
    return (brief.sourceName || '') + '::' + (brief.title || '') + '::' + (brief.date || '');
  }

  // ---------- DOM ----------
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const dropzone = $('#dropzone');
  const fileInput = $('#fileInput');
  const fileNameEl = $('#fileName');
  const textInput = $('#textInput');
  const summarizeBtn = $('#summarizeBtn');
  const formError = $('#formError');
  const loadingState = $('#loadingState');
  const emptyState = $('#emptyState');
  const resultCard = $('#resultCard');

  // ---------- TOP TABS ----------
  $$('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      $$('.tab-btn').forEach((b) => b.classList.remove('is-active'));
      $$('.tab-panel').forEach((p) => p.classList.remove('is-active'));
      btn.classList.add('is-active');
      $('#tab-' + btn.dataset.tab).classList.add('is-active');
      if (btn.dataset.tab === 'saved') renderSaved();
      if (btn.dataset.tab === 'history') renderHistory();
    });
  });

  // ---------- SOURCE SUB-TABS ----------
  $$('.source-tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      $$('.source-tab-btn').forEach((b) => b.classList.remove('is-active'));
      $$('.source-panel').forEach((p) => p.classList.remove('is-active'));
      btn.classList.add('is-active');
      activeSource = btn.dataset.source;
      $('#source' + (activeSource === 'file' ? 'File' : 'Text')).classList.add('is-active');
    });
  });

  // ---------- FILE INPUT / DRAG & DROP ----------
  dropzone.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    if (fileInput.files && fileInput.files[0]) {
      selectedFile = fileInput.files[0];
      fileNameEl.textContent = 'Selected: ' + selectedFile.name;
    }
  });
  ['dragover', 'dragenter'].forEach((evt) => {
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.classList.add('is-dragover');
    });
  });
  ['dragleave', 'drop'].forEach((evt) => {
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.classList.remove('is-dragover');
    });
  });
  dropzone.addEventListener('drop', (e) => {
    const file = e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) {
      selectedFile = file;
      fileNameEl.textContent = 'Selected: ' + selectedFile.name;
    }
  });

  // ---------- SUMMARIZE ----------
  summarizeBtn.addEventListener('click', () => summarize());

  async function summarize() {
    formError.hidden = true;

    const options = {
      length: $('#lengthSelect').value,
      includeActionItems: $('#actionItemsCb').checked
    };

    if (activeSource === 'file' && !selectedFile) {
      formError.textContent = 'Please choose a PDF or .txt file first.';
      formError.hidden = false;
      return;
    }
    if (activeSource === 'text' && !textInput.value.trim()) {
      formError.textContent = 'Please paste some text first.';
      formError.hidden = false;
      return;
    }

    emptyState.hidden = true;
    resultCard.hidden = true;
    loadingState.hidden = false;
    summarizeBtn.disabled = true;

    try {
      let res, data;
      if (activeSource === 'file') {
        const formData = new FormData();
        formData.append('document', selectedFile);
        formData.append('options', JSON.stringify(options));
        res = await fetch('/api/summarize/file', { method: 'POST', body: formData });
      } else {
        res = await fetch('/api/summarize/text', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: textInput.value, options, sourceName: 'Pasted text' })
        });
      }

      data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Unknown error while summarizing.');
      }

      data.date = new Date().toISOString();
      currentBrief = data;
      renderBrief(data, resultCard, { showSave: true });
      resultCard.hidden = false;
      addToHistory(data);
    } catch (err) {
      console.error(err);
      formError.textContent = 'Could not summarize: ' + err.message;
      formError.hidden = false;
      emptyState.hidden = false;
    } finally {
      loadingState.hidden = true;
      summarizeBtn.disabled = false;
    }
  }

  // ---------- RENDER A BRIEF CARD ----------
  function renderBrief(brief, container, opts) {
    const saved = getSaved();
    const isSaved = saved.some((b) => briefId(b) === briefId(brief));

    const keyPointsHtml = (brief.keyPoints || []).map((p) => `<li>${escapeHtml(p)}</li>`).join('');
    const actionItems = brief.actionItems || [];
    const actionHtml = actionItems.length
      ? `<p class="section-label">Action items</p><ul class="action-items">${actionItems.map((a) => `<li>${escapeHtml(a)}</li>`).join('')}</ul>`
      : '';
    const truncatedNote = brief.truncated
      ? '<p class="truncated-note">Note: the source was long, so only the first part was summarized.</p>'
      : '';

    container.innerHTML = `
      <p class="brief-source">${escapeHtml(brief.sourceName || 'Document')}</p>
      <h3>${escapeHtml(brief.title || 'Summary')}</h3>
      <p class="brief-summary">${escapeHtml(brief.summary || '')}</p>
      ${truncatedNote}
      <p class="section-label">Key points</p>
      <ul class="key-points">${keyPointsHtml}</ul>
      ${actionHtml}
      <div class="card-actions">
        <button type="button" class="btn-save ${isSaved ? 'is-saved' : ''}">${isSaved ? '★ Saved' : '☆ Save'}</button>
        <button type="button" class="btn-copy">Copy</button>
        <button type="button" class="btn-download">Download .txt</button>
        ${opts && opts.showRemove ? '<button type="button" class="btn-remove">Remove</button>' : ''}
      </div>
    `;

    container.querySelector('.btn-save').addEventListener('click', (e) => {
      toggleSaved(brief);
      const btn = e.currentTarget;
      const nowSaved = getSaved().some((b) => briefId(b) === briefId(brief));
      btn.classList.toggle('is-saved', nowSaved);
      btn.textContent = nowSaved ? '★ Saved' : '☆ Save';
      if ($('#tab-saved').classList.contains('is-active')) renderSaved();
    });

    container.querySelector('.btn-copy').addEventListener('click', () => {
      const textOut = briefAsText(brief);
      navigator.clipboard.writeText(textOut).catch(() => {});
    });

    container.querySelector('.btn-download').addEventListener('click', () => {
      downloadText(briefAsText(brief), (brief.title || 'summary') + '.txt');
    });

    const removeBtn = container.querySelector('.btn-remove');
    if (removeBtn) {
      removeBtn.addEventListener('click', () => {
        setSaved(getSaved().filter((b) => briefId(b) !== briefId(brief)));
        renderSaved();
      });
    }
  }

  function briefAsText(brief) {
    let out = `${brief.title || 'Summary'}\nSource: ${brief.sourceName || ''}\n\n`;
    out += `${brief.summary || ''}\n\nKey points:\n`;
    (brief.keyPoints || []).forEach((p) => { out += `- ${p}\n`; });
    if ((brief.actionItems || []).length) {
      out += `\nAction items:\n`;
      brief.actionItems.forEach((a) => { out += `- ${a}\n`; });
    }
    return out;
  }

  function downloadText(text, filename) {
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename.replace(/[^a-z0-9.\-_ ]/gi, '_');
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  // ---------- SAVED ----------
  function toggleSaved(brief) {
    const saved = getSaved();
    const exists = saved.some((b) => briefId(b) === briefId(brief));
    if (exists) {
      setSaved(saved.filter((b) => briefId(b) !== briefId(brief)));
    } else {
      saved.push(brief);
      setSaved(saved);
    }
    updateCounts();
  }

  function renderSaved() {
    const saved = getSaved();
    const grid = $('#savedGrid');
    const empty = $('#savedEmpty');
    grid.innerHTML = '';
    if (!saved.length) {
      empty.hidden = false;
      return;
    }
    empty.hidden = true;
    saved.forEach((brief) => {
      const item = document.createElement('article');
      item.className = 'brief-item';
      renderBrief(brief, item, { showSave: true, showRemove: true });
      grid.appendChild(item);
    });
  }

  // ---------- HISTORY ----------
  function addToHistory(brief) {
    const history = getHistory();
    history.unshift(brief);
    setHistory(history.slice(0, 20));
  }

  function renderHistory() {
    const history = getHistory();
    const list = $('#historyList');
    const empty = $('#historyEmpty');
    list.innerHTML = '';
    if (!history.length) {
      empty.hidden = false;
      return;
    }
    empty.hidden = true;

    history.forEach((brief) => {
      const li = document.createElement('li');
      const date = new Date(brief.date);
      const dateStr = date.toLocaleDateString('en-US', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
      li.innerHTML = `
        <div>
          <div>${escapeHtml(brief.title || 'Summary')} <span class="history-date">— ${escapeHtml(brief.sourceName || '')}</span></div>
          <div class="history-date">${dateStr}</div>
        </div>
        <button type="button" class="history-view">View</button>
      `;
      li.querySelector('.history-view').addEventListener('click', () => {
        currentBrief = brief;
        $$('.tab-btn').forEach((b) => b.classList.remove('is-active'));
        $$('.tab-panel').forEach((p) => p.classList.remove('is-active'));
        document.querySelector('[data-tab="summarize"]').classList.add('is-active');
        $('#tab-summarize').classList.add('is-active');
        emptyState.hidden = true;
        renderBrief(brief, resultCard, { showSave: true });
        resultCard.hidden = false;
      });
      list.appendChild(li);
    });
  }

  // ---------- COUNTS ----------
  function updateCounts() {
    const saved = getSaved();
    $('#savedCount').textContent = saved.length ? `(${saved.length})` : '';
  }

  // ---------- UTIL ----------
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ---------- INIT ----------
  updateCounts();
})();
