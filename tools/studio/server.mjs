#!/usr/bin/env node
/**
 * Guiyihan Studio · 本地写作工作台
 * ---------------------------------------------------------------
 * 纯 Node 内置模块实现，零依赖。绑定 127.0.0.1，只在本机跑。
 *
 *   node tools/studio/server.mjs
 *   或双击同目录下的 start.cmd
 *
 * 分两大块：
 *   /api/posts…   文章读写（写的就是 src/content/posts/*.md）
 *   /api/habit…   写作习惯（每日目标 / 打卡 / 草稿箱 / 定时提醒）
 * ---------------------------------------------------------------
 */
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const PUBLIC_DIR = path.join(__dirname, 'public');
const VENDOR_DIR = path.join(__dirname, 'vendor');
const POSTS_DIR = path.join(ROOT, 'src', 'content', 'posts');
const UPLOAD_DIR = path.join(ROOT, 'public', 'uploads');
const ENCRYPTED_DIR = path.join(ROOT, 'public', 'encrypted');
const ARTICLES_JSON = path.join(ROOT, 'src', 'data', 'articles.json');
const CONFIG_FILE = path.join(__dirname, '.studio.json');
const HABIT_FILE = path.join(__dirname, '.studio-habit.json');
const DRAFT_DIR = path.join(__dirname, 'drafts');
const PORT = Number(process.env.STUDIO_PORT || 7788);
const HOST = '0.0.0.0';

const CATEGORIES = ['记录', '文学', '理论', '学习', '生活', '评论'];
const TYPES = ['article', 'resource', 'page'];
const ORIGINS = ['original', 'repost'];
const ACCESSES = ['public', 'protected'];

/* ══════════════════════════ 运行时探测 ══════════════════════════ */

/**
 * 在 PATH 里找可执行文件。
 * 不用 `where`：Windows 下 where 按 OEM 代码页输出，中文用户名会被打乱，
 * 拼出来的路径直接 ENOENT。这里改成扫 process.env.PATH + existsSync。
 */
function which(name) {
  const isWin = process.platform === 'win32';
  const dirs = String(process.env.PATH || process.env.Path || '')
    .split(path.delimiter)
    .map(d => d.trim().replace(/^"|"$/g, ''))
    .filter(Boolean);

  const exts = isWin ? ['.exe'] : [''];

  for (const dir of dirs) {
    for (const ext of exts) {
      const candidate = path.join(dir, name + ext);
      try { if (fs.existsSync(candidate)) return candidate; } catch { /* ignore */ }
    }
  }

  // 常见安装位置的兜底（bun 默认装在用户目录下）
  if (isWin) {
    const guesses = [
      path.join(process.env.USERPROFILE || '', '.bun', 'bin', `${name}.exe`),
      path.join(process.env.LOCALAPPDATA || '', 'Programs', name, `${name}.exe`),
      path.join('C:\\Program Files\\Git\\cmd', `${name}.exe`),
      path.join('C:\\Program Files\\Git\\bin', `${name}.exe`),
      path.join('C:\\Program Files', name, `${name}.exe`),
    ];
    for (const g of guesses) {
      try { if (fs.existsSync(g)) return g; } catch { /* ignore */ }
    }
  }
  return null;
}

const BUN = which('bun');
const GIT = which('git');
const NODE = process.execPath;
const ASTRO_BIN = path.join(ROOT, 'node_modules', 'astro', 'astro.js');
const TSX_BIN = path.join(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const HAS_MODULES = fs.existsSync(ASTRO_BIN);

/** 统一的命令解析：bun 优先，缺失时退回 node 直跑入口文件 */
function cmd(task) {
  if (task === 'encrypt') {
    return BUN ? [BUN, ['run', 'encrypt']] : [NODE, [TSX_BIN, 'scripts/encrypt-content.ts']];
  }
  if (task === 'build') {
    return BUN ? [BUN, ['run', 'build']] : [NODE, [ASTRO_BIN, 'build']];
  }
  if (task === 'dev') {
    return BUN ? [BUN, ['run', 'dev']] : [NODE, [ASTRO_BIN, 'dev']];
  }
  throw new Error('未知任务: ' + task);
}

/* ══════════════════════════ Frontmatter ══════════════════════════ */

const FM_RE = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*\r?\n?([\s\S]*)$/;
const FM_RE_FENCE = /^```\r?\n([\s\S]*?)\r?\n```[ \t]*\r?\n?([\s\S]*)$/;

function unquote(v) {
  const s = v.trim();
  if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) {
    return s.slice(1, -1).replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  }
  if (s.length >= 2 && s.startsWith("'") && s.endsWith("'")) {
    return s.slice(1, -1).replace(/''/g, "'");
  }
  return s;
}

