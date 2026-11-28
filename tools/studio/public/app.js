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
  eol: '\n',
  view: 'posts',
  // 习惯
  habit: null,
  session: null,          // { startWords, goal, startedAt }
  focus: false,
  activeMs: 0,            // 本轮专注累计毫秒
  lastInputAt: 0,
  habitDirty: { cats: {}, focused: 0 },
  tags: {},               // { slug: [tag] } 本地选题标签
  postTags: [],           // 文章标签（写入 frontmatter，会发布）
  lastWords: 0,
  // 草稿
  drafts: [],
  draftId: '',
  draftTimer: null,
  autoSaveTimer: null,
};

const TAGS_FILE = 'studio-tags';

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

/** 统一用编辑器内容取字数 */
function editorWords() {
  return state.vditor ? countWords(state.vditor.getValue()) : 0;
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
      input: () => {
        state.lastInputAt = Date.now();
        if (!state.suppressDirty) markDirty();
      },
      after: () => resolve(),
    });
  });
}

/* ─────────────────────── 左侧视图切换 ─────────────────────── */

function switchView(view) {
  state.view = view;
  $$('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  $$('.rail-view').forEach(v => v.classList.toggle('active', v.dataset.view === view));
  if (view === 'today') renderHabit();
  if (view === 'drafts') loadDrafts().catch(() => {});
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
    list.innerHTML = `<li class="list-empty">没有匹配的文章</li>`;
    return;
  }

  list.innerHTML = items.map(p => {
    const flags = [];
    if (p.access === 'protected') flags.push('<i class="pi-flag flag-protected">锁</i>');
    if (p.hot) flags.push('<i class="pi-flag flag-hot">热</i>');
    if (p.pdf) flags.push('<i class="pi-flag flag-pdf">PDF</i>');
    if (p.type === 'page') flags.push('<i class="pi-flag flag-page">页</i>');
    if (p.type === 'resource') flags.push('<i class="pi-flag flag-pdf">源</i>');
    if (p.date === today()) flags.push('<i class="pi-flag flag-today">今</i>');
    const on = state.current && state.current.slug === p.slug ? ' on' : '';
    const tags = (state.tags[p.slug] || []).slice(0, 3)
      .map(t => `<span class="pi-tag">${esc(t)}</span>`).join('');
    return `<li class="post-item${on}" data-slug="${esc(p.slug)}">
      <div class="pi-title"><span>${esc(p.title)}</span>${flags.join('')}</div>
      <div class="pi-meta">
        <span class="pi-cat">${esc(p.category)}</span>
        <span>${esc(p.date)}</span>
        <i class="pi-dot"></i>
        <span>${p.words} 字</span>
        ${tags}
      </div>
    </li>`;
  }).join('');
}

async function loadPosts() {
  state.posts = await api('/api/posts');
  renderList();
}

/* 后端版本自检：旧版 server.mjs 的 /api/posts 不含 tags 字段，
   会导致标签静默丢失。检测到就给出明确提示，避免误以为「保存失败」。*/
function checkBackendVersion() {
  const bar = document.getElementById('verWarn');
  if (!bar || !state.posts || !state.posts.length) return;
  const hasTagsKey = ('tags' in state.posts[0]);
  if (hasTagsKey) return;
  document.getElementById('verWarnText').textContent =
    '后端服务是旧版本：标签等新功能无法保存。请关闭 Studio 窗口后重新双击 start.cmd 启动，即可恢复。';
  bar.hidden = false;
}

/* ─────────────────────── 编辑器 ↔ 表单 ─────────────────────── */

function setSeg(container, value) {
  $$('button', container).forEach(b => b.classList.toggle('on', b.dataset.v === value));
}

let currentCatVal = '';
let currentTypeVal = 'article';
let currentOriginVal = 'original';
let currentAccessVal = 'public';

function currentCategory() { return currentCatVal; }

function renderMetaSegs() {
  const cats = state.meta ? state.meta.categories : ['记录', '文学', '理论', '学习', '生活', '评论'];
  renderSeg($('#fCategory'), cats.map(c => ({ v: c, t: c })), v => {
    currentCatVal = v; markDirty(); updateTitleMeta();
  });
  setSeg($('#fCategory'), currentCatVal || '记录');

  renderSeg($('#fType'), [{ v: 'article', t: '文章' }, { v: 'resource', t: '资源' }, { v: 'page', t: '页面' }], v => {
    currentTypeVal = v; markDirty();
  });
  setSeg($('#fType'), currentTypeVal);

  renderSeg($('#fOrigin'), [{ v: 'original', t: '原创' }, { v: 'repost', t: '搬运' }], v => {
    currentOriginVal = v; markDirty();
  });
  setSeg($('#fOrigin'), currentOriginVal);

  renderSeg($('#fAccess'), [{ v: 'public', t: '公开' }, { v: 'protected', t: '加密' }], v => {
    currentAccessVal = v;
    $('#pwdField').hidden = v !== 'protected';
    markDirty();
  });
  setSeg($('#fAccess'), currentAccessVal);
  $('#pwdField').hidden = currentAccessVal !== 'protected';
}

