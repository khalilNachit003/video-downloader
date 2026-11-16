import { STRINGS, getLang, setLang, t, applyLang } from './i18n.js';
import { getHistory, addHistory, clearHistory } from './history.js';

/* ══════════════════════════════════════════════════════════
   State
   ══════════════════════════════════════════════════════════ */
const state = {
  mode: 'single', // single | multi | playlist
  lastInfo: null,
  lastUrl: '',
  playlist: null,
  multi: null,
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

const el = {
  urlInput: $('#urlInput'),
  pasteBtn: $('#pasteBtn'),
  clearBtn: $('#clearBtn'),
  analyzeBtn: $('#analyzeBtn'),
  inputHint: $('#inputHint'),
  results: $('#results'),
  historyList: $('#historyList'),
  clearHistoryBtn: $('#clearHistoryBtn'),
  platformChips: $('#platformChips'),
  langToggle: $('#langToggle'),
  langLabel: $('#langLabel'),
  toasts: $('#toasts'),
  modal: $('#modal'),
  modalTitle: $('#modalTitle'),
  modalBody: $('#modalBody'),
  year: $('#year'),
};

/* ══════════════════════════════════════════════════════════
   Utilities
   ══════════════════════════════════════════════════════════ */
function toast(message, kind = '') {
  const node = document.createElement('div');
  node.className = `toast ${kind}`.trim();
  node.textContent = message;
  el.toasts.appendChild(node);
  setTimeout(() => {
    node.style.opacity = '0';
    node.style.transform = 'translateY(8px)';
    node.style.transition = '0.25s';
    setTimeout(() => node.remove(), 260);
  }, 3800);
}

function esc(str = '') {
  return String(str).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
}

function bytes(n) {
  if (!n && n !== 0) return null;
  const u = ['B', 'KB', 'MB', 'GB'];
  let v = Number(n);
  let i = 0;
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${u[i]}`;
}

function numFmt(n) {
  if (!n && n !== 0) return null;
  try {
    return new Intl.NumberFormat(getLang() === 'ar' ? 'ar-EG' : 'en-US').format(n);
  } catch {
    return String(n);
  }
}

/**
 * Download a file through fetch with a visible progress card.
 * Falls back to normal navigation when the stream can't be read.
 */

function startDownload(url, format, title) {
  return runDownload(url, format, title);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Full download flow with a visible progress card:
 *   1. create a background job on the server
 *   2. poll /api/download-job/:id/status every 500ms
 *   3. hand the browser the finished file
 */
async function runDownload(url, format, title) {
  const card = createProgressCard(title || 'video');
  let jobId = null;

  card.cancelButton.addEventListener('click', async () => {
    try {
      if (jobId) await fetch(`/api/download-job/${jobId}`, { method: 'DELETE' });
    } catch {
      /* ignore */
    }
    card.remove();
    toast(t('cancel'));
  });

  try {
    card.setIndeterminate();

    const created = await api('/api/start-download', {
      method: 'POST',
      body: JSON.stringify({ url, format, title }),
    });
    jobId = created.jobId;

    // Trigger the file navigation NOW, while the user gesture is fresh.
    // The server holds this request open until the job is done, then
    // streams the file — the browser shows a normal download.
    const a = document.createElement('a');
    a.href = `/api/download-job/${jobId}/file`;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();

    // Poll the job to keep the progress card in sync.
    for (;;) {
      await sleep(400);
      const status = await api(`/api/download-job/${jobId}/status`);

      if (status.state === 'error') {
        throw new Error(status.error || t('errorGeneric'));
      }
      if (status.state === 'done') {
        const total = status.totalBytes || 0;
        card.update(total, total, 100);
        break;
      }
      card.update(
        status.bytesDone,
        status.totalBytes,
        status.totalBytes ? Math.round((status.bytesDone / status.totalBytes) * 100) : null
      );
    }

    card.done();
    toast(t('downloaded'), 'ok');

    addHistory({
      url,
      title,
      qualityId: format,
      qualityLabel: format === '__mp3__' ? 'MP3' : format,
      thumbnail: state.lastInfo?.thumbnail || null,
    });

    return title;
  } catch (err) {
    card.fail(err.message || t('errorGeneric'));
    toast(err.message || t('errorGeneric'), 'err');
    return null;
  }
}

function createProgressCard(title) {
  const card = document.createElement('div');
  card.className = 'dl-progress';
  card.innerHTML = `
    <div class="dl-progress-row">
      <div class="dl-progress-icon">⬇</div>
      <div class="dl-progress-title" title="${esc(title)}">${esc(title)}</div>
      <button class="dl-progress-cancel" type="button">${esc(t('cancel'))}</button>
    </div>
    <div class="dl-progress-bar"><div class="dl-progress-fill"></div></div>
    <div class="dl-progress-sub">0 MB</div>
  `;
  el.toasts.appendChild(card);

  const fill = card.querySelector('.dl-progress-fill');
  const sub = card.querySelector('.dl-progress-sub');
  const cancelButton = card.querySelector('.dl-progress-cancel');

  return {
    cancelButton,
    card,
    update(received, total, pct) {
      if (total) {
        fill.style.width = `${pct ?? 0}%`;
        fill.style.opacity = '1';
        sub.textContent = `${bytes(received)} / ${bytes(total)} (${pct ?? 0}%)`;
      } else {
        fill.style.width = '100%';
        fill.style.opacity = '0.6';
        sub.textContent = `${bytes(received)}…`;
      }
    },
    setIndeterminate() {
      card.classList.add('indeterminate');
      fill.style.width = '35%';
      sub.textContent = `⏳ ${t('downloading2')}`;
    },
    done() {
      card.classList.add('done');
      fill.style.width = '100%';
      fill.style.opacity = '1';
      sub.textContent = `✓ ${t('downloaded')}`;
      cancelButton.remove();
      setTimeout(() => card.remove(), 2500);
    },
    fail(message) {
      card.classList.add('failed');
      sub.textContent = '✕ ' + message;
      cancelButton.remove();
      setTimeout(() => card.remove(), 5000);
    },
    remove() {
      card.remove();
    },
  };
}

/* ══════════════════════════════════════════════════════════
   API
   ══════════════════════════════════════════════════════════ */
async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* non-json */
  }
  if (!res.ok) throw new Error(data?.error || `${res.status} ${res.statusText}`);
  return data;
}

/* ══════════════════════════════════════════════════════════
   Mode switching
   ══════════════════════════════════════════════════════════ */
function placeholderFor(mode) {
  const s = STRINGS[getLang()];
  if (mode === 'multi') return s.placeholderMulti;
  if (mode === 'playlist') return s.placeholderPlaylist;
  return s.placeholder;
}

function setMode(mode) {
  state.mode = mode;
  $$('.tab').forEach((tab) => {
    const active = tab.dataset.mode === mode;
    tab.classList.toggle('is-active', active);
    tab.setAttribute('aria-selected', String(active));
  });
  el.urlInput.placeholder = placeholderFor(mode);
  el.urlInput.value = '';
  el.results.hidden = true;
  el.results.innerHTML = '';
  el.inputHint.textContent = '';
  el.inputHint.classList.remove('error');
}

/* ══════════════════════════════════════════════════════════
   Rendering: single result
   ══════════════════════════════════════════════════════════ */
function renderSingle({ url, platform, platformName, info }) {
  el.results.hidden = false;
  el.results.innerHTML = '';

  const videoQualities = info.quality.filter((q) => q.kind === 'video');
  const audioOption = info.quality.find((q) => q.kind === 'audio');

  const options = videoQualities
    .map((q) => {
      const size = q.sizeText ? ` — ${q.sizeText}` : '';
      const fps = q.fps && q.fps > 30 ? `${q.fps}fps` : '';
      const merge = q.needsMerge ? '' : '';
      return `<option value="${esc(q.id)}">${esc(q.label)}${fps ? ` ${fps}` : ''}${merge}${size}</option>`;
    })
    .join('');

  const thumbnailHTML = (url) => {
    if (!url) return '';
    const fallback = url.replace(/maxresdefault/g, 'hqdefault').replace(/sddefault/g, 'hqdefault');
    return `<img src="${esc(url)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="if(this.dataset.fallback){this.onerror=null;this.src=this.dataset.fallback}" data-fallback="${esc(fallback)}" />`;
  };

  const card = document.createElement('div');
  card.className = 'result';
  card.innerHTML = `
    <div class="result-thumb">
      ${info.thumbnail ? thumbnailHTML(info.thumbnail) : ''}
      ${info.durationString ? `<span class="dur">${esc(info.durationString)}</span>` : ''}
    </div>
    <div class="result-body">
      <div class="result-meta">
        <span class="badge" style="--c:${esc(platformColor(platform))}"><i></i>${esc(platformName)}</span>
        ${info.uploader ? `<span>${esc(info.uploader)}</span>` : ''}
        ${info.durationString ? `<span>${esc(t('duration'))}: ${esc(info.durationString)}</span>` : ''}
        ${info.viewCount ? `<span>${esc(t('views'))}: ${esc(numFmt(info.viewCount))}</span>` : ''}
      </div>
      <h3 class="result-title">${esc(info.title)}</h3>
      <div class="controls">
        ${
          options
            ? `<span class="select-wrap">
                 <select id="qualitySelect" aria-label="${esc(t('quality'))}">${options}</select>
               </span>`
            : ''
        }
        <button class="dl-btn" id="dlBtn" ${options ? '' : 'disabled'}>⬇ ${esc(t('download'))}</button>
        ${
          audioOption
            ? `<button class="dl-btn alt" id="mp3Btn">🎵 ${esc(t('downloadMp3'))}</button>`
            : ''
        }
        <button class="mini-btn" id="copyBtn">${esc(t('copyLink'))}</button>
      </div>
    </div>
  `;
  el.results.appendChild(card);

  $('#dlBtn')?.addEventListener('click', (e) => {
    const format = $('#qualitySelect')?.value || '';
    beginDownload(e.currentTarget, url, format, info.title);
  });

  $('#mp3Btn')?.addEventListener('click', (e) => {
    beginDownload(e.currentTarget, url, '__mp3__', info.title);
  });

  $('#copyBtn')?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast(t('copied'), 'ok');
    } catch {
      toast(url);
    }
  });
}

