/* ═══════════════════════════════════════════════════════════
   Guiyihan Studio · 前端逻辑
   ═══════════════════════════════════════════════════════════ */

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

const state = {
  posts: [],
  current: null,
  dirty: false,
  suppressDirty: false,
  cat: '',
  keyword: '',
  meta: null,
  vditor: null,
  busy: false,
  previewRunning: false,
  savedAt: null,
};

/* ─────────────────────── 基础工具 ─────────────────────── */

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

async function api(path, { method = 'GET', body } = {}) {
  const opts = { method, headers: {} };
  if (method !== 'GET') {
    opts.headers['X-Studio'] = '1';
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body || {});
  }
  const res = await fetch(path, opts);
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  if (!res.ok) throw new Error((data && data.error) || `请求失败 (${res.status})`);
  return data;
}

let toastTimer = null;
function toast(msg, isErr = false) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.toggle('err', !!isErr);
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
}

function fmtDate(d) {
  return (d || '').slice(0, 10);
}

function countWords(text) {
  const t = String(text || '').replace(/```[\s\S]*?```/g, ' ').replace(/`[^`]*`/g, ' ');
  const cjk = (t.match(/[\u4e00-\u9fa5]/g) || []).length;
  const en = (t.match(/[A-Za-z0-9]+/g) || []).length;
  return cjk + en;
}

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/* ─────────────────────── 主题 ─────────────────────── */

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('studio-theme', theme);
  if (state.vditor) {
    try {
      state.vditor.setTheme(theme === 'dark' ? 'dark' : 'light', theme === 'dark' ? 'dark' : 'light', 'github');
    } catch { /* ignore */ }
  }
}

function initTheme() {
  const saved = localStorage.getItem('studio-theme');
  const sysDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  applyTheme(saved || (sysDark ? 'dark' : 'light'));
}

/* ─────────────────────── Vditor ─────────────────────── */

async function uploadHandler(files) {
  const file = files && files[0];
  if (!file) return null;
  try {
    const buf = await file.arrayBuffer();
    const res = await fetch('/api/upload?name=' + encodeURIComponent(file.name || 'image.png'), {
      method: 'POST',
      headers: { 'X-Studio': '1', 'Content-Type': 'application/octet-stream' },
      body: buf,
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || '上传失败');
    return {
      msg: '',
      code: 0,
      data: { errFiles: [], succMap: { [file.name]: json.url } },
    };
  } catch (e) {
    toast('图片上传失败：' + e.message, true);
    return null;
  }
}

function initVditor() {
  return new Promise((resolve) => {
    const dark = document.documentElement.getAttribute('data-theme') === 'dark';
    state.vditor = new Vditor('vditor', {
      cdn: '/vendor',
      mode: 'ir',
      lang: 'zh_CN',
      placeholder: '',
      cache: { enable: false },
      counter: { enable: false },
      tab: '  ',
      height: '100%',
      preview: {
        delay: 180,
        math: { engine: 'KaTeX', inlineDigit: true },
        hljs: { lineNumber: true, style: 'github' },
        markdown: { toc: true, mark: true },
        theme: {
          current: dark ? 'dark' : 'light',
        },
      },
      toolbar: [
        'headings', 'bold', 'italic', 'strike', '|',
        'list', 'ordered-list', 'check', '|',
        'quote', 'line', 'code', 'inline-code', '|',
        'link', 'table', 'upload', '|',
        'undo', 'redo', '|',
        'edit-mode', 'both', 'preview', 'fullscreen',
      ],
      toolbarConfig: { pin: true },
      upload: { handler: uploadHandler },
      input: () => { if (!state.suppressDirty) markDirty(); },
      after: () => resolve(),
    });
  });
}

/* ─────────────────────── 列表 ─────────────────────── */

function renderChips() {
  const cats = ['全部', ...(state.meta ? state.meta.categories : [])];
  $('#catChips').innerHTML = cats.map(c => {
    const val = c === '全部' ? '' : c;
    return `<button class="chip${state.cat === val ? ' on' : ''}" data-cat="${esc(val)}">${esc(c)}</button>`;
  }).join('');
}

function filteredPosts() {
  const kw = state.keyword.trim().toLowerCase();
  return state.posts.filter(p => {
    if (state.cat && p.category !== state.cat) return false;
    if (!kw) return true;
    return (p.title + ' ' + p.slug + ' ' + p.description + ' ' + p.body).toLowerCase().includes(kw);
  });
}

function renderList() {
  const list = $('#postList');
  const items = filteredPosts();
  $('#listCount').textContent = `${items.length} 篇`;
  $('#listFilter').textContent = state.cat ? `／${state.cat}` : (state.keyword ? '／搜索中' : '');

  if (!items.length) {
    list.innerHTML = `<li style="padding:24px 14px;color:var(--muted);font-size:12px;text-align:center;">没有匹配的文章</li>`;
    return;
  }

  list.innerHTML = items.map(p => {
    const flags = [];
    if (p.access === 'protected') flags.push('<i class="pi-flag flag-protected">锁</i>');
    if (p.hot) flags.push('<i class="pi-flag flag-hot">热</i>');
    if (p.pdf) flags.push('<i class="pi-flag flag-pdf">PDF</i>');
    if (p.type === 'page') flags.push('<i class="pi-flag flag-page">页</i>');
    if (p.type === 'resource') flags.push('<i class="pi-flag flag-pdf">源</i>');
    const on = state.current && state.current.slug === p.slug ? ' on' : '';
    return `<li class="post-item${on}" data-slug="${esc(p.slug)}">
      <div class="pi-title"><span>${esc(p.title)}</span>${flags.join('')}</div>
      <div class="pi-meta">
        <span class="pi-cat">${esc(p.category)}</span>
        <span>${esc(p.date)}</span>
        <i class="pi-dot"></i>
        <span>${p.words} 字</span>
      </div>
    </li>`;
  }).join('');
}

async function loadPosts() {
  state.posts = await api('/api/posts');
  renderList();
}

/* ─────────────────────── 编辑器 ↔ 表单 ─────────────────────── */

function setSeg(container, value, options) {
  $$('button', container).forEach(b => b.classList.toggle('on', b.dataset.v === value));
}

function renderSeg(container, options, value, onChange) {
  if (typeof value === 'function') { onChange = value; value = null; }
  container.innerHTML = options.map(o => `<button data-v="${esc(o.v)}">${esc(o.t)}</button>`).join('');
  $$('button', container).forEach(btn => {
    btn.addEventListener('click', () => {
      setSeg(container, btn.dataset.v);
      onChange(btn.dataset.v);
    });
  });
  if (value != null) setSeg(container, value);
}

function updateUrlPreview() {
  const slug = $('#fSlug').value.trim() || '…';
  $('#urlPreview').textContent = `/articles/${slug}`;
}

function updateTitleMeta() {
  const d = $('#fDate').value || '—';
  const cat = currentCategory() || '—';
  const slug = $('#fSlug').value.trim() || '—';
  $('#titleMeta').textContent = `${d}  ·  ${cat}  ·  ${slug}.md`;
}

let currentCatVal = '';
let currentTypeVal = 'article';
let currentOriginVal = 'original';
let currentAccessVal = 'public';

function currentCategory() { return currentCatVal; }

function fillForm(a) {
  state.suppressDirty = true;
  $('#title').value = a.title || '';
  $('#fSlug').value = a.slug || '';
  $('#fDate').value = fmtDate(a.date) || today();
  $('#fDescription').value = a.description || '';
  $('#fPdf').value = a.pdf || '';
  $('#fPassword').value = a.password || '';
  $('#fHot').checked = !!a.hot;
  $('#fCommit').value = '';

  currentCatVal = a.category || '记录';
  currentTypeVal = a.type || 'article';
  currentOriginVal = a.origin || 'original';
  currentAccessVal = a.access || 'public';

  setSeg($('#fCategory'), currentCatVal);
  setSeg($('#fType'), currentTypeVal);
  setSeg($('#fOrigin'), currentOriginVal);
  setSeg($('#fAccess'), currentAccessVal);
  $('#pwdField').hidden = currentAccessVal !== 'protected';

  updateUrlPreview();
  updateTitleMeta();
  updateWordCount();
  setTimeout(() => { state.suppressDirty = false; }, 400);
}

function collect() {
  return {
    title: $('#title').value.trim() || '未命名',
    date: $('#fDate').value || today(),
    category: currentCatVal,
    description: $('#fDescription').value.trim(),
    type: currentTypeVal,
    origin: currentOriginVal,
    access: currentAccessVal,
    password: $('#fPassword').value,
    hot: $('#fHot').checked,
    pdf: $('#fPdf').value.trim(),
    body: state.vditor ? toEol(mdFromEditor(state.vditor.getValue()), state.eol) : '',
  };
}

function markDirty() {
  if (state.suppressDirty) return;
  if (!state.current) return;
  if (state.dirty) return;
  state.dirty = true;
  $('#saveState').textContent = '未保存';
  $('#saveState').classList.add('dirty');
  $('#statSaved').textContent = '有改动未保存';
  updateWordCount();
}

function markClean() {
  state.dirty = false;
  state.savedAt = new Date();
  $('#saveState').textContent = '已保存';
  $('#saveState').classList.remove('dirty');
  $('#statSaved').textContent = '已保存 ' + state.savedAt.toTimeString().slice(0, 5);
}

let wcTimer = null;
function updateWordCount() {
  clearTimeout(wcTimer);
  wcTimer = setTimeout(() => {
    const n = state.vditor ? countWords(state.vditor.getValue()) : 0;
    $('#statWords').textContent = `${n} 字 · 约 ${Math.max(1, Math.round(n / 400))} 分钟`;
  }, 200);
}

/* ─────────────────────── 打开 / 保存 / 新建 / 删除 ─────────────────────── */

async function openArticle(slug, { force = false } = {}) {
  if (state.busy) { toast('任务执行中，稍后再切换', true); return; }
  if (state.dirty && !force) {
    if (!confirm('当前文章有未保存的修改，确定要切换吗？')) return;
  }
  try {
    const a = await api('/api/posts/' + encodeURIComponent(slug));
    state.current = a;
    fillForm(a);
    state.eol = (a.body || '').includes('\r\n') ? '\r\n' : '\n';
    state.suppressDirty = true;
    state.vditor.setValue(mdToEditor(a.body || ''), true);
    await new Promise(resolve => setTimeout(resolve, 150));
    state.suppressDirty = false;
    state.dirty = false;
    markClean();
    $('#empty').hidden = true;
    $('#statFile').textContent = `${a.slug}.md`;
    localStorage.setItem('studio-last', slug);
    renderList();
    updateWordCount();
  } catch (e) {
    toast('打开失败：' + e.message, true);
  }
}

async function save({ silent = false } = {}) {
  if (!state.current) return false;
  const payload = collect();

  const wantSlug = ($('#fSlug').value || '').trim();
  try {
    if (wantSlug && wantSlug !== state.current.slug) {
      await api('/api/rename', { method: 'POST', body: { from: state.current.slug, to: wantSlug } });
      state.current.slug = wantSlug;
      $('#statFile').textContent = `${wantSlug}.md`;
      localStorage.setItem('studio-last', wantSlug);
    }
    await api('/api/posts/' + encodeURIComponent(state.current.slug), { method: 'PUT', body: payload });
    state.current = { ...state.current, ...payload };
    markClean();
    await loadPosts();
    if (!silent) toast('已保存 ' + state.current.slug + '.md');
    return true;
  } catch (e) {
    toast('保存失败：' + e.message, true);
    return false;
  }
}

function suggestSlug(title) {
  const ascii = (title || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (ascii.length >= 3) return ascii.slice(0, 40);
  const d = today().replace(/-/g, '');
  return `post-${d}`;
}

function openNewModal() {
  if (state.busy) { toast('任务执行中', true); return; }
  $('#nTitle').value = '';
  $('#nSlug').value = '';
  $('#nSlug').dataset.touched = '';
  setSeg($('#nCategory'), '记录');
  $('#newMask').hidden = false;
  setTimeout(() => $('#nTitle').focus(), 30);
}

function closeNewModal() { $('#newMask').hidden = true; }

async function createArticle() {
  const title = $('#nTitle').value.trim();
  let slug = ($('#nSlug').value.trim() || suggestSlug(title)).replace(/\s+/g, '-');
  const catBtn = $('#nCategory button.on');
  const category = catBtn ? catBtn.dataset.v : '记录';
  try {
    await api('/api/posts', {
      method: 'POST',
      body: {
        slug,
        title: title || slug,
        date: today(),
        category,
        type: 'article',
        origin: 'original',
        access: 'public',
        body: '',
      },
    });
    closeNewModal();
    await loadPosts();
    await openArticle(slug, { force: true });
    setTimeout(() => { $('#title').focus(); $('#title').select(); }, 50);
    toast('已创建 ' + slug + '.md');
  } catch (e) {
    toast('创建失败：' + e.message, true);
  }
}

async function deleteArticle() {
  if (!state.current) return;
  const slug = state.current.slug;
  if (!confirm(`确定删除 ${slug}.md 吗？\n\n文件会被直接移出磁盘（可在 git 里找回已提交版本）。`)) return;
  try {
    await api('/api/posts/' + encodeURIComponent(slug), { method: 'DELETE' });
    state.current = null;
    state.dirty = false;
    $('#empty').hidden = false;
    $('#statFile').textContent = '—';
    await loadPosts();
    if (state.posts.length) await openArticle(state.posts[0].slug, { force: true });
    toast('已删除 ' + slug + '.md');
  } catch (e) {
    toast('删除失败：' + e.message, true);
  }
}

async function renameArticle() {
  if (!state.current) return;
  const next = prompt('新的文件名（不含 .md）：', state.current.slug);
  if (!next || next === state.current.slug) return;
  try {
    await api('/api/rename', { method: 'POST', body: { from: state.current.slug, to: next.trim() } });
    await loadPosts();
    await openArticle(next.trim(), { force: true });
    toast('已改名');
  } catch (e) {
    toast('改名失败：' + e.message, true);
  }
}

async function duplicateArticle() {
  if (!state.current) return;
  const next = prompt('副本文件名（不含 .md）：', state.current.slug + '-copy');
  if (!next) return;
  try {
    await api(`/api/posts/${encodeURIComponent(state.current.slug)}/duplicate`, { method: 'POST', body: { slug: next.trim() } });
    await loadPosts();
    await openArticle(next.trim(), { force: true });
    toast('已复制');
  } catch (e) {
    toast('复制失败：' + e.message, true);
  }
}

/* ─────────────────────── 任务日志 ─────────────────────── */

function showLog(title) {
  $('#logTitle').textContent = title;
  $('#logDrawer').hidden = false;
  $('#logBody').textContent = '';
}

function appendLog(line) {
  if (line === '__DONE_OK__') return;
  const el = $('#logBody');
  el.textContent += line + '\n';
  el.scrollTop = el.scrollHeight;
}

async function runTask(action, payload = {}, title = '') {
  if (state.busy) { toast('已有任务在执行中', true); return false; }
  state.busy = true;
  showLog(title || action);
  let ok = false;
  try {
    const res = await fetch('/api/run', {
      method: 'POST',
      headers: { 'X-Studio': '1', 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...payload }),
    });
    if (!res.ok || !res.body) throw new Error('无法启动任务 (' + res.status + ')');

    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const l of lines) {
        if (l === '__DONE_OK__') ok = true;
        else appendLog(l);
      }
    }
    if (buf) appendLog(buf);
  } catch (e) {
    appendLog('✗ ' + e.message);
  } finally {
    state.busy = false;
  }
  return ok;
}

async function publish() {
  if (!state.current) { toast('先选一篇文章', true); return; }
  if (state.busy) { toast('任务执行中', true); return; }

  const saved = await save({ silent: true });
  if (!saved) return;

  const title = state.current.title;
  const msg = $('#fCommit').value.trim() || `post: 更新文章 ${title}`;

  toast('正在发布，请稍候…');
  const ok = await runTask('publish', { message: msg, skipBuild: !$('#cAutoBuild').checked }, '一键发布');
  await loadPosts();
  await refreshEnv();

  if (ok) {
    toast('发布完成，GitHub Actions 将在 1-2 分钟内上线');
    $('#fCommit').value = '';
  } else {
    toast('发布未完成，请看下方日志', true);
  }
}

/* ─────────────────────── 环境信息 ─────────────────────── */

async function refreshEnv() {
  try {
    state.meta = await api('/api/meta');
    state.previewRunning = !!state.meta.preview.running;
    $('#statEnv').textContent = `${state.meta.bun ? 'bun' : 'node'} · ${state.meta.branch} · :${state.meta.port}`;
    $('#kBranch').textContent = state.meta.branch;
    $('#kProtected').textContent = state.meta.protectedFiles + ' 篇';
    $('#kRuntime').textContent = state.meta.bun ? 'bun' : 'node';
    $('#cAutoBuild').checked = state.meta.config.autoBuild;
    $('#cAutoEncrypt').checked = state.meta.config.autoEncrypt;
    if (!state.meta.hasModules) {
      toast('缺少 node_modules，请先在项目根目录运行 bun install', true);
    }
    renderChips();
  } catch (e) {
    $('#statEnv').textContent = '离线';
  }
}

/* ─────────────────────── 绑定事件 ─────────────────────── */

function bindEvents() {
  /* 列表 */
  $('#postList').addEventListener('click', (e) => {
    const li = e.target.closest('.post-item');
    if (li) openArticle(li.dataset.slug);
  });

  $('#catChips').addEventListener('click', (e) => {
    const btn = e.target.closest('.chip');
    if (!btn) return;
    state.cat = btn.dataset.cat || '';
    renderChips();
    renderList();
  });

  let searchTimer = null;
  $('#search').addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.keyword = e.target.value;
      renderList();
    }, 160);
  });
  $('#btnClearSearch').addEventListener('click', () => {
    $('#search').value = '';
    state.keyword = '';
    renderList();
  });

  /* 顶部 */
  $('#btnSave').addEventListener('click', () => save());
  $('#btnPublish').addEventListener('click', publish);
  $('#btnPublish2').addEventListener('click', publish);
  $('#btnNew').addEventListener('click', openNewModal);
  $('#btnNewEmpty').addEventListener('click', openNewModal);
  $('#btnTheme').addEventListener('click', () => {
    const cur = document.documentElement.getAttribute('data-theme');
    applyTheme(cur === 'dark' ? 'light' : 'dark');
  });

  /* 预览 */
  $('#btnPreview').addEventListener('click', async () => {
    try {
      if (!state.previewRunning) {
        const r = await api('/api/preview', { method: 'POST', body: { action: 'start' } });
        state.previewRunning = true;
        toast('本地预览已启动：http://localhost:' + (r.port || 4321));
        setTimeout(() => window.open('http://localhost:' + (r.port || 4321), '_blank'), 2200);
      } else {
        window.open('http://localhost:4321', '_blank');
      }
    } catch (e) {
      toast('预览启动失败：' + e.message, true);
    }
  });

  /* 表单改动 */
  const dirtyFields = ['#title', '#fDate', '#fDescription', '#fPdf', '#fPassword', '#fSlug'];
  dirtyFields.forEach(sel => {
    $(sel).addEventListener('input', () => { markDirty(); updateUrlPreview(); updateTitleMeta(); });
  });
  $('#fHot').addEventListener('change', markDirty);

  renderSeg($('#fType'), [{ v: 'article', t: '文章' }, { v: 'resource', t: '资源' }, { v: 'page', t: '页面' }], v => {
    currentTypeVal = v; markDirty();
  });
  renderSeg($('#fOrigin'), [{ v: 'original', t: '原创' }, { v: 'repost', t: '搬运' }], v => {
    currentOriginVal = v; markDirty();
  });
  renderSeg($('#fAccess'), [{ v: 'public', t: '公开' }, { v: 'protected', t: '加密' }], v => {
    currentAccessVal = v;
    $('#pwdField').hidden = v !== 'protected';
    markDirty();
  });
  renderSeg($('#nCategory'), ['记录', '文学', '理论', '学习', '生活', '评论'].map(c => ({ v: c, t: c })));
  setSeg($('#nCategory'), '记录');

  $('#btnToday').addEventListener('click', () => { $('#fDate').value = today(); markDirty(); updateTitleMeta(); });
  $('#btnRename').addEventListener('click', renameArticle);
  $('#btnDuplicate').addEventListener('click', duplicateArticle);
  $('#btnDelete').addEventListener('click', deleteArticle);
  $('#btnReveal').addEventListener('click', async () => {
    if (!state.current) return;
    try { await api('/api/reveal', { method: 'POST', body: { slug: state.current.slug } }); }
    catch (e) { toast(e.message, true); }
  });

  /* 发布页 */
  $('#cAutoBuild').addEventListener('change', async (e) => {
    await api('/api/config', { method: 'POST', body: { autoBuild: e.target.checked } });
  });
  $('#cAutoEncrypt').addEventListener('change', async (e) => {
    await api('/api/config', { method: 'POST', body: { autoEncrypt: e.target.checked } });
  });
  $$('[data-run]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (btn.dataset.run === 'build') await save({ silent: true });
      await runTask(btn.dataset.run, {}, btn.textContent.trim());
    });
  });
  $('#btnOpenSite').addEventListener('click', () => window.open('https://guiyihan.top', '_blank'));

  /* 日志 */
  $('#btnLogClose').addEventListener('click', () => { $('#logDrawer').hidden = true; });
  $('#btnLogCopy').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText($('#logBody').textContent); toast('日志已复制'); }
    catch { toast('复制失败', true); }
  });

  /* 右侧 Tab */
  $$('.insp-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      $$('.insp-tab').forEach(t => t.classList.toggle('active', t === tab));
      $$('.insp-pane').forEach(p => p.classList.toggle('active', p.dataset.pane === tab.dataset.tab));
    });
  });

  /* 新建弹窗 */
  $('#btnNewClose').addEventListener('click', closeNewModal);
  $('#btnNewCancel').addEventListener('click', closeNewModal);
  $('#btnNewCreate').addEventListener('click', createArticle);
  $('#newMask').addEventListener('click', (e) => { if (e.target === $('#newMask')) closeNewModal(); });
  $('#nTitle').addEventListener('input', (e) => {
    if (!$('#nSlug').dataset.touched) $('#nSlug').value = suggestSlug(e.target.value);
  });
  $('#nSlug').addEventListener('input', () => { $('#nSlug').dataset.touched = '1'; });
  $('#nTitle').addEventListener('keydown', (e) => { if (e.key === 'Enter') createArticle(); });

  /* 快捷键 */
  document.addEventListener('keydown', (e) => {
    const mod = e.ctrlKey || e.metaKey;
    if (!mod) return;
    if (e.key.toLowerCase() === 's') { e.preventDefault(); save(); }
    else if (e.key.toLowerCase() === 'p' && e.shiftKey) { e.preventDefault(); publish(); }
    else if (e.key.toLowerCase() === 'n' && e.shiftKey) { e.preventDefault(); openNewModal(); }
    else if (e.key.toLowerCase() === 'k') { e.preventDefault(); $('#search').focus(); $('#search').select(); }
  });

  window.addEventListener('beforeunload', (e) => {
    if (state.dirty) { e.preventDefault(); e.returnValue = ''; }
  });

  window.addEventListener('resize', () => {
    if (state.vditor && state.vditor.resize) { try { state.vditor.resize(); } catch { /* ignore */ } }
  });
}

/* ─────────────────────── 启动 ─────────────────────── */

(async function boot() {
  window.addEventListener('error', (e) => toast('页面脚本错误: ' + (e.message || 'unknown'), true));
  initTheme();
  bindEvents();
  await initVditor();
  await refreshEnv();

  $('#fCategory').innerHTML = '';
  renderSeg($('#fCategory'), (state.meta ? state.meta.categories : ['记录', '文学', '理论', '学习', '生活', '评论']).map(c => ({ v: c, t: c })), v => {
    currentCatVal = v; markDirty(); updateTitleMeta();
  });
  setSeg($('#fCategory'), '记录');

  await loadPosts();

  const last = localStorage.getItem('studio-last');
  const target = state.posts.find(p => p.slug === last) || state.posts[0];
  if (target) await openArticle(target.slug, { force: true });
  else $('#empty').hidden = false;

  applyTheme(document.documentElement.getAttribute('data-theme'));
})();