function renderSeg(container, options, onChange) {
  container.innerHTML = options.map(o => `<button data-v="${esc(o.v)}">${esc(o.t)}</button>`).join('');
  $$('button', container).forEach(btn => {
    btn.addEventListener('click', () => {
      setSeg(container, btn.dataset.v);
      onChange(btn.dataset.v);
    });
  });
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

  state.postTags = Array.isArray(a.tags) ? [...a.tags] : [];
  renderPostTags();
  renderTags(a.slug);
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
    tags: [...(state.postTags || [])],
    body: state.vditor ? toEol(mdFromEditor(state.vditor.getValue()), state.eol) : '',
  };
}

function markDirty() {
  if (state.suppressDirty) return;
  if (!state.current) return;
  if (!state.dirty) {
    state.dirty = true;
    $('#saveState').textContent = '未保存';
    $('#saveState').classList.add('dirty');
    $('#statSaved').textContent = '有改动未保存';
  }
  updateWordCount();
  scheduleAutoSave();
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
    const n = editorWords();
    $('#statWords').textContent = `${n} 字 · 约 ${Math.max(1, Math.round(n / 400))} 分钟`;
    checkSession(n);
  }, 200);
}

/* ─────────────────────── 自动保存 / 专注 ─────────────────────── */

function scheduleAutoSave() {
  clearTimeout(state.autoSaveTimer);
  const delay = state.focus ? 30000 : 90000;
  state.autoSaveTimer = setTimeout(async () => {
    if (state.dirty && state.current && !state.busy) {
      const ok = await save({ silent: true });
      if (ok) $('#statSaved').textContent = '已自动保存 ' + new Date().toTimeString().slice(0, 5);
    }
  }, delay);
}

function setFocus(on) {
  state.focus = on;
  document.body.classList.toggle('focus-mode', on);
  $('#focusLabel').textContent = on ? '退出专注' : '专注';
  if (on) {
    startSession();
  } else {
    endSession({ silent: true });
  }
  setTimeout(() => { if (state.vditor && state.vditor.resize) { try { state.vditor.resize(); } catch { /* ignore */ } } }, 120);
}

/* ─────────────────────── 写作冲刺 ─────────────────────── */

function startSession() {
  const base = Math.max(50, state.habit ? state.habit.sessionGoal : 200);
  state.session = { startWords: editorWords(), goal: base, startedAt: Date.now() };
  state.activeMs = 0;
  state.lastInputAt = Date.now();
  $('#sessionBar').hidden = false;
  checkSession(editorWords());
  flushHabit();
}

function endSession({ silent = false } = {}) {
  if (!state.session) return;
  const written = Math.max(0, editorWords() - state.session.startWords);
  const minutes = Math.max(0, Math.round(state.activeMs / 60000));
  state.session = null;
  $('#sessionBar').hidden = true;
  flushHabit();
  if (!silent) {
    toast(`本次冲刺：${written} 字 · 专注 ${minutes} 分钟`);
  }
}

function checkSession(words) {
  if (!state.session) return;
  const delta = words - state.session.startWords;
  const goal = state.session.goal;
  const pct = Math.max(0, Math.min(100, Math.round((delta / goal) * 100)));
  $('#sbFill').style.width = pct + '%';
  $('#sbText').textContent = `${Math.max(0, delta)} / ${goal} 字`;
  if (delta >= goal && !state.session.done) {
    state.session.done = true;
    $('#sbText').textContent = `✓ ${delta} / ${goal} 字，达标`;
    toast('冲刺达标，站起来走两步 👏');
  }
}

/* ─────────────────────── 写作习惯：计数上报 ─────────────────────── */

let habitTickTimer = null;

function startHabitTicker() {
  // 每 3 秒：专注计时 + 字数净增量累积到本地待上报
  habitTickTimer = setInterval(() => {
    const now = editorWords();

    // 只有「真的敲了键盘」才算写作：切换文章、外部改了文件导致的内容变化不计分
    const typedRecently = Date.now() - state.lastInputAt < 8000;

    if (state.focus && Date.now() - state.lastInputAt < 5 * 60 * 1000) {
      state.activeMs += 3000;
      // 只把增量报给后端，别每次都报总量（否则专注时长会翻倍累加）
      state.habitDirty.focused = Math.floor(state.activeMs / 60000);
    }

    // 字数净增量按当前文章分类归账（热力图颜色用）；只记正向，避免删字把累计冲成负数
    if (typedRecently && state.current && now > state.lastWords) {
      const add = now - state.lastWords;
      if (add <= 2000) {
        const cat = currentCatVal || '其他';
        state.habitDirty.cats[cat] = (state.habitDirty.cats[cat] || 0) + add;
      }
    }
    state.lastWords = now;
    const dirtyCount = Object.values(state.habitDirty.cats).reduce((s, v) => s + v, 0);
    if (dirtyCount >= 20) flushHabit();
  }, 3000);

  // 每 20 秒把专注分钟数也报一次
  setInterval(() => { if (state.habitDirty.focused > 0) flushHabit(); }, 20000);

  window.addEventListener('beforeunload', () => { flushHabit(true); });
}