async function beginDownload(button, url, format, title) {
  const original = button.innerHTML;
  button.disabled = true;
  button.innerHTML = `<span class="spinner"></span> ${esc(t('downloading2'))}`;
  try {
    await startDownload(url, format, title);
  } finally {
    button.disabled = false;
    button.innerHTML = original;
  }
}

function platformColor(id) {
  const map = {
    youtube: '#ff0000',
    facebook: '#1877f2',
    instagram: '#e1306c',
    tiktok: '#22d3ee',
    twitter: '#1da1f2',
    reddit: '#ff4500',
    linkedin: '#0a66c2',
    soundcloud: '#ff5500',
    vk: '#0077ff',
    pinterest: '#e60023',
    tumblr: '#36465d',
    dailymotion: '#0066dc',
    bilibili: '#00a1d6',
  };
  return map[id] || '#7c5cff';
}

/* ══════════════════════════════════════════════════════════
   Rendering: batch (multiple links)
   ══════════════════════════════════════════════════════════ */
function renderMulti(results) {
  el.results.hidden = false;
  el.results.innerHTML = '';

  const ok = results.filter((r) => r.ok);
  const failed = results.filter((r) => !r.ok);

  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = `
    <div class="card-head">
      <h2>${esc(t('results'))} — ${ok.length} ${esc(t('items'))}</h2>
      <div style="display:flex;gap:8px">
        <button class="mini-btn" id="selAll">${esc(t('selectAll'))}</button>
        <button class="mini-btn" id="selNone">${esc(t('deselectAll'))}</button>
        <button class="dl-btn" id="dlSelected">⬇ ${esc(t('downloadSelected'))}</button>
      </div>
    </div>
    <div class="item-list" id="batchList">
      ${results
        .map((r, i) => {
          if (!r.ok) {
            return `<div class="item err">
              <span style="font-size:1.1rem">✕</span>
              <div class="item-main">
                <div class="item-title">${esc(r.url)}</div>
                <div class="item-sub">${esc(r.error || t('errorGeneric'))}</div>
              </div>
              <div class="item-actions"><button class="mini-btn danger" data-remove="${i}">${esc(t('remove'))}</button></div>
            </div>`;
          }
          return `<div class="item">
            <input type="checkbox" class="batch-check" value="${i}" checked />
            <div class="item-main">
              <div class="item-title">${esc(r.info.title)}</div>
              <div class="item-sub">${esc(r.platformName)}${
                r.info.durationString ? ` · ${esc(r.info.durationString)}` : ''
              }</div>
            </div>
            <div class="item-actions">
              <button class="mini-btn" data-dl="${i}">⬇</button>
              <button class="mini-btn danger" data-remove="${i}">${esc(t('remove'))}</button>
            </div>
          </div>`;
        })
        .join('')}
    </div>
  `;
  el.results.appendChild(card);

  const checks = () => $$('.batch-check', card);

  $('#selAll', card)?.addEventListener('click', () => checks().forEach((c) => (c.checked = true)));
  $('#selNone', card)?.addEventListener('click', () => checks().forEach((c) => (c.checked = false)));

  $('#dlSelected', card)?.addEventListener('click', (e) => {
    const picked = checks().filter((c) => c.checked).map((c) => Number(c.value));
    if (!picked.length) return toast(t('errorNoSelection'), 'err');
    downloadMany(results, picked, e.currentTarget);
  });

  card.addEventListener('click', (e) => {
    const dlBtn = e.target.closest('[data-dl]');
    if (dlBtn) {
      const r = results[Number(dlBtn.dataset.dl)];
      const q = r.info.quality.find((x) => x.kind === 'video');
      startDownload(r.url, q ? q.id : '', r.info.title);
      return;
    }
    const rm = e.target.closest('[data-remove]');
    if (rm) {
      const idx = Number(rm.dataset.remove);
      results.splice(idx, 1);
      renderMulti(results);
    }
  });

  if (failed.length) toast(`${failed.length} ${esc(t('failed'))}`, 'err');
}