function parseFrontmatter(raw) {
  let m = raw.match(FM_RE);
  // 容错：个别文件误用 ``` 当 frontmatter 围栏（Astro 会报 schema 错误）
  if (!m) {
    const alt = raw.match(FM_RE_FENCE);
    if (alt && /^\s*(title|date)\s*:/m.test(alt[1])) m = alt;
  }
  if (!m) return { meta: {}, body: raw };

  const meta = {};
  for (const line of m[1].split(/\r?\n/)) {
    if (!line.trim() || /^\s*#/.test(line)) continue;
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const val = line.slice(idx + 1).trim();

    if (val.startsWith('[') && val.endsWith(']')) {
      const inner = val.slice(1, -1).trim();
      meta[key] = inner ? inner.split(',').map(s => unquote(s)) : [];
    } else if (val === 'true') {
      meta[key] = true;
    } else if (val === 'false') {
      meta[key] = false;
    } else if (val === '' || val === 'null' || val === '~') {
      meta[key] = '';
    } else {
      meta[key] = unquote(val);
    }
  }
  return { meta, body: m[2] };
}

/** 字符串落到 YAML 时是否需要引号（防止 114514 被当数字、是的被当布尔） */
function yamlScalar(s) {
  if (s === '') return '""';
  const needsQuote =
    /^(true|false|null|undefined|yes|no|on|off|~)$/i.test(s) ||
    /^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s) ||
    /^[-?:,\[\]{}#&*!|>'"%@`]/.test(s) ||
    /:\s|\s#/.test(s) ||
    /[\r\n]/.test(s) ||
    /^\s|\s$/.test(s) ||
    s.includes('"') || s.includes('\\');
  if (!needsQuote) return s;
  return '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, '\\n') + '"';
}

/**
 * frontmatter 键位顺序。不在表里的键（比如作者自己加的 series、cover）
 * 按原顺序原样保留在最后 —— 早期的实现只写 FIELD_ORDER 里的字段，
 * 保存一次就会把别的字段整段吃掉。
 */
const FIELD_ORDER = ['title', 'date', 'category', 'description', 'tags', 'type', 'origin', 'access', 'password', 'hot', 'pdf'];

function formatYamlValue(key, v) {
  if (key === 'hot') return v === true ? 'true' : 'false';
  if (Array.isArray(v)) return '[' + v.map(x => yamlScalar(String(x))).join(', ') + ']';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  return yamlScalar(String(v));
}

function buildFrontmatter(meta, keepKeys = null) {
  const lines = ['---'];
  const done = new Set();
  // keepKeys = 原文件里已经存在的键；这些即使是默认值也要留着，不能悄悄删掉
  const inFile = keepKeys || new Set();

  const emit = (key) => {
    if (done.has(key)) return;
    const v = meta[key];
    if (v === undefined || v === null || v === '') return;
    if (Array.isArray(v) && v.length === 0) return;
    if (key === 'hot' && v !== true) return;
    // 新建文章时默认值不写进文件，保持作者的极简风格；
    // 但已有文件里写了的字段要原样保留，否则保存一次就少一行。
    if (!inFile.has(key)) {
      if (key === 'type' && v === 'article') return;
      if (key === 'origin' && v === 'original') return;
      if (key === 'access' && v === 'public') return;
    }
    done.add(key);
    lines.push(`${key}: ${formatYamlValue(key, v)}`);
  };
  for (const key of FIELD_ORDER) emit(key);
  for (const key of Object.keys(meta)) {
    if (FIELD_ORDER.includes(key) || key === 'slug') continue;
    emit(key);
  }

  lines.push('---');
  return lines.join('\n');
}

/** 正文归一化：去掉首尾多余空行，避免每次保存都多出一行 */
function cleanBody(body) {
  return String(body == null ? '' : body)
    .replace(/^\s*\r?\n/, '')
    .replace(/[\s\uFEFF\xA0]+$/, '');
}

function composeMarkdown(meta, body, { trailingNewline = true, keepKeys = null } = {}) {
  return buildFrontmatter(meta, keepKeys) + '\n\n' + cleanBody(body) + (trailingNewline ? '\n' : '');
}

/** 把前端来的日期规整成 YYYY-MM-DD（用于排序/展示），写回磁盘时另走 formatStoredDate */
function normalizeDate(v) {
  const s = String(v || '').trim();
  const m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return localDate();
}

/**
 * 写回文件时用的日期串。
 * 作者原来的写法是 2026-9-11 这种不补零的，如果每次保存都改成 2026-09-11，
 * 就会平白产生一条 diff —— 同一天就沿用原写法，改天才用标准写法。
 */
function formatStoredDate(input, original) {
  const next = String(input || '').trim();
  const prev = String(original || '').trim();
  if (prev && normalizeDate(prev) === normalizeDate(next)) return prev;
  return normalizeDate(next);
}

/** 本地日期（不能用 toISOString，UTC+8 凌晨会串到前一天） */
function localDate(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function countWords(body) {
  const text = String(body || '').replace(/```[\s\S]*?```/g, ' ').replace(/`[^`]*`/g, ' ');
  const cjk = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
  const en = (text.match(/[A-Za-z0-9]+/g) || []).length;
  return cjk + en;
}

/** 把磁盘上的 .md 归一化成前端要的结构 */
function toArticle(slug, raw, stat) {
  const { meta, body } = parseFrontmatter(raw);
  const clean = cleanBody(body);
  return {
    slug,
    title: String(meta.title || slug),
    date: normalizeDate(meta.date || ''),
    category: String(meta.category || '记录'),
    description: String(meta.description || ''),
    tags: Array.isArray(meta.tags) ? meta.tags.map(String) : [],
    type: String(meta.type || 'article'),
    origin: String(meta.origin || 'original'),
    access: String(meta.access || 'public'),
    hot: meta.hot === true,
    pdf: String(meta.pdf || ''),
    password: String(meta.password || ''),
    body: clean,
    // 原文件换行风格：保存时照原样还原，git diff 才干净
    eol: raw.includes('\r\n') ? '\r\n' : '\n',
    words: countWords(clean),
    mtime: stat ? Math.round(stat.mtimeMs) : 0,
    size: stat ? stat.size : Buffer.byteLength(raw, 'utf8'),
  };
}

async function listArticles() {
  await fsp.mkdir(POSTS_DIR, { recursive: true });
  const files = (await fsp.readdir(POSTS_DIR)).filter(f => f.endsWith('.md'));
  const out = [];
  for (const f of files) {
    const full = path.join(POSTS_DIR, f);
    const stat = await fsp.stat(full);
    const raw = await fsp.readFile(full, 'utf8');
    out.push(toArticle(path.basename(f, '.md'), raw, stat));
  }
  out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.mtime - b.mtime));
  return out;
}

function assertSlug(slug) {
  if (!slug || !/^[\p{L}\p{N}_\-.]+$/u.test(slug)) {
    throw Object.assign(new Error('文件名只能包含字母、数字、下划线、连字符和点'), { code: 400 });
  }
  if (slug.startsWith('.') || slug.includes('/') || slug.includes('\\')) {
    throw Object.assign(new Error('文件名不能以点开头，也不能包含路径分隔符'), { code: 400 });
  }
}

/* ══════════════════════════ 简单配置 ══════════════════════════ */

const DEFAULT_CONFIG = {
  commitTemplate: 'post: 更新文章 {title}',
  autoBuild: true,
  autoEncrypt: true,
};

function readConfig() {
  try {
    return { ...DEFAULT_CONFIG, ...JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

function writeConfig(patch) {
  const next = { ...readConfig(), ...patch };
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(next, null, 2), 'utf8');
  return next;
}

/* ══════════════════════════ 写作习惯数据 ══════════════════════════ */

const DEFAULT_HABIT = {
  dailyGoal: 500,        // 每天目标字数
  sessionGoal: 200,      // 一次写作冲刺的目标字数
  remindAt: '21:00',     // 每日提醒时间（HH:MM，空字符串表示关闭）
  remindersOn: false,
  startedAt: '',         // 养成计划起始日
  activeMs: 0,           // 累计有效写作时长（毫秒）
  lastWriteDate: '',
  lastNotifyDate: '',
  days: {},              // { 'YYYY-MM-DD': { words, focused, edits } }
  notes: '',             // 一句话备忘/心情
};

function readHabit() {
  try {
    const raw = JSON.parse(fs.readFileSync(HABIT_FILE, 'utf8'));
    return { ...DEFAULT_HABIT, ...raw, days: raw.days && typeof raw.days === 'object' ? raw.days : {} };
  } catch {
    return { ...DEFAULT_HABIT, days: {} };
  }
}

function writeHabit(next) {
  fs.writeFileSync(HABIT_FILE, JSON.stringify(next, null, 2), 'utf8');
  return next;
}

function habitDay(habit, date) {
  if (!habit.days[date]) habit.days[date] = { words: 0, focused: 0, edits: 0, slots: {} };
  if (!habit.days[date].slots) habit.days[date].slots = {};
  return habit.days[date];
}

/**
 * 把 N 个字记到今天，归入指定分类（正文用文章分类，草稿箱记「草稿」）。
 * slots 就是按分类拆分的字数 —— 热力图的颜色用它决定「这天主要写在哪一区」。
 */
function logWords(amount, category = '') {
  const add = Math.max(0, Math.min(50000, Math.round(Number(amount) || 0)));
  if (!add) return habitSummary();
  const habit = readHabit();
  const key = localDate();
  const day = habitDay(habit, key);
  const cat = CATEGORIES.includes(category) || category === '草稿' ? category : '其他';
  day.words = Math.round(day.words + add);
  day.edits = (day.edits || 0) + 1;
  day.slots[cat] = Math.round((day.slots[cat] || 0) + add);
  habit.lastWriteDate = key;
  if (!habit.startedAt) habit.startedAt = key;
  writeHabit(habit);
  return habitSummary();
}

/** 热力图数据：最近 N 周（列=周，行=周日～周六），peak = 当天写得最多的分类 */
function heatData(habit, weeks = 14) {
  const out = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  // 从「今天所在周的周日」往回推 weeks 周，网格起点必是周日
  const start = new Date(today);
  start.setDate(start.getDate() - start.getDay() - (weeks - 1) * 7);
  for (let i = 0; i < weeks * 7; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    const key = localDate(d);
    const day = habit.days[key];
    const slots = day?.slots || {};
    let peak = '', peakWords = 0;
    for (const [cat, w] of Object.entries(slots)) {
      if (w > peakWords) { peakWords = w; peak = cat; }
    }
    out.push({
      date: key,
      words: day?.words || 0,
      focused: day?.focused || 0,
      peak, // '' 表示当天没写
      future: d > today,
    });
  }
  return out;
}

/** 连续达标天数：7 天内断更可续（只要断档不超过 6 天，接着往前数） */
function calcStreak(habit) {
  const goal = Math.max(1, Number(habit.dailyGoal) || 1);
  const GRACE = 7; // 距上次达标不超过 7 天就算延续
  let streak = 0;
  let lastHit = null;
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  // 今天还没达标不算断，从昨天接着数
  if ((habit.days[localDate(d)]?.words || 0) < goal) d.setDate(d.getDate() - 1);
  for (let i = 0; i < 4000; i++) {
    const key = localDate(d);
    if ((habit.days[key]?.words || 0) >= goal) {
      if (lastHit) {
        const gap = Math.round((lastHit - d) / 86400000);
        if (gap > GRACE) break;
      }
      streak++;
      lastHit = new Date(d);
    } else if (lastHit) {
      const gap = Math.round((lastHit - d) / 86400000);
      if (gap > GRACE) break;
    }
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

function calcLongest(habit) {
  const goal = Math.max(1, Number(habit.dailyGoal) || 1);
  const keys = Object.keys(habit.days).sort();
  let best = 0, cur = 0, prev = null;
  for (const k of keys) {
    const ok = (habit.days[k].words || 0) >= goal;
    if (!ok) { cur = 0; prev = k; continue; }
    const d = new Date(k + 'T00:00:00');
    if (prev) {
      const p = new Date(prev + 'T00:00:00');
      const gap = Math.round((d - p) / 86400000);
      cur = gap === 1 ? cur + 1 : 1;
    } else cur = 1;
    best = Math.max(best, cur);
    prev = k;
  }
  return best;
}

function habitSummary() {
  const habit = readHabit();
  const todayKey = localDate();
  const day = habit.days[todayKey] || { words: 0, focused: 0, edits: 0 };
  const goal = Math.max(1, Number(habit.dailyGoal) || 1);

  // 最近 7 天（含今天）
  const week = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    const key = localDate(d);
    week.push({ date: key, words: habit.days[key]?.words || 0, focused: habit.days[key]?.focused || 0 });
  }

  // 累计
  let totalWords = 0, totalDays = 0;
  for (const k of Object.keys(habit.days)) {
    const w = habit.days[k].words || 0;
    totalWords += w;
    if (w > 0) totalDays++;
  }

  // 近 30 天打卡率
  let hit = 0;
  for (let i = 0; i < 30; i++) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    if ((habit.days[localDate(d)]?.words || 0) >= goal) hit++;
  }

  return {
    ...habit,
    today: { date: todayKey, words: day.words || 0, focused: day.focused || 0, goal, done: (day.words || 0) >= goal },
    week,
    heat: heatData(habit),
    streak: calcStreak(habit),
    longest: calcLongest(habit),
    totalWords,
    totalDays,
    rate30: Math.round((hit / 30) * 100),
  };
}

/* ══════════════════════════ 草稿箱 ══════════════════════════ */

async function ensureDraftDir() {
  await fsp.mkdir(DRAFT_DIR, { recursive: true });
}

async function listDrafts() {
  await ensureDraftDir();
  const files = (await fsp.readdir(DRAFT_DIR)).filter(f => f.endsWith('.json'));
  const out = [];
  for (const f of files) {
    try {
      const d = JSON.parse(await fsp.readFile(path.join(DRAFT_DIR, f), 'utf8'));
      out.push({
        id: d.id || path.basename(f, '.json'),
        text: d.text || '',
        words: countWords(d.text),
        from: d.from || '',
        updatedAt: d.updatedAt || 0,
      });
    } catch { /* 坏文件跳过 */ }
  }
  out.sort((a, b) => b.updatedAt - a.updatedAt);
  return out;
}

async function saveDraft(body) {
  await ensureDraftDir();
  const rawId = String(body.id || '').trim();
  const id = /^[a-z0-9\-]{6,40}$/i.test(rawId) ? rawId : `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const data = {
    id,
    text: String(body.text || ''),
    from: String(body.from || '').slice(0, 80),
    updatedAt: Date.now(),
  };
  await fsp.writeFile(path.join(DRAFT_DIR, `${id}.json`), JSON.stringify(data, null, 2), 'utf8');
  return data;
}

async function deleteDraft(id) {
  if (!/^[a-z0-9\-]{6,40}$/i.test(String(id || ''))) {
    throw Object.assign(new Error('草稿 id 非法'), { code: 400 });
  }
  const p = path.join(DRAFT_DIR, `${id}.json`);
  if (fs.existsSync(p)) await fsp.unlink(p);
  return { ok: true };
}

/* ══════════════════════════ 进程执行 ══════════════════════════ */

function run(exe, args, log, { cwd = ROOT } = {}) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(exe, args, { cwd, windowsHide: true, env: process.env });
    } catch (e) {
      log(`✗ 无法启动 ${exe}: ${e.message}`);
      return resolve(-1);
    }
    const flush = (buf) => {
      String(buf.toString('utf8')).split(/\r?\n/).forEach(l => {
        if (l.trim()) log(l.replace(/\x1b\[[0-9;]*m/g, ''));
      });
    };
    child.stdout?.on('data', flush);
    child.stderr?.on('data', flush);
    child.on('error', (e) => {
      log(`✗ 启动失败: ${e.message}`);
      resolve(-1);
    });
    child.on('close', (code) => resolve(code ?? -1));
  });
}