let flushing = false;
async function flushHabit(beacon = false) {
  const cats = state.habitDirty.cats;
  const focused = state.habitDirty.focused;
  const catKeys = Object.keys(cats);
  if (!catKeys.length && !focused) return;
  const payload = { focused };
  if (catKeys.length) payload.cats = { ...cats };
  state.habitDirty.cats = {};
  state.habitDirty.focused = 0;

  try {
    if (beacon && navigator.sendBeacon) {
      const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
      navigator.sendBeacon('/api/habit/log', blob);
      return;
    }
    state.habit = await api('/api/habit/log', { method: 'POST', body: payload });
    renderHabit();
    renderStreak();
  } catch {
    // 失败就把数据还回去，下次再报
    for (const [k, v] of Object.entries(payload.cats || {})) {
      state.habitDirty.cats[k] = (state.habitDirty.cats[k] || 0) + v;
    }
    state.habitDirty.focused += focused;
  }
}

function renderStreak() {
  if (!state.habit) return;
  const s = state.habit.streak;
  const done = state.habit.today.done;
  $('#statStreak').textContent = s > 0 ? `🔥 连续 ${s} 天` : '今天还没开始';
  $('#statStreak').classList.toggle('hot', s > 0);
  $('#statStreak').classList.toggle('done', done);
  $('#statToday').textContent = `今日 ${state.habit.today.words} / ${state.habit.today.goal} 字`;
  const badge = $('#navBadge');
  badge.hidden = done;
  if (!done) badge.textContent = `${Math.min(99, Math.round((state.habit.today.words / state.habit.today.goal) * 100))}%`;
  document.title = (done ? '✓ ' : '') + `Studio · ${state.habit.today.words}/${state.habit.today.goal} 字`;
}

function renderHabit() {
  const h = state.habit;
  if (!h) return;
  const { words, goal } = h.today;

  // 圆环
  const r = 52;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, words / goal));
  const fg = $('#ringFg');
  fg.setAttribute('stroke-dasharray', String(c));
  fg.setAttribute('stroke-dashoffset', String(c * (1 - pct)));
  fg.classList.toggle('full', pct >= 1);

  $('#tTodayWords').textContent = words;
  $('#tTodayGoal').textContent = `/ ${goal} 字`;
  $('#tStreak').textContent = h.streak;
  $('#tLongest').textContent = h.longest;
  $('#tRate').textContent = h.rate30 + '%';
  $('#tTotal').textContent = h.totalWords >= 10000 ? (h.totalWords / 10000).toFixed(1) + '万' : h.totalWords;

  const left = Math.max(0, goal - words);
  $('#tTip').textContent = pct >= 1
    ? `今天目标已达成，连续 ${h.streak} 天。多写的都算利息。`
    : words === 0
      ? '还没开始，写一句也算。'
      : `还差 ${left} 字达标，大概 ${Math.max(1, Math.round(left / 300))} 分钟的事。`;

  // 热力图：CSS Grid —— 第一列星期，第一行列头，其余 5×7 格子撑满宽度
  const heat = h.heat || [];
  // 深度分 4 级：0 / 不足半目标 / 过半 / 达标 / 翻倍
  const level = (w) => w === 0 ? 0 : w < goal * 0.5 ? 1 : w < goal ? 2 : w < goal * 2 ? 3 : 4;
  const cols = [];
  for (let i = 0; i < heat.length; i += 7) cols.push(heat.slice(i, i + 7));
  const dayNames = ['日', '一', '二', '三', '四', '五', '六'];
  let grid = `<span class="hg-corner"></span>`;
  grid += cols.map((col, ci) => {
    const first = col[0];
    const isMonthStart = ci === 0 || first.date.slice(5, 7) !== cols[ci - 1][0].date.slice(5, 7);
    const label = isMonthStart
      ? `${parseInt(first.date.slice(5, 7), 10)}月`
      : `${parseInt(first.date.slice(8), 10)}`;
    return `<span class="hg-col-head">${label}</span>`;
  }).join('');
  for (let r = 0; r < 7; r++) {
    grid += `<span class="hg-row-head">${dayNames[r]}</span>`;
    for (const col of cols) {
      const d = col[r];
      const lv = ' l' + level(d.words);
      const pc = d.peak ? ' c-' + d.peak : '';
      const cls = d.future ? ' future' : lv + pc + (d.date === h.today.date ? ' today' : '');
      const catName = d.peak ? ' · 多在「' + d.peak + '」' : '';
      const tip = d.future ? '' : `${d.date} · ${d.words} 字${catName}${d.focused ? ' · 专注 ' + d.focused + ' 分' : ''}`;
      grid += `<i class="h-cell${cls}" title="${esc(tip)}"></i>`;
    }
  }
  $('#tHeat').innerHTML = grid;
  $('#tHeatRange').textContent = `${heat[0]?.date || ''} ~ ${heat[heat.length - 1]?.date || ''}`;

  // 图例：各分类色样
  const catColors = { '记录': '#0969DA', '文学': '#8250DF', '理论': '#1A7F64', '学习': '#3FB950', '生活': '#F0883E', '评论': '#CF222E', '草稿': '#6E7781' };
  $('#tHeatCats').innerHTML = (state.meta ? state.meta.categories : ['记录', '文学', '理论', '学习', '生活', '评论'])
    .map(c => `<i class="h-cell" style="background:${catColors[c] || '#6E7781'}"></i><span>${c}</span>`).join('')
    + `<i class="h-cell" style="background:#6E7781"></i><span>草稿</span>`;

  // 时间
  $('#tFocus').textContent = h.today.focused;
  $('#tGoalWord').textContent = goal;
  const tPct = Math.min(100, Math.round((h.today.focused / 30) * 100));
  $('#tTimeFill').style.width = tPct + '%';
  const avg = h.totalDays > 0 ? Math.round(h.totalWords / h.totalDays) : 0;
  $('#tTimeTip').textContent = h.today.focused === 0
    ? '还没有专注记录，点右上角「专注」进沉浸模式。'
    : `今日专注 ${h.today.focused} 分钟${avg ? ` · 日均 ${avg} 字` : ''}`;

  $('#fDailyGoal').value = goal;
  $('#cRemind').checked = !!h.remindersOn;
  $('#fRemindAt').value = h.remindAt || '21:00';
  renderStreak();
}