async function downloadMany(results, indexes, button) {
  const original = button.innerHTML;
  button.disabled = true;
  button.innerHTML = `<span class="spinner"></span> ${esc(t('working'))}`;

  for (const i of indexes) {
    const r = results[i];
    if (!r?.ok) continue;
    const q = r.info.quality.find((x) => x.kind === 'video');
    startDownload(r.url, q ? q.id : '', r.info.title);
    await new Promise((res) => setTimeout(res, 900));
  }

  button.disabled = false;
  button.innerHTML = original;
}

/* ══════════════════════════════════════════════════════════
   Rendering: playlist
   ══════════════════════════════════════════════════════════ */
function renderPlaylist(playlist) {
  el.results.hidden = false;
  el.results.innerHTML = '';

  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = `
    <div class="card-head">
      <h2>${esc(playlist.title)} — ${playlist.count} ${esc(t('items'))}</h2>
      <div style="display:flex;gap:8px">
        <button class="mini-btn" id="selAll">${esc(t('selectAll'))}</button>
        <button class="mini-btn" id="selNone">${esc(t('deselectAll'))}</button>
        <button class="dl-btn" id="dlSelected">⬇ ${esc(t('downloadSelected'))}</button>
      </div>
    </div>
    <div class="item-list" id="plList">
      ${playlist.entries
        .map(
          (e, i) => `
        <div class="item">
          <input type="checkbox" class="pl-check" value="${i}" checked />
          <div class="item-main">
            <div class="item-title">${esc(e.title)}</div>
            <div class="item-sub">${esc(e.uploader || '')}${
              e.durationString ? ` · ${esc(e.durationString)}` : ''
            }</div>
          </div>
          <div class="item-actions">
            <button class="mini-btn" data-dl="${i}" ${e.url ? '' : 'disabled'}>⬇</button>
          </div>
        </div>`
        )
        .join('')}
    </div>
  `;
  el.results.appendChild(card);

  const checks = () => $$('.pl-check', card);
  $('#selAll', card)?.addEventListener('click', () => checks().forEach((c) => (c.checked = true)));
  $('#selNone', card)?.addEventListener('click', () => checks().forEach((c) => (c.checked = false)));

  $('#dlSelected', card)?.addEventListener('click', (e) => {
    const picked = checks()
      .filter((c) => c.checked)
      .map((c) => Number(c.value));
    if (!picked.length) return toast(t('errorNoSelection'), 'err');
    downloadMany(
      picked.map((i) => ({
        ok: true,
        url: playlist.entries[i].url,
        info: { title: playlist.entries[i].title, quality: [], thumbnail: playlist.entries[i].thumbnail },
      })),
      picked.map((_, n) => n),
      e.currentTarget
    );
  });

  card.addEventListener('click', (e) => {
    const dl = e.target.closest('[data-dl]');
    if (!dl) return;
    const entry = playlist.entries[Number(dl.dataset.dl)];
    if (!entry?.url) return;
    startDownload(entry.url, '', entry.title);
  });
}