async function gitStatusPorcelain() {
  if (!GIT) return '';
  const r = spawnSync(GIT, ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf8', windowsHide: true });
  return r.status === 0 ? String(r.stdout || '').trim() : '';
}

function gitBranch() {
  if (!GIT) return 'main';
  const r = spawnSync(GIT, ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: ROOT, encoding: 'utf8', windowsHide: true });
  return r.status === 0 ? String(r.stdout || '').trim() || 'main' : 'main';
}

function gitLastCommit() {
  if (!GIT) return null;
  const r = spawnSync(GIT, ['log', '-1', '--pretty=%s§%cr'], { cwd: ROOT, encoding: 'utf8', windowsHide: true });
  if (r.status !== 0) return null;
  const [subject, when] = String(r.stdout || '').trim().split('§');
  return { subject: subject || '', when: when || '' };
}

/* ══════════════════════════ 本地预览进程 ══════════════════════════ */

let previewProc = null;
let previewLog = [];

function startPreview() {
  if (previewProc) return { running: true, port: 4321, pid: previewProc.pid };
  const [exe, args] = cmd('dev');
  previewLog = ['▶ 启动 astro dev …'];
  previewProc = spawn(exe, args, {
    cwd: ROOT,
    windowsHide: true,
    env: { ...process.env, FORCE_COLOR: '0' },
  });
  const push = (b) => {
    String(b.toString('utf8')).split(/\r?\n/).forEach(l => {
      const line = l.replace(/\x1b\[[0-9;]*m/g, '').trimEnd();
      if (line) { previewLog.push(line); if (previewLog.length > 200) previewLog.shift(); }
    });
  };
  previewProc.stdout?.on('data', push);
  previewProc.stderr?.on('data', push);
  previewProc.on('close', (code) => {
    previewLog.push(`■ 预览已退出（${code}）`);
    previewProc = null;
  });
  previewProc.on('error', (e) => { previewLog.push('✗ ' + e.message); previewProc = null; });
  return { running: true, port: 4321, pid: previewProc.pid };
}

function stopPreview() {
  if (!previewProc) return { running: false };
  const pid = previewProc.pid;
  try {
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true });
    } else {
      process.kill(pid, 'SIGTERM');
    }
  } catch { /* ignore */ }
  previewProc = null;
  return { running: false };
}

