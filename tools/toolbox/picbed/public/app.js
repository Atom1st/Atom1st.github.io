/* ═══════════════════════════════════════════════════════════
   PicBed · 前端逻辑
   ═══════════════════════════════════════════════════════════ */
'use strict';

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

const state = {
  channel: 'github',
  fmt: 'url',
  search: '',
  gallery: [],
  queue: [],
};

/* ── 主题 ── */
const THEME_KEY = 'picbed-theme';
function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  localStorage.setItem(THEME_KEY, t);
}
applyTheme(localStorage.getItem(THEME_KEY) || 'light');
$('#btnTheme').onclick = () =>
  applyTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light');

/* ── Toast ── */
let toastTimer;
function toast(msg, isErr = false) {
  const el = $('#toast');
  el.textContent = msg;
  el.className = 'toast' + (isErr ? ' err' : '');
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, isErr ? 4200 : 2200);
}

async function copyText(t) {
  try {
    await navigator.clipboard.writeText(t);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = t;
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

const fmtSize = n => n < 1024 ? n + 'B' : n < 1048576 ? (n / 1024).toFixed(1) + 'KB' : (n / 1048576).toFixed(1) + 'MB';
const fmtTime = iso => {
  const d = new Date(iso);
  const p = x => String(x).padStart(2, '0');
  return `${d.getMonth() + 1}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

function linkFor(item) {
  if (state.fmt === 'md') return `![](${item.url})`;
  if (state.fmt === 'html') return `<img src="${item.url}" alt="${item.name}" />`;
  return item.url;
}

/* ── 渠道切换 ── */
$('#channelTabs').addEventListener('click', e => {
  const btn = e.target.closest('.tab');
  if (!btn) return;
  state.channel = btn.dataset.channel;
  $$('#channelTabs .tab').forEach(t => t.classList.toggle('active', t === btn));
});

/* ── 格式切换 ── */
$('#fmtSwitch').addEventListener('click', e => {
  const btn = e.target.closest('.fmt');
  if (!btn) return;
  state.fmt = btn.dataset.fmt;
  $$('#fmtSwitch .fmt').forEach(t => t.classList.toggle('active', t === btn));
});

/* ── 选择 / 拖拽 / 粘贴 ── */
const drop = $('#drop');
const fileInput = $('#fileInput');
drop.onclick = () => fileInput.click();
fileInput.onchange = () => { addFiles(fileInput.files); fileInput.value = ''; };

['dragenter', 'dragover'].forEach(ev =>
  drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('dragging'); }));
['dragleave', 'drop'].forEach(ev =>
  drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('dragging'); }));
drop.addEventListener('drop', e => addFiles(e.dataTransfer.files));

document.addEventListener('paste', e => {
  if (e.target.tagName === 'INPUT') return;
  const files = [...(e.clipboardData?.files || [])];
  if (files.length) addFiles(files);
});

const IMG_RE = /\.(png|jpe?g|gif|webp|avif|bmp|svg|ico)$/i;
function addFiles(fileList) {
  const files = [...fileList].filter(f => f.type.startsWith('image/') || IMG_RE.test(f.name));
  if (!files.length) { toast('没有可上传的图片文件', true); return; }
  for (const f of files) {
    state.queue.push({ id: qid(), file: f, status: 'pending', progress: 0, result: null, error: '' });
  }
  renderQueue();
  runQueue();
}

let qSeq = 0;
const qid = () => 'q' + (++qSeq);

/* ── 上传队列（并发 2）── */
async function runQueue() {
  const CONCURRENCY = 2;
  async function worker() {
    while (true) {
      const it = state.queue.find(q => q.status === 'pending');
      if (!it) return;
      it.status = 'uploading';
      renderQueue();
      try {
        const buf = await it.file.arrayBuffer();
        const res = await fetch('/api/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            channel: state.channel,
            filename: it.file.name,
            dataBase64: b64(buf),
          }),
        });
        const j = await res.json();
        if (!res.ok || !j.ok) throw new Error(j.error || `HTTP ${res.status}`);
        it.status = 'done';
        it.result = j.item;
        it.note = j.note || '';
        await loadGallery();
      } catch (e) {
        it.status = 'failed';
        it.error = String(e.message || e);
      }
      renderQueue();
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
}

function b64(buf) {
  const bytes = new Uint8Array(buf);
  let s = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    s += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(s);
}

/* ── 队列渲染 ── */
function renderQueue() {
  const list = $('#queue');
  const done = state.queue.filter(q => q.status === 'done').length;
  const fail = state.queue.filter(q => q.status === 'failed').length;
  const total = state.queue.length;

  $('#queueHead').hidden = total === 0;
  $('#queueSummary').textContent =
    `上传队列 · ${done + fail}/${total}` + (fail ? ` · ${fail} 失败` : '');

  list.innerHTML = '';
  for (const it of state.queue) {
    const li = document.createElement('li');
    li.className = 'q-item ' + (it.status === 'done' ? 'done' : it.status === 'failed' ? 'failed' : '');

    const thumb = it.status === 'done' && it.result
      ? `<img class="q-thumb" src="${esc(it.result.thumb)}" onerror="this.style.visibility='hidden'">`
      : `<img class="q-thumb" src="${URL.createObjectURL(it.file)}">`;

    let sub = '';
    if (it.status === 'pending') sub = '<span class="q-sub">排队中…</span>';
    else if (it.status === 'uploading') sub = '<span class="q-sub">上传中…</span>';
    else if (it.status === 'failed') sub = `<span class="q-sub err">${esc(it.error)}</span>`;
    else if (it.status === 'done') {
      sub = `<span class="q-sub ok">${esc(it.result.url)}${it.note ? ' · ' + esc(it.note) : ''}</span>`;
    }

    const actions = document.createElement('div');
    actions.className = 'q-actions';
    if (it.status === 'done') {
      actions.appendChild(iconBtn('复制链接', 'M4 8h11v11H4zM9 4h11v11H9z', () => copyText(linkFor(it.result)).then(() => toast('已复制'))));
    }
    actions.appendChild(iconBtn('移除', 'M5 5l14 14M19 5L5 19', () => {
      state.queue = state.queue.filter(q => q !== it);
      renderQueue();
    }));

    li.innerHTML = `${thumb}<div><div class="q-name">${esc(it.file.name)} · ${fmtSize(it.file.size)}</div>${sub}</div>`;
    li.appendChild(actions);
    li.insertAdjacentHTML('beforeend', '<div class="q-bar"><i></i></div>');
    list.appendChild(li);
  }
}

function iconBtn(title, path, onclick) {
  const b = document.createElement('button');
  b.className = 'icon-btn';
  b.title = title;
  b.innerHTML = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square"><path d="${path}"/></svg>`;
  b.onclick = onclick;
  return b;
}

$('#btnClearQueue').onclick = () => {
  state.queue = state.queue.filter(q => q.status !== 'done');
  renderQueue();
};

/* ── 图库 ── */
async function loadGallery() {
  try {
    const r = await fetch('/api/gallery');
    const j = await r.json();
    state.gallery = j.items || [];
    renderGallery();
  } catch { /* ignore */ }
}

function renderGallery() {
  const body = $('#galleryBody');
  const kw = state.search.trim().toLowerCase();
  const items = kw
    ? state.gallery.filter(i => i.name.toLowerCase().includes(kw) || (i.url || '').toLowerCase().includes(kw))
    : state.gallery;

  body.innerHTML = '';
  if (!items.length) {
    body.innerHTML = `<div class="g-empty">${kw ? '没有匹配的记录' : '还没有上传记录'}</div>`;
    return;
  }

  for (const it of items) {
    const card = document.createElement('div');
    card.className = 'g-card';
    card.innerHTML = `
      <div class="g-img"><img loading="lazy" src="${esc(it.thumb)}" onerror="this.classList.add('broken')"></div>
      <div class="g-meta">
        <div class="g-name" title="${esc(it.name)}">${esc(it.name)} · ${fmtSize(it.size || 0)}</div>
        <div class="g-url" title="点击复制">${esc(it.url)}</div>
      </div>
      <div class="g-foot">
        <span class="g-ch ${esc(it.channel)}">${esc(it.channel)}</span>
        <span class="g-time">${fmtTime(it.at)}</span>
      </div>`;
    card.querySelector('.g-img').onclick = () => window.open(it.url, '_blank');
    card.querySelector('.g-url').onclick = () => copyText(linkFor(it)).then(() => toast('已复制：' + state.fmt.toUpperCase()));
    const foot = card.querySelector('.g-foot');
    foot.appendChild(iconBtn('复制链接', 'M4 8h11v11H4zM9 4h11v11H9z', () => copyText(linkFor(it)).then(() => toast('已复制'))));
    foot.appendChild(iconBtn('下载', 'M12 4v10M8 11l4 4 4-4M5 19h14', () => {
      window.open(`/api/proxy?url=${encodeURIComponent(it.url)}&name=${encodeURIComponent(it.name)}`, '_blank');
    }));
    foot.appendChild(iconBtn('删除记录', 'M5 5l14 14M19 5L5 19', async () => {
      await fetch(`/api/gallery/${it.id}`, { method: 'DELETE' });
      await loadGallery();
    }));
    body.appendChild(card);
  }
}

$('#search').oninput = e => { state.search = e.target.value; renderGallery(); };

/* ── 设置 ── */
const modal = $('#settingsModal');
$('#btnSettings').onclick = openSettings;
$('#btnCloseSettings').onclick = closeModal;
$('#btnCancelSettings').onclick = closeModal;
modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

async function openSettings() {
  try {
    const r = await fetch('/api/config');
    const c = await r.json();
    $('#cfgGhToken').value = c.github.token || '';
    $('#cfgGhOwner').value = c.github.owner || '';
    $('#cfgGhRepo').value = c.github.repo || '';
    $('#cfgGhBranch').value = c.github.branch || 'main';
    $('#cfgGhDir').value = c.github.dir || 'public/uploads';
    $('#cfgGhSite').value = c.github.site || '';
    $('#cfgImgbbKey').value = c.imgbb.key || '';
    $('#cfgImgbbExp').value = c.imgbb.expiration || '';
    $('#cfgPicgoKey').value = c.picgo.key || '';
    $('#cfgNote').textContent = c.github.hasToken ? 'GitHub Token 已配置（留空保持不变）' : '';
  } catch (e) {
    toast('读取配置失败：' + e.message, true);
  }
  modal.hidden = false;
}
function closeModal() { modal.hidden = true; }

$('#btnSaveSettings').onclick = async () => {
  const body = {
    channel: state.channel,
    github: {
      token: $('#cfgGhToken').value.trim(),
      owner: $('#cfgGhOwner').value.trim(),
      repo: $('#cfgGhRepo').value.trim(),
      branch: $('#cfgGhBranch').value.trim() || 'main',
      dir: $('#cfgGhDir').value.trim() || 'public/uploads',
      site: $('#cfgGhSite').value.trim(),
    },
    imgbb: {
      key: $('#cfgImgbbKey').value.trim(),
      expiration: $('#cfgImgbbExp').value.trim(),
    },
    picgo: { key: $('#cfgPicgoKey').value.trim() },
  };
  try {
    const r = await fetch('/api/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    toast('设置已保存');
    closeModal();
  } catch (e) {
    toast('保存失败：' + e.message, true);
  }
};

/* ── 启动 ── */
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

loadGallery();