async function loadHabit() {
  try {
    state.habit = await api('/api/habit');
    state.lastWords = editorWords();
    renderHabit();
  } catch { /* 忽略 */ }
}

/* ─────────────────────── 文章标签（发布） ─────────────────────── */

function renderPostTags() {
  const list = state.postTags || [];
  $('#fPostTags').innerHTML = list.length
    ? list.map(t => `<button class="chip on tag" data-post-tag="${esc(t)}" title="点击移除">${esc(t)} ✕</button>`).join('')
    : '<span class="hint">还没有标签</span>';
}
function addPostTag() {
  const t = $('#fNewPostTag').value.trim().replace(/^#/, '').slice(0, 16);
  if (!t) return;
  if (!state.postTags.includes(t)) state.postTags.push(t);
  $('#fNewPostTag').value = '';
  renderPostTags();
  markDirty();
}

/* ─────────────────────── 选题标签（本地） ─────────────────────── */

function loadTags() {
  try { state.tags = JSON.parse(localStorage.getItem(TAGS_FILE) || '{}') || {}; } catch { state.tags = {}; }
}
function saveTags() {
  try { localStorage.setItem(TAGS_FILE, JSON.stringify(state.tags)); } catch { /* ignore */ }
  renderList();
}
function renderTags(slug) {
  const list = state.tags[slug] || [];
  $('#tagChips').innerHTML = list.length
    ? list.map(t => `<button class="chip on tag" data-tag="${esc(t)}" title="点击移除">${esc(t)} ✕</button>`).join('')
    : '<span class="hint">还没有标签</span>';
}
function addTag() {
  if (!state.current) { toast('先选一篇文章', true); return; }
  const t = $('#fNewTag').value.trim().slice(0, 12);
  if (!t) return;
  const slug = state.current.slug;
  const list = state.tags[slug] || [];
  if (!list.includes(t)) list.push(t);
  state.tags[slug] = list;
  $('#fNewTag').value = '';
  saveTags();
  renderTags(slug);
}

/* ─────────────────────── 打开 / 保存 / 新建 / 删除 ─────────────────────── */

async function openArticle(slug, { force = false } = {}) {
  if (state.busy) { toast('任务执行中，稍后再切换', true); return; }
  if (state.dirty && !force) {
    if (!confirm('当前文章有未保存的修改，确定要切换吗？')) return;
  }
  try {
    const a = await api('/api/posts/' + encodeURIComponent(slug));
    flushHabit();
    state.current = a;
    // 换行风格要在 setValue 之前定好，collect() 依赖它
    state.eol = a.eol || '\n';
    fillForm(a);
    state.suppressDirty = true;
    state.vditor.setValue(mdToEditor(a.body || ''), true);
    await new Promise(resolve => setTimeout(resolve, 150));
    state.suppressDirty = false;
    state.dirty = false;
    state.lastWords = editorWords();
    if (state.session) {
      state.session.startWords = state.lastWords;
      state.session.done = false;
    }
    state.habitDirty.cats = {};
    markClean();
    $('#empty').hidden = true;
    $('#statFile').textContent = `${a.slug}.md`;
    localStorage.setItem('studio-last', slug);
    renderList();
    updateWordCount();
    if (state.view === 'drafts') switchView('posts');
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
    const res = await api('/api/posts/' + encodeURIComponent(state.current.slug), { method: 'PUT', body: payload });
    state.current = { ...state.current, ...payload };
    state.current.words = res && res.words != null ? res.words : countWords(payload.body);
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
  const stamp = new Date().toTimeString().slice(0, 5).replace(':', '');
  return `post-${d}-${stamp}`;
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

async function createArticle(body = '') {
  const title = $('#nTitle').value.trim();
  const slug = ($('#nSlug').value.trim() || suggestSlug(title)).replace(/\s+/g, '-');
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
        body,
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
    if (state.tags[slug]) { delete state.tags[slug]; saveTags(); }
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

/* ─────────────────────── 草稿箱 ─────────────────────── */

async function loadDrafts() {
  state.drafts = await api('/api/drafts');
  $('#navDraftCount').hidden = state.drafts.length === 0;
  $('#navDraftCount').textContent = state.drafts.length;
  renderDrafts();
}

function renderDrafts() {
  const list = $('#draftList');
  if (!state.drafts.length) {
    list.innerHTML = `<li class="list-empty">草稿箱是空的<br><span class="hint">想到一句话就把它扔进来</span></li>`;
    return;
  }
  list.innerHTML = state.drafts.map(d => {
    const t = new Date(d.updatedAt);
    const when = `${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')} ${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
    const preview = (d.text || '').replace(/\s+/g, ' ').slice(0, 40) || '（空）';
    return `<li class="post-item draft-item" data-id="${esc(d.id)}">
      <div class="pi-title"><span>${esc(preview)}</span></div>
      <div class="pi-meta"><span>${when}</span><i class="pi-dot"></i><span>${d.words} 字</span></div>
    </li>`;
  }).join('');
}

function openDraft(id) {
  const d = state.drafts.find(x => x.id === id);
  state.draftId = id;
  $('#draftText').value = d ? d.text : '';
  $('#draftMeta').textContent = d ? `#${id.slice(-4)}` : '';
  $('#draftWords').textContent = `${countWords($('#draftText').value)} 字`;
  $('#draftState').textContent = d ? '已保存' : '新草稿';
  $('#draftMask').hidden = false;
  setTimeout(() => $('#draftText').focus(), 30);
}

async function persistDraft(silent = false) {
  const text = $('#draftText').value;
  if (!text.trim() && !state.draftId) { toast('草稿是空的', true); return null; }
  const r = await api('/api/drafts', { method: 'POST', body: { id: state.draftId, text, from: (state.current && state.current.slug) || '' } });
  state.draftId = r.id;
  $('#draftState').textContent = '已保存';
  if (r.habit && state.habit) {
    state.habit.today = r.habit.today;
    state.habit.streak = r.habit.streak;
    renderStreak();
  }
  await loadDrafts();
  if (!silent) toast('草稿已存');
  return r;
}

async function deleteDraft(id) {
  if (!id) { $('#draftMask').hidden = true; return; }
  if (!confirm('删除这条草稿？')) return;
  await api('/api/drafts/' + encodeURIComponent(id), { method: 'DELETE' });
  state.draftId = '';
  $('#draftMask').hidden = true;
  await loadDrafts();
  toast('已删除草稿');
}

/** 草稿 → 正式文章：走新建弹窗，正文带过去 */
async function draftToPost() {
  await persistDraft(true);
  const text = $('#draftText').value;
  $('#draftMask').hidden = true;
  const firstLine = text.split(/\r?\n/).find(l => l.trim()) || '';
  $('#nTitle').value = firstLine.replace(/^#+\s*/, '').slice(0, 40);
  $('#nSlug').value = suggestSlug($('#nTitle').value);
  $('#nSlug').dataset.touched = '';
  setSeg($('#nCategory'), '记录');
  $('#newMask').hidden = false;
  $('#newMask').dataset.fromDraft = text;
  setTimeout(() => $('#nTitle').focus(), 30);
}

/** 当前正文 → 存成草稿（不打断写作）；字数已在正文计过分，标记 noCount 防止重复 */
async function articleToDraft() {
  if (!state.current) { toast('先选一篇文章', true); return; }
  const text = state.vditor ? state.vditor.getValue() : '';
  if (!text.trim()) { toast('正文是空的', true); return; }
  await api('/api/drafts', { method: 'POST', body: { text, from: state.current.slug, noCount: true } });
  await loadDrafts();
  toast('已存到草稿箱');
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
    $('#kPosts').textContent = `${state.meta.totalPosts} 篇 · ${state.meta.totalWords} 字`;
    $('#kCommit').textContent = state.meta.lastCommit ? (state.meta.lastCommit.when || '—') : '—';
    $('#kCommit').title = state.meta.lastCommit ? state.meta.lastCommit.subject : '';
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
  /* 后端版本警告条 */
  $('#btnWarnReload')?.addEventListener('click', () => location.reload());
  $('#btnWarnDismiss')?.addEventListener('click', () => { $('#verWarn').hidden = true; });

  /* 左侧导航 */
  $$('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });

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
  $('#btnFocus').addEventListener('click', () => setFocus(!state.focus));
  $('#btnSessionStop').addEventListener('click', () => setFocus(false));
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
  const dirtyFields = ['#title', '#fDate', '#fDescription', '#fPdf', '#fPassword', '#fSlug', '#fNewPostTag'];
  dirtyFields.forEach(sel => {
    $(sel).addEventListener('input', () => { markDirty(); updateUrlPreview(); updateTitleMeta(); });
  });
  $('#fHot').addEventListener('change', markDirty);

  $('#btnToday').addEventListener('click', () => { $('#fDate').value = today(); markDirty(); updateTitleMeta(); });
  $('#btnRename').addEventListener('click', renameArticle);
  $('#btnDuplicate').addEventListener('click', duplicateArticle);
  $('#btnDelete').addEventListener('click', deleteArticle);
  $('#btnToDraft').addEventListener('click', articleToDraft);
  $('#btnReveal').addEventListener('click', async () => {
    if (!state.current) return;
    try { await api('/api/reveal', { method: 'POST', body: { slug: state.current.slug } }); }
    catch (e) { toast(e.message, true); }
  });

  /* 文章标签（发布） */
  $('#btnAddPostTag').addEventListener('click', addPostTag);
  $('#fNewPostTag').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addPostTag(); } });
  $('#fPostTags').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-post-tag]');
    if (!btn) return;
    state.postTags = state.postTags.filter(t => t !== btn.dataset.postTag);
    renderPostTags();
    markDirty();
  });

  /* 标签 */
  $('#btnAddTag').addEventListener('click', addTag);
  $('#fNewTag').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } });
  $('#tagChips').addEventListener('click', (e) => {
    const btn = e.target.closest('.tag');
    if (!btn || !state.current) return;
    const slug = state.current.slug;
    state.tags[slug] = (state.tags[slug] || []).filter(t => t !== btn.dataset.tag);
    saveTags();
    renderTags(slug);
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

  /* 今日面板 */
  $('#btnStartWrite').addEventListener('click', () => {
    switchView('posts');
    if (!state.focus) setFocus(true);
    setTimeout(() => { try { state.vditor.focus(); } catch { /* ignore */ } }, 200);
  });
  $('#cRemind').addEventListener('change', async (e) => {
    state.habit = await api('/api/habit/settings', { method: 'POST', body: { remindersOn: e.target.checked } });
    renderHabit();
    toast(e.target.checked ? `已开启，每天 ${state.habit.remindAt} 提醒（Studio 需保持运行）` : '已关闭提醒');
  });
  $('#fRemindAt').addEventListener('change', async (e) => {
    state.habit = await api('/api/habit/settings', { method: 'POST', body: { remindAt: e.target.value } });
    renderHabit();
  });
  $('#btnRemindTest').addEventListener('click', async () => {
    await api('/api/habit/run-reminder', { method: 'POST', body: {} }).catch(() => {});
    toast('已发送一条测试通知，看右下角');
  });
  $('#btnSaveGoal').addEventListener('click', async () => {
    const v = Number($('#fDailyGoal').value) || 500;
    state.habit = await api('/api/habit/settings', { method: 'POST', body: { dailyGoal: v, sessionGoal: Math.max(50, Math.round(v / 3)) } });
    renderHabit();
    state.lastWords = editorWords();
    toast(`每日目标已设为 ${v} 字`);
  });

  /* 草稿箱 */
  $('#btnNewDraft').addEventListener('click', () => { state.draftId = ''; openDraft(''); });
  $('#draftList').addEventListener('click', (e) => {
    const li = e.target.closest('.draft-item');
    if (li) openDraft(li.dataset.id);
  });
  $('#btnDraftClose').addEventListener('click', () => { $('#draftMask').hidden = true; });
  $('#btnDraftSave').addEventListener('click', () => persistDraft());
  $('#btnDraftDelete').addEventListener('click', () => deleteDraft(state.draftId));
  $('#btnDraftToPost').addEventListener('click', draftToPost);
  $('#draftText').addEventListener('input', () => {
    $('#draftWords').textContent = `${countWords($('#draftText').value)} 字`;
    $('#draftState').textContent = '未保存';
    state.lastInputAt = Date.now();
    clearTimeout(state.draftTimer);
    state.draftTimer = setTimeout(() => { persistDraft(true).catch(() => {}); }, 1500);
  });
  $('#draftMask').addEventListener('click', (e) => {
    if (e.target === $('#draftMask')) {
      if (state.draftId) persistDraft(true).catch(() => {});
      $('#draftMask').hidden = true;
    }
  });

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
  $('#btnNewCreate').addEventListener('click', () => {
    const fromDraft = $('#newMask').dataset.fromDraft || '';
    $('#newMask').dataset.fromDraft = '';
    createArticle(fromDraft).then(async () => {
      if (fromDraft && state.draftId) await deleteDraft(state.draftId).catch(() => {});
    });
  });
  $('#newMask').addEventListener('click', (e) => { if (e.target === $('#newMask')) closeNewModal(); });
  $('#nTitle').addEventListener('input', (e) => {
    if (!$('#nSlug').dataset.touched) $('#nSlug').value = suggestSlug(e.target.value);
  });
  $('#nSlug').addEventListener('input', () => { $('#nSlug').dataset.touched = '1'; });
  $('#nTitle').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#btnNewCreate').click(); });

  /* 快捷键 */
  document.addEventListener('keydown', (e) => {
    const mod = e.ctrlKey || e.metaKey;
    if (e.key === 'Escape') {
      if (state.focus) { setFocus(false); return; }
      if (!$('#draftMask').hidden) { $('#draftMask').hidden = true; return; }
      if (!$('#newMask').hidden) { closeNewModal(); return; }
    }
    if (!mod) return;
    const k = e.key.toLowerCase();
    if (k === 's') { e.preventDefault(); save(); }
    else if (k === 'p' && e.shiftKey) { e.preventDefault(); publish(); }
    else if (k === 'n' && e.shiftKey) { e.preventDefault(); openNewModal(); }
    else if (k === 'f' && e.shiftKey) { e.preventDefault(); setFocus(!state.focus); }
    else if (k === 'd' && e.shiftKey) { e.preventDefault(); articleToDraft(); }
    else if (k === 'k') { e.preventDefault(); switchView('posts'); $('#search').focus(); $('#search').select(); }
  });

  window.addEventListener('beforeunload', (e) => {
    flushHabit(true);
    if (state.dirty) { e.preventDefault(); e.returnValue = ''; }
  });

  window.addEventListener('resize', () => {
    if (state.vditor && state.vditor.resize) { try { state.vditor.resize(); } catch { /* ignore */ } }
  });
}

/* ─────────────────────── 图床（蜜蜂图床） ─────────────────────── */

const ibState = { results: [], busy: false };

function ibStatus(msg, isErr = false) {
  const el = $('#ibStatus');
  if (!el) return;
  el.textContent = msg;
  el.classList.toggle('err', !!isErr);
  el.classList.toggle('ok', !isErr && !!msg && msg !== '—' && !msg.startsWith('正在'));
}

async function loadImgbedConfig() {
  try {
    const c = await api('/api/imgbed/config');
    $('#ibBase').value = c.base || 'https://www.beeimg.cn';
    $('#ibToken').value = '';
    $('#ibToken').placeholder = c.hasToken
      ? `${c.tokenMasked}（已保存，留空则不改动）`
      : '粘贴 Token';
    ibStatus(c.hasToken ? `已保存 Token ${c.tokenMasked}` : '还没填 Token，填完点「保存配置」');
  } catch (e) {
    ibStatus('读取图床配置失败：' + e.message, true);
  }
}

function ibFallbackCopy(text, done) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); done(); }
  catch { toast('复制失败，请手动复制', true); }
  ta.remove();
}