/* ══════════════════════════ HTTP 工具 ══════════════════════════ */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.wasm': 'application/wasm',
  '.mp3': 'audio/mpeg',
};

function sendJson(res, code, data) {
  const body = JSON.stringify(data);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function fail(res, code, msg) {
  sendJson(res, code, { error: msg });
}

async function readBody(req, limit = 32 * 1024 * 1024) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > limit) throw Object.assign(new Error('请求体过大'), { code: 413 });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function readJson(req) {
  const buf = await readBody(req);
  if (!buf.length) return {};
  return JSON.parse(buf.toString('utf8'));
}

async function serveStatic(res, absPath) {
  try {
    const stat = await fsp.stat(absPath);
    if (!stat.isFile()) return false;
    const ext = path.extname(absPath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': stat.size,
      'Cache-Control': 'no-cache',
    });
    fs.createReadStream(absPath).pipe(res);
    return true;
  } catch {
    return false;
  }
}

/** 把 URL 路径安全地映射到磁盘路径，防止 ../ 逃逸 */
function safeJoin(base, rel) {
  const target = path.resolve(base, '.' + path.posix.normalize('/' + rel));
  return target.startsWith(path.resolve(base)) ? target : null;
}

/* ══════════════════════════ 发布流水线 ══════════════════════════ */