/* ══════════════════════════════════════════════════════════
   Analyze
   ══════════════════════════════════════════════════════════ */
async function analyze() {
  const url = el.urlInput.value.trim();
  if (!url) {
    el.inputHint.textContent = t('errorInvalidUrl');
    el.inputHint.classList.add('error');
    return;
  }

  el.analyzeBtn.disabled = true;
  el.analyzeBtn.innerHTML = `<span class="spinner"></span> ${esc(t('analyzing'))}`;
  el.inputHint.textContent = '';
  el.inputHint.classList.remove('error');
  el.results.hidden = true;
  el.results.innerHTML = '<div class="skeleton"></div><div class="skeleton"></div>';

  try {
    if (state.mode === 'multi') {
      const urls = url
        .split(/[\n\r]+/)
        .map((u) => u.trim())
        .filter(Boolean);
      if (!urls.length) throw new Error(t('errorInvalidUrl'));
      const data = await api('/api/batch', { method: 'POST', body: JSON.stringify({ urls }) });
      state.multi = data.results;
      renderMulti(data.results);
    } else if (state.mode === 'playlist') {
      const data = await api('/api/playlist', { method: 'POST', body: JSON.stringify({ url }) });
      state.playlist = data.playlist;
      renderPlaylist(data.playlist);
    } else {
      const data = await api('/api/resolve', { method: 'POST', body: JSON.stringify({ url }) });
      state.lastInfo = data.info;
      state.lastUrl = url;
      renderSingle({ url, platform: data.platform, platformName: data.platformName, info: data.info });
    }
  } catch (err) {
    el.results.hidden = true;
    el.results.innerHTML = '';
    el.inputHint.textContent = err.message || t('errorGeneric');
    el.inputHint.classList.add('error');
    toast(err.message || t('errorGeneric'), 'err');
  } finally {
    el.analyzeBtn.disabled = false;
    el.analyzeBtn.textContent = t('analyze');
  }
}

