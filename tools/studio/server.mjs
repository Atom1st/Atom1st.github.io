#!/usr/bin/env node
/**
 * Guiyihan Studio · 本地写作工作台
 * ---------------------------------------------------------------
 * 纯 Node 内置模块实现，零依赖。绑定 127.0.0.1，只在本机跑。
 *
 *   node tools/studio/server.mjs
 *   或双击同目录下的 start.cmd
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
const PORT = Number(process.env.STUDIO_PORT || 7788);
const HOST = '127.0.0.1';

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

const FIELD_ORDER = ['title', 'date', 'category', 'description', 'type', 'origin', 'access', 'password', 'hot', 'pdf'];

function buildFrontmatter(meta) {
  const lines = ['---'];
  for (const key of FIELD_ORDER) {
    const v = meta[key];
    if (v === undefined || v === null || v === '') continue;
    if (key === 'hot') {
      if (v === true) lines.push('hot: true');
      continue;
    }
    if (key === 'type' && v === 'article') continue;
    if (key === 'origin' && v === 'original') continue;
    if (key === 'access' && v === 'public') continue;
    lines.push(`${key}: ${yamlScalar(String(v))}`);
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

function composeMarkdown(meta, body) {
  return buildFrontmatter(meta) + '\n\n' + cleanBody(body) + '\n';
}

function normalizeDate(v) {
  const s = String(v || '').trim();
  const m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return new Date().toISOString().slice(0, 10);
}

function countWords(body) {
  const text = body.replace(/```[\s\S]*?```/g, ' ').replace(/`[^`]*`/g, ' ');
  const cjk = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
  const en = (text.match(/[A-Za-z0-9]+/g) || []).length;
  return cjk + en;
}

/** 把磁盘上的 .md 归一化成前端要的结构 */
function toArticle(slug, raw, stat) {
  const { meta, body } = parseFrontmatter(raw);
  return {
    slug,
    title: String(meta.title || slug),
    date: normalizeDate(meta.date || ''),
    category: String(meta.category || '记录'),
    description: String(meta.description || ''),
    type: String(meta.type || 'article'),
    origin: String(meta.origin || 'original'),
    access: String(meta.access || 'public'),
    hot: meta.hot === true,
    pdf: String(meta.pdf || ''),
    password: String(meta.password || ''),
    body: cleanBody(body),
    words: countWords(cleanBody(body)),
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

/* ══════════════════════════ 本地预览进程 ══════════════════════════ */

let previewProc = null;

function startPreview() {
  if (previewProc) return { running: true, port: 4321, pid: previewProc.pid };
  const [exe, args] = cmd('dev');
  previewProc = spawn(exe, args, {
    cwd: ROOT,
    windowsHide: true,
    env: { ...process.env, FORCE_COLOR: '0' },
    stdio: 'ignore',
  });
  previewProc.on('close', () => { previewProc = null; });
  previewProc.on('error', () => { previewProc = null; });
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
    return sendJson(res, 200, {
      root: ROOT,
      port: PORT,
      bun: BUN,
      git: GIT,
      hasModules: HAS_MODULES,
      branch: gitBranch(),
      categories: CATEGORIES,
      types: TYPES,
      origins: ORIGINS,
      accesses: ACCESSES,
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
      meta.slug = next;
      raw = composeMarkdown({ ...meta, date: new Date().toISOString().slice(0, 10) }, bd);
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
      const meta = sanitizeMeta(body);
      meta.date = normalizeDate(meta.date);
      const md = composeMarkdown(meta, body.body);
      await fsp.writeFile(target, md, 'utf8');
      const stat = await fsp.stat(target);
      return sendJson(res, 200, { ok: true, mtime: Math.round(stat.mtimeMs) });
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
    const month = new Date().toISOString().slice(0, 7).replace('-', '');
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
    if (method === 'GET') return sendJson(res, 200, { running: !!previewProc, port: 4321 });
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
  if (!meta.description) delete meta.description;
  if (!meta.pdf) delete meta.pdf;
  if (!meta.password) delete meta.password;
  if (!meta.hot) delete meta.hot;
  return meta;
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

server.listen(PORT, HOST, () => {
  const line = '─'.repeat(52);
  console.log(line);
  console.log('  Guiyihan Studio · 本地写作工作台');
  console.log(line);
  console.log(`  地址      http://${HOST}:${PORT}`);
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