async function publishFlow(log, { message, skipBuild }) {
  const steps = [];
  const config = readConfig();
  if (config.autoEncrypt) steps.push('encrypt');
  if (!skipBuild && config.autoBuild) steps.push('build');
  steps.push('git');

  let i = 0;
  const total = steps.length;

  for (const step of steps) {
    i++;
    if (step === 'encrypt') {
      log(`\n▶ [${i}/${total}] 生成索引与加密受保护文章 …`);
      const [exe, args] = cmd('encrypt');
      const code = await run(exe, args, log);
      if (code !== 0) { log(`\n✗ 加密/索引生成失败（退出码 ${code}），已中断。`); return { ok: false, step: 'encrypt' }; }
      continue;
    }
    if (step === 'build') {
      log(`\n▶ [${i}/${total}] 构建站点（astro build）…`);
      const [exe, args] = cmd('build');
      const code = await run(exe, args, log);
      if (code !== 0) { log(`\n✗ 构建失败（退出码 ${code}），已中断，未提交。`); return { ok: false, step: 'build' }; }
      continue;
    }
    // git
    log(`\n▶ [${i}/${total}] 提交并推送 …`);
    if (!GIT) { log('✗ 未找到 git，请先安装 Git 并加入 PATH。'); return { ok: false, step: 'git' }; }

    const dirty = await gitStatusPorcelain();
    if (!dirty) {
      log('· 工作区没有变化，跳过提交。');
      return { ok: true, step: 'git', committed: false };
    }
    log(dirty.split('\n').map(l => '  ' + l).join('\n'));

    let code = await run(GIT, ['add', '-A'], log);
    if (code !== 0) { log('✗ git add 失败'); return { ok: false, step: 'git' }; }

    const msg = (message || '').trim() || 'post: 更新文章';
    code = await run(GIT, ['commit', '-m', msg], log);
    if (code !== 0) { log('✗ git commit 失败'); return { ok: false, step: 'git' }; }

    const branch = gitBranch();
    code = await run(GIT, ['push', 'origin', branch], log);
    if (code !== 0) { log('✗ git push 失败（检查网络 / 凭据）'); return { ok: false, step: 'git' }; }

    log(`\n✓ 已推送到 origin/${branch}，GitHub Actions 会自动构建部署。`);
    return { ok: true, step: 'git', committed: true };
  }
  return { ok: true };
}

/* ══════════════════════════ 路由 ══════════════════════════ */