function ibCopy(text, label) {
  const done = () => toast(label + '已复制');
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done).catch(() => ibFallbackCopy(text, done));
  } else {
    ibFallbackCopy(text, done);
  }
}

function renderIbResults() {
  const el = $('#ibResults');
  if (!el) return;
  if (!ibState.results.length) { el.innerHTML = ''; return; }
  el.innerHTML = ibState.results.map((r, i) => `
    <div class="ib-result">
      <img class="ib-thumb" src="${esc(r.url)}" alt="" loading="lazy" />
      <div class="ib-body">
        <div class="ib-name" title="${esc(r.name)}">${esc(r.name)}</div>
        <div class="ib-url mono" title="${esc(r.url)}">${esc(r.url)}</div>
        <div class="ib-actions">
          <button class="btn btn-sm" data-ib="url" data-i="${i}">复制链接</button>
          <button class="btn btn-sm" data-ib="md" data-i="${i}">复制 MD</button>
          <button class="btn btn-sm btn-accent" data-ib="insert" data-i="${i}">插入正文</button>
        </div>
      </div>
    </div>`).join('');
}

async function ibUploadFiles(files) {
  const list = Array.from(files || []).filter(f => f && f.type && f.type.startsWith('image/'));
  if (!list.length) return;
  if (ibState.busy) { toast('正在上传，稍等', true); return; }
  ibState.busy = true;
  const prog = $('#ibProgress');
  prog.hidden = false;
  for (let i = 0; i < list.length; i++) {
    const f = list[i];
    prog.textContent = `上传中 ${i + 1}/${list.length} · ${f.name}`;
    try {
      const buf = await f.arrayBuffer();
      const res = await fetch('/api/imgbed/upload?name=' + encodeURIComponent(f.name || 'image.png'), {
        method: 'POST',
        headers: { 'X-Studio': '1', 'Content-Type': 'application/octet-stream' },
        body: buf,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '上传失败');
      if (!json.ok) throw new Error(json.message || '上传失败');
      ibState.results.unshift({ ...json, name: f.name });
      renderIbResults();
      toast('已上传：' + f.name);
    } catch (e) {
      ibStatus('上传失败：' + e.message, true);
    }
  }
  prog.hidden = true;
  prog.textContent = '';
  ibState.busy = false;
  $('#ibFile').value = '';
}

/* 图床事件独立绑定，不碰原有逻辑 */
(function bindImgbed() {
  const drop = $('#ibDrop');
  const fileInput = $('#ibFile');
  if (!drop || !fileInput) return;

  drop.addEventListener('click', () => fileInput.click());
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('drag'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('drag'));
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    drop.classList.remove('drag');
    ibUploadFiles(e.dataTransfer.files);
  });
  fileInput.addEventListener('change', (e) => ibUploadFiles(e.target.files));

  $('#ibToggle').addEventListener('click', (e) => {
    const input = $('#ibToken');
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    e.target.textContent = show ? '隐藏' : '显示';
  });

  $('#ibSave').addEventListener('click', async () => {
    const patch = { base: $('#ibBase').value.trim() || 'https://www.beeimg.cn' };
    const t = $('#ibToken').value.trim();
    if (t) patch.token = t;
    try {
      const c = await api('/api/imgbed/config', { method: 'POST', body: patch });
      $('#ibToken').value = '';
      $('#ibToken').placeholder = c.hasToken
        ? `${c.tokenMasked}（已保存，留空则不改动）`
        : '粘贴 Token';
      ibStatus(c.hasToken ? `已保存 · ${c.tokenMasked}` : '配置已保存');
      toast('图床配置已保存');
    } catch (e) {
      ibStatus(e.message, true);
    }
  });

  $('#ibCheck').addEventListener('click', async () => {
    ibStatus('正在连接图床…');
    try {
      const r = await api('/api/imgbed/check', { method: 'POST', body: {} });
      ibStatus(r.message || (r.ok ? '连接正常' : '连接失败'), !r.ok);
    } catch (e) {
      ibStatus(e.message, true);
    }
  });

  $('#ibResults').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-ib]');
    if (!btn) return;
    const r = ibState.results[Number(btn.dataset.i)];
    if (!r) return;
    const kind = btn.dataset.ib;
    if (kind === 'url') ibCopy(r.url, '链接');
    else if (kind === 'md') ibCopy(r.markdown, 'Markdown');
    else if (kind === 'insert') {
      if (!state.current) { toast('先打开一篇文章再插入', true); return; }
      if (!state.vditor) return;
      state.vditor.insertValue(`\n${r.markdown}\n`);
      state.lastInputAt = Date.now();
      markDirty();
      toast('已插入正文');
    }
  });
})();

/* ─────────────────────── 启动 ─────────────────────── */

(async function boot() {
  window.addEventListener('error', (e) => toast('页面脚本错误: ' + (e.message || 'unknown'), true));
  initTheme();
  loadTags();
  bindEvents();
  await initVditor();
  await refreshEnv();

  renderMetaSegs();
  const cats = state.meta ? state.meta.categories : ['记录', '文学', '理论', '学习', '生活', '评论'];
  renderSeg($('#nCategory'), cats.map(c => ({ v: c, t: c })), () => {});
  setSeg($('#nCategory'), '记录');

  await loadPosts();
  checkBackendVersion();
  await loadHabit();
  loadDrafts().catch(() => {});
  loadImgbedConfig().catch(() => {});

  const last = localStorage.getItem('studio-last');
  const target = state.posts.find(p => p.slug === last) || state.posts[0];
  if (target) await openArticle(target.slug, { force: true });
  else $('#empty').hidden = false;

  startHabitTicker();
  applyTheme(document.documentElement.getAttribute('data-theme'));
})();