/* ══════════════════════════════════════════════════════════
   History
   ══════════════════════════════════════════════════════════ */
function renderHistory() {
  const list = getHistory();
  el.historyList.innerHTML = '';

  if (!list.length) {
    el.historyList.innerHTML = `<div class="empty-state">${esc(t('historyEmpty'))}</div>`;
    return;
  }

  for (const item of list) {
    const div = document.createElement('div');
    div.className = 'history-item';
    div.innerHTML = `
      ${
        item.thumbnail
          ? `<img class="history-thumb" src="${esc(item.thumbnail)}" alt="" loading="lazy" referrerpolicy="no-referrer" />`
          : `<div class="history-thumb"></div>`
      }
      <div class="history-info">
        <div class="history-title">${esc(item.title || item.url)}</div>
        <div class="history-sub">${esc(item.qualityLabel || 'best')} · ${esc(
          new Date(item.at).toLocaleDateString(getLang() === 'ar' ? 'ar-EG' : 'en-US')
        )}</div>
      </div>
      <button class="mini-btn" data-re="${esc(item.id)}">⬇ ${esc(t('redownload'))}</button>
    `;
    el.historyList.appendChild(div);
  }

  el.historyList.onclick = (e) => {
    const btn = e.target.closest('[data-re]');
    if (!btn) return;
    const item = list.find((x) => x.id === btn.dataset.re);
    if (!item) return;
    startDownload(item.url, item.qualityId || '', item.title);
  };
}