async function handleApi(req, res, url) {
  const parts = url.pathname.split('/').filter(Boolean); // ['api', 'posts', ':slug']
  const method = req.method || 'GET';
  const seg = parts[1];
  const id = decodeURIComponent(parts[2] || '');

  /* ---- 元信息 ---- */
  if (seg === 'meta' && method === 'GET') {
    const posts = await listArticles();
    return sendJson(res, 200, {
      root: ROOT,
      port: PORT,
      bun: BUN,
      git: GIT,
      hasModules: HAS_MODULES,
      branch: gitBranch(),
      lastCommit: gitLastCommit(),
      categories: CATEGORIES,
      types: TYPES,
      origins: ORIGINS,
      accesses: ACCESSES,
      totalPosts: posts.length,
      totalWords: posts.reduce((s, p) => s + p.words, 0),
      protectedFiles: fs.existsSync(ENCRYPTED_DIR) ? (await fsp.readdir(ENCRYPTED_DIR)).filter(f => f.endsWith('.json')).length : 0,
      hasIndex: fs.existsSync(ARTICLES_JSON),
      preview: { running: !!previewProc, port: 4321 },
      config: readConfig(),
    });
  }

  /* ---- 配置 ---- */
  if (seg === 'config') {
    if (method === 'GET') return sendJson(res, 200, readConfig());
    if (method === 'POST') {
      const body = await readJson(req);
      return sendJson(res, 200, writeConfig(body || {}));
    }
  }

  /* ---- 写作习惯 ---- */
  if (seg === 'habit') {
    const action = parts[2] || '';

    if (!action && method === 'GET') return sendJson(res, 200, habitSummary());

    if (action === 'settings' && method === 'POST') {
      const body = await readJson(req);
      const habit = readHabit();
      if (body.dailyGoal !== undefined) habit.dailyGoal = Math.max(50, Math.min(20000, Number(body.dailyGoal) || 500));
      if (body.sessionGoal !== undefined) habit.sessionGoal = Math.max(50, Math.min(5000, Number(body.sessionGoal) || 200));
      if (body.remindAt !== undefined) {
        const t = String(body.remindAt || '').trim();
        habit.remindAt = /^\d{1,2}:\d{2}$/.test(t) ? t : '';
      }
      if (body.remindersOn !== undefined) habit.remindersOn = !!body.remindersOn;
      if (body.notes !== undefined) habit.notes = String(body.notes || '').slice(0, 300);
      if (!habit.startedAt) habit.startedAt = localDate();
      writeHabit(habit);
      return sendJson(res, 200, habitSummary());
    }

    if (action === 'log' && method === 'POST') {
      const body = await readJson(req);
      // words 兼容两种传法：数字（不分区），或 { 分类: 字数 } 拆分表
      if (body.cats && typeof body.cats === 'object') {
        for (const [cat, w] of Object.entries(body.cats)) logWords(w, cat);
      } else {
        logWords(body.words, body.category);
      }
      const minutes = Math.max(0, Math.min(600, Number(body.focused) || 0));
      if (minutes > 0) {
        const habit = readHabit();
        const key = localDate();
        const day = habitDay(habit, key);
        day.focused = Math.round((day.focused || 0) + minutes);
        habit.activeMs = (habit.activeMs || 0) + minutes * 60000;
        writeHabit(habit);
        return sendJson(res, 200, habitSummary());
      }
      return sendJson(res, 200, habitSummary());
    }

    if (action === 'reset-today' && method === 'POST') {
      const habit = readHabit();
      delete habit.days[localDate()];
      writeHabit(habit);
      return sendJson(res, 200, habitSummary());
    }

    if (action === 'run-reminder' && method === 'POST') {
      const h = habitSummary();
      const goal = h.today.goal;
      const words = h.today.words;
      const ok = notify(
        words >= goal ? '今天的写作目标已达成了 ✓' : '该写点东西了',
        words >= goal
          ? `今天写了 ${words} 字，连续 ${h.streak} 天。`
          : `今天写了 ${words} / ${goal} 字，回 Studio 写 10 分钟。`,
      );
      return sendJson(res, 200, { ok, notified: ok });
    }
  }

  /* ---- 草稿箱 ---- */
  if (seg === 'drafts') {
    if (!id) {
      if (method === 'GET') return sendJson(res, 200, await listDrafts());
      if (method === 'POST') {
        const body = await readJson(req);
        // 草稿字数也计入每日写作：按净增量记（改字、删字会互相抵消）
        const rawId = String(body.id || '').trim();
        let before = 0;
        if (/^[a-z0-9\-]{6,40}$/i.test(rawId)) {
          try {
            const prev = JSON.parse(await fsp.readFile(path.join(DRAFT_DIR, `${rawId}.json`), 'utf8'));
            before = countWords(prev.text);
          } catch { /* 新草稿 */ }
        }
        const d = await saveDraft(body || {});
        const delta = countWords(d.text) - before;
        let habitToday = null;
        // noCount：从文章转存过来的草稿，字数已经在正文里计过，不能重复算
        if (delta > 0 && !body.noCount) habitToday = logWords(delta, '草稿');
        return sendJson(res, 200, {
          ok: true, id: d.id, updatedAt: d.updatedAt, words: countWords(d.text),
          habit: habitToday ? { today: habitToday.today, streak: habitToday.streak } : null,
        });
      }
    }
    if (id && method === 'DELETE') return sendJson(res, 200, await deleteDraft(id));
  }

  /* ---- 文章列表 ---- */
  if (seg === 'posts' && !id) {
    if (method === 'GET') return sendJson(res, 200, await listArticles());
    if (method === 'POST') {
      const body = await readJson(req);
      const slug = String(body.slug || '').trim();
      assertSlug(slug);
      const target = path.join(POSTS_DIR, `${slug}.md`);
      if (fs.existsSync(target)) return fail(res, 409, `已存在同名文章：${slug}.md`);

      const meta = sanitizeMeta(body);
      meta.date = normalizeDate(meta.date);
      const md = composeMarkdown(meta, body.body);
      await fsp.mkdir(POSTS_DIR, { recursive: true });
      await fsp.writeFile(target, md, 'utf8');
      return sendJson(res, 200, { ok: true, slug });
    }
  }

  /* ---- 单篇文章 ---- */
  if (seg === 'posts' && id) {
    assertSlug(id);
    const target = path.join(POSTS_DIR, `${id}.md`);

    if (parts[3] === 'duplicate' && method === 'POST') {
      const body = await readJson(req);
      const next = String(body.slug || '').trim();
      assertSlug(next);
      const dest = path.join(POSTS_DIR, `${next}.md`);
      if (fs.existsSync(dest)) return fail(res, 409, `已存在同名文章：${next}.md`);
      if (!fs.existsSync(target)) return fail(res, 404, '源文章不存在');
      let raw = await fsp.readFile(target, 'utf8');
      const { meta, body: bd } = parseFrontmatter(raw);
      raw = composeMarkdown({ ...meta, date: localDate() }, bd);
      await fsp.writeFile(dest, raw, 'utf8');
      return sendJson(res, 200, { ok: true, slug: next });
    }

    if (method === 'GET') {
      if (!fs.existsSync(target)) return fail(res, 404, '文章不存在');
      const stat = await fsp.stat(target);
      return sendJson(res, 200, toArticle(id, await fsp.readFile(target, 'utf8'), stat));
    }

    if (method === 'PUT') {
      if (!fs.existsSync(target)) return fail(res, 404, '文章不存在');
      const body = await readJson(req);
      const prevRaw = await fsp.readFile(target, 'utf8');
      const prev = parseFrontmatter(prevRaw);

      const meta = sanitizeMeta(body);
      meta.date = formatStoredDate(body.date, prev.meta.date);
      // 作者自己加的 frontmatter 字段先铺进来，sanitizeMeta 的结果覆盖标准字段
      const merged = { ...prev.meta, ...stripUndef(meta) };
      if (!('hot' in meta) || meta.hot !== true) delete merged.hot;
      if (!meta.password) delete merged.password;
      if (!meta.description) delete merged.description;
      if (!meta.pdf) delete merged.pdf;

      const md = composeMarkdown(merged, body.body, {
        trailingNewline: /\n$/.test(prevRaw),
        keepKeys: new Set(Object.keys(prev.meta)),
      });

      // 内容没变就不碰文件，避免 mtime 抖动和多余的 git diff
      const changed = md !== prevRaw;
      if (changed) await fsp.writeFile(target, md, 'utf8');
      const stat = await fsp.stat(target);
      return sendJson(res, 200, {
        ok: true,
        changed,
        mtime: Math.round(stat.mtimeMs),
        words: countWords(cleanBody(body.body)),
      });
    }

    if (method === 'DELETE') {
      if (!fs.existsSync(target)) return fail(res, 404, '文章不存在');
      await fsp.unlink(target);
      const enc = path.join(ENCRYPTED_DIR, `${id}.json`);
      if (fs.existsSync(enc)) await fsp.unlink(enc);
      return sendJson(res, 200, { ok: true });
    }
  }

  /* ---- 重命名 ---- */
  if (seg === 'rename' && method === 'POST') {
    const body = await readJson(req);
    const from = String(body.from || '').trim();
    const to = String(body.to || '').trim();
    assertSlug(from); assertSlug(to);
    const src = path.join(POSTS_DIR, `${from}.md`);
    const dst = path.join(POSTS_DIR, `${to}.md`);
    if (!fs.existsSync(src)) return fail(res, 404, '原文章不存在');
    if (fs.existsSync(dst)) return fail(res, 409, '目标文件名已存在');
    await fsp.rename(src, dst);
    const encFrom = path.join(ENCRYPTED_DIR, `${from}.json`);
    if (fs.existsSync(encFrom)) await fsp.rename(encFrom, path.join(ENCRYPTED_DIR, `${to}.json`));
    return sendJson(res, 200, { ok: true, slug: to });
  }

  /* ---- 图片上传 ---- */
  if (seg === 'upload' && method === 'POST') {
    const name = String(url.searchParams.get('name') || 'image.png');
    const buf = await readBody(req, 24 * 1024 * 1024);
    if (!buf.length) return fail(res, 400, '空文件');
    const month = localDate().slice(0, 7).replace('-', '');
    const dir = path.join(UPLOAD_DIR, month);
    await fsp.mkdir(dir, { recursive: true });
    const ext = (path.extname(name) || '.png').toLowerCase();
    const base = path.basename(name, path.extname(name)).replace(/[^\w\-]+/g, '-').slice(0, 40) || 'img';
    let file = `${base}${ext}`;
    let n = 1;
    while (fs.existsSync(path.join(dir, file))) file = `${base}-${n++}${ext}`;
    await fsp.writeFile(path.join(dir, file), buf);
    return sendJson(res, 200, { ok: true, url: `/uploads/${month}/${file}` });
  }

  /* ---- 打开文件所在目录 ---- */
  if (seg === 'reveal' && method === 'POST') {
    const body = await readJson(req);
    const slug = String(body.slug || '');
    assertSlug(slug);
    const target = path.join(POSTS_DIR, `${slug}.md`);
    if (process.platform === 'win32') {
      spawn('explorer.exe', ['/select,', target], { detached: true, windowsHide: true }).unref();
    }
    return sendJson(res, 200, { ok: true });
  }

  /* ---- 预览服务 ---- */
  if (seg === 'preview') {
    if (method === 'GET') return sendJson(res, 200, { running: !!previewProc, port: 4321, log: previewLog.slice(-40) });
    const body = await readJson(req);
    if (body.action === 'stop') return sendJson(res, 200, stopPreview());
    return sendJson(res, 200, startPreview());
  }

  /* ---- 流式任务 ---- */
  if (seg === 'run' && method === 'POST') {
    const body = await readJson(req);
    res.writeHead(200, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
      Connection: 'keep-alive',
    });
    const log = (line) => { if (!res.writableEnded) res.write(line + '\n'); };
    try {
      const action = body.action;

      if (action === 'publish') {
        log('⚡ 开始一键发布');
        const result = await publishFlow(log, { message: body.message, skipBuild: !!body.skipBuild });
        log(result.ok ? '\n✅ 发布流程结束' : '\n❌ 发布流程中断');
        if (result.ok) log('__DONE_OK__');
      } else if (action === 'encrypt') {
        const [exe, args] = cmd('encrypt');
        const code = await run(exe, args, log);
        log(code === 0 ? '__DONE_OK__' : `退出码 ${code}`);
      } else if (action === 'build') {
        const [exe, args] = cmd('build');
        const code = await run(exe, args, log);
        log(code === 0 ? '__DONE_OK__' : `退出码 ${code}`);
      } else if (action === 'git-status') {
        log('$ git status -sb');
        await run(GIT || 'git', ['status', '-sb'], log);
        log('__DONE_OK__');
      } else if (action === 'git-log') {
        await run(GIT || 'git', ['log', '--oneline', '-12', '--graph'], log);
        log('__DONE_OK__');
      } else if (action === 'git-pull') {
        const code = await run(GIT || 'git', ['pull', '--ff-only'], log);
        log(code === 0 ? '__DONE_OK__' : `退出码 ${code}`);
      } else {
        log('未知动作: ' + action);
      }
    } catch (e) {
      log('✗ ' + e.message);
    }
    res.end();
    return;
  }

  return fail(res, 404, '接口不存在: ' + url.pathname);
}

function sanitizeMeta(body) {
  const meta = {
    title: String(body.title || '').trim() || '未命名',
    date: normalizeDate(body.date),
    category: CATEGORIES.includes(body.category) ? body.category : '记录',
    description: String(body.description || '').trim(),
    type: TYPES.includes(body.type) ? body.type : 'article',
    origin: ORIGINS.includes(body.origin) ? body.origin : 'original',
    access: ACCESSES.includes(body.access) ? body.access : 'public',
    hot: body.hot === true,
    pdf: String(body.pdf || '').trim(),
    password: '',
  };
  if (meta.access === 'protected') {
    meta.password = String(body.password || '').trim();
  }
  meta.tags = Array.isArray(body.tags)
    ? [...new Set(body.tags.map(t => String(t).trim().replace(/^#/, '').slice(0, 16)).filter(Boolean))].slice(0, 20)
    : [];
  return meta;
}

/** 丢掉空值，方便把 sanitizeMeta 的结果合并进原有 frontmatter */
function stripUndef(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null || v === '') continue;
    out[k] = v;
  }
  return out;
}

/* ══════════════════════════ 每日写作提醒 ══════════════════════════ */

const NOTIFY_CMD = `
$ErrorActionPreference='SilentlyContinue'
[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType=WindowsRuntime] > $null
[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType=WindowsRuntime] > $null
$tpl = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02)
$texts = $tpl.GetElementsByTagName('text')
$texts.Item(0).AppendChild($tpl.CreateTextNode($env:STUDIO_TOAST_TITLE)) > $null
$texts.Item(1).AppendChild($tpl.CreateTextNode($env:STUDIO_TOAST_BODY)) > $null
$toast = [Windows.UI.Notifications.ToastNotification]::new($tpl)
try {
  $aumid = (Get-StartApps | Where-Object { $_.AppID -like 'Microsoft.Windows.PowerShell*' } | Select-Object -First 1).AppID
  if (-not $aumid) { $aumid = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe' }
  [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($aumid).Show($toast)
} catch {
  Add-Type -AssemblyName System.Windows.Forms
  $n = New-Object System.Windows.Forms.NotifyIcon
  $n.Icon = [System.Drawing.SystemIcons]::Information
  $n.Visible = $true
  $n.ShowBalloonTip(8000, $env:STUDIO_TOAST_TITLE, $env:STUDIO_TOAST_BODY, [System.Windows.Forms.ToolTipIcon]::Info)
}`;

function notify(title, body) {
  try {
    if (process.platform === 'win32') {
      const ps = which('powershell') || which('pwsh');
      if (!ps) return false;
      const child = spawn(ps, ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', NOTIFY_CMD], {
        windowsHide: true,
        env: { ...process.env, STUDIO_TOAST_TITLE: title, STUDIO_TOAST_BODY: body },
        stdio: 'ignore',
        detached: false,
      });
      child.on('error', () => { /* 通知失败不影响主流程 */ });
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

function tickReminder() {
  const habit = readHabit();
  if (!habit.remindersOn || !habit.remindAt) return;
  const now = new Date();
  const key = localDate(now);
  if (habit.lastNotifyDate === key) return;
  const [h, m] = habit.remindAt.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return;
  const target = new Date(now);
  target.setHours(h, m, 0, 0);
  if (now < target) return;

  const words = habit.days[key]?.words || 0;
  const goal = Math.max(1, Number(habit.dailyGoal) || 1);
  const title = words >= goal ? '今天的写作目标已达成了 ✓' : '还没动笔 —— 今天也没写吗？';
  const body = words >= goal
    ? `今天写了 ${words} 字，连续 ${calcStreak(habit)} 天。再补两句就是额外的。`
    : `今天写了 ${words} / ${goal} 字，去 Studio 写 10 分钟吧。`;
  if (notify(title, body)) {
    habit.lastNotifyDate = key;
    writeHabit(habit);
  }
}

/* ══════════════════════════ 主服务 ══════════════════════════ */

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${HOST}:${PORT}`);

  try {
    if (url.pathname.startsWith('/api/')) {
      if (req.method !== 'GET' && req.headers['x-studio'] !== '1') {
        return fail(res, 403, '缺少 X-Studio 请求头');
      }
      return await handleApi(req, res, url);
    }

    if (url.pathname.startsWith('/vendor/')) {
      const target = safeJoin(VENDOR_DIR, url.pathname.slice('/vendor/'.length));
      if (target && await serveStatic(res, target)) return;
      return fail(res, 404, 'not found');
    }

    if (url.pathname.startsWith('/uploads/')) {
      const target = safeJoin(UPLOAD_DIR, url.pathname.slice('/uploads/'.length));
      if (target && await serveStatic(res, target)) return;
      return fail(res, 404, 'not found');
    }

    const rel = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
    const target = safeJoin(PUBLIC_DIR, rel);
    if (target && await serveStatic(res, target)) return;

    // SPA 兜底
    if (await serveStatic(res, path.join(PUBLIC_DIR, 'index.html'))) return;
    fail(res, 404, 'not found');
  } catch (e) {
    if (!res.headersSent) fail(res, e.code || 500, e.message || '服务器错误');
    else res.end();
  }
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.log(`\n  端口 ${PORT} 已被占用 —— 大概率是 Studio 已经在运行了。`);
    console.log(`  直接打开：http://${HOST}:${PORT}\n`);
    if (!process.env.STUDIO_NO_OPEN) {
      spawn('cmd', ['/c', 'start', '', `http://${HOST}:${PORT}`], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
    }
    setTimeout(() => process.exit(0), 800);
    return;
  }
  console.error('服务启动失败:', e);
  process.exit(1);
});

const reminderTimer = setInterval(tickReminder, 30 * 1000);
reminderTimer.unref?.();

server.listen(PORT, HOST, () => {
  const line = '─'.repeat(52);
  console.log(line);
  console.log('  Guiyihan Studio · 本地写作工作台');
  console.log(line);
  console.log(`  地址      http://127.0.0.1:${PORT}`);
  console.log(`  手机访问  http://<你的电脑IP>:${PORT}`);
  console.log(`  项目      ${ROOT}`);
  console.log(`  运行时    ${BUN ? 'bun ✓' : 'bun ✗（改用 node 直跑）'}   git ${GIT ? '✓' : '✗'}`);
  console.log(`  依赖      ${HAS_MODULES ? 'node_modules ✓' : 'node_modules ✗ 请先 bun install'}`);
  console.log(line);
  console.log('  关闭窗口或 Ctrl+C 退出\n');

  if (!process.env.STUDIO_NO_OPEN) {
    const opener = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', `http://${HOST}:${PORT}`]]
      : process.platform === 'darwin' ? ['open', [`http://${HOST}:${PORT}`]]
        : ['xdg-open', [`http://${HOST}:${PORT}`]];
    try { spawn(opener[0], opener[1], { detached: true, stdio: 'ignore', windowsHide: true }).unref(); } catch { /* ignore */ }
  }
});

process.on('SIGINT', () => {
  stopPreview();
  process.exit(0);
});