/* ══════════════════════════════════════════════════════════
   Platform chips
   ══════════════════════════════════════════════════════════ */
async function loadPlatforms() {
  try {
    const data = await api('/api/platforms');
    const top = ['youtube', 'facebook', 'instagram', 'tiktok', 'twitter', 'reddit'];
    const list = data.platforms.filter((p) => top.includes(p.id));
    el.platformChips.innerHTML = list
      .map(
        (p) =>
          `<span class="chip" style="--c:${esc(p.color)}"><i></i>${esc(p.name)}</span>`
      )
      .join('');
  } catch {
    /* non-critical */
  }
}

/** Warn once if the server cannot merge streams (ffmpeg missing). */
async function checkHealth() {
  try {
    const res = await fetch('/api/health');
    const data = await res.json();
    if (data.ffmpeg === false) toast(t('ffmpegMissing'), 'err');
  } catch {
    /* non-critical */
  }
}

/* ══════════════════════════════════════════════════════════
   Modals
   ══════════════════════════════════════════════════════════ */
const MODAL_CONTENT = {
  about: { title: 'aboutTitle', body: 'aboutBody' },
  terms: { title: 'disclaimerTitle', body: 'disclaimerBody' },
  privacy: { title: 'privacy', body: 'privacyBody' },
};

function openModal(kind) {
  const conf = MODAL_CONTENT[kind];
  if (!conf) return;
  el.modalTitle.textContent = t(conf.title);
  el.modalBody.innerHTML = `<p>${esc(t(conf.body))}</p>`;
  el.modal.hidden = false;
}

function closeModal() {
  el.modal.hidden = true;
}

/* ══════════════════════════════════════════════════════════
   Events
   ══════════════════════════════════════════════════════════ */
function bind() {
  $$('.tab').forEach((tab) => tab.addEventListener('click', () => setMode(tab.dataset.mode)));

  el.analyzeBtn.addEventListener('click', analyze);
  el.urlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') analyze();
  });

  el.pasteBtn.addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      el.urlInput.value = text.trim();
      el.urlInput.focus();
    } catch {
      toast(t('pasteFail'), 'err');
    }
  });

  el.clearBtn.addEventListener('click', () => {
    el.urlInput.value = '';
    el.results.hidden = true;
    el.results.innerHTML = '';
    el.inputHint.textContent = '';
    el.urlInput.focus();
  });

  el.clearHistoryBtn.addEventListener('click', () => {
    if (!getHistory().length) return;
    clearHistory();
    toast(t('clearHistory'));
  });

  el.langToggle.addEventListener('click', () => {
    setLang(getLang() === 'ar' ? 'en' : 'ar');
  });

  document.addEventListener('click', (e) => {
    const trigger = e.target.closest('[data-modal]');
    if (trigger) openModal(trigger.dataset.modal);
    if (e.target.closest('[data-close-modal]')) closeModal();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });

  window.addEventListener('historychange', renderHistory);
  window.addEventListener('langchange', () => {
    el.langLabel.textContent = t('language');
    el.urlInput.placeholder = placeholderFor(state.mode);
    renderHistory();
  });
}

/* ══════════════════════════════════════════════════════════
   Boot
   ══════════════════════════════════════════════════════════ */
function boot() {
  applyLang();
  el.langLabel.textContent = t('language');
  el.year.textContent = new Date().getFullYear();
  bind();
  setMode('single');
  renderHistory();
  loadPlatforms();
  checkHealth();
}

boot();
