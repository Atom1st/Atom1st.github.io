#!/usr/bin/env node
/**
 * Guiyihan Toolbox · PicBed 简易图床
 * ---------------------------------------------------------------
 * 纯 Node 内置模块，零 npm 依赖。绑定 127.0.0.1，只在本机跑。
 *
 *   node tools/toolbox/picbed/server.mjs
 *   或双击同目录下的 start.cmd
 *
 * 三个上传渠道：
 *   github  — 提交到博客仓库 public/uploads/，直链走自己的域名
 *   imgbb   — ImgBB API（邮箱注册即有 Key）
 *   picgo   — picgo.net（Chevereto，邮箱注册拿 Key）
 *
 * 设计语言与 Studio 一致：极简 / 强对比 / 硬朗棱角。
 * ---------------------------------------------------------------
 */
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, 'public');
const CONFIG_FILE = path.join(__dirname, '.picbed.json');
const GALLERY_FILE = path.join(__dirname, '.picbed-gallery.json');
const PORT = Number(process.env.PICBED_PORT || 7790);
const HOST = '127.0.0.1';

const IMG_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.bmp', '.svg', '.ico']);
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

/* ══════════════════════════ 配置与图库 ══════════════════════════ */

const DEFAULT_CONFIG = {
  channel: 'github',
  github: {
    token: '',
    owner: 'Atom1st',
    repo: 'Atom1st.github.io',
    branch: 'main',
    dir: 'public/uploads',
    site: 'https://guiyihan.top',
    commitPrefix: 'picbed: ',
  },
  imgbb: { key: '', expiration: '' },
  picgo: { key: '' },
};

async function readJson(file, fallback) {
  try {
    return { ...fallback, ...JSON.parse(await fsp.readFile(file, 'utf8')) };
  } catch {
    return { ...fallback };
  }
}

const getConfig = () => readJson(CONFIG_FILE, DEFAULT_CONFIG);
const getGallery = () => readJson(GALLERY_FILE, { items: [] });

async function writeConfig(cfg) {
  await fsp.writeFile(CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf8');
}

async function saveGalleryItem(item) {
  const gal = await getGallery();
  gal.items.unshift(item);
  // 只留最近 500 条，防止无限膨胀
  gal.items = gal.items.slice(0, 500);
  await fsp.writeFile(GALLERY_FILE, JSON.stringify(gal, null, 2), 'utf8');
}

async function removeGalleryItem(id) {
  const gal = await getGallery();
  const idx = gal.items.findIndex(i => i.id === id);
  if (idx >= 0) {
    gal.items.splice(idx, 1);
    await fsp.writeFile(GALLERY_FILE, JSON.stringify(gal, null, 2), 'utf8');
    return true;
  }
  return false;
}

/* ══════════════════════════ 通用工具 ══════════════════════════ */

function json(res, code, data) {
  const body = JSON.stringify(data);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}

function readBody(req, limit = 64 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', c => {
      size += c.length;
      if (size > limit) { reject(new Error('请求体过大')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function extOf(name) {
  const m = /\.([a-z0-9]+)$/i.exec(name || '');
  return m ? '.' + m[1].toLowerCase() : '';
}

/** 生成不冲突的文件名：YYYYMM/ts_原名.ext */
function safeName(original) {
  const ext = extOf(original) || '.png';
  const base = (path.basename(original || '', ext) || 'img')
    .replace(/[\\/:*?"<>|\s]+/g, '_')
    .slice(0, 40);
  const d = new Date();
  const ym = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
  const ts = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  return { dir: ym, name: `${ym}/${ts}_${base}${ext}` };
}

/** 带超时与重试一次的 fetch */
async function fetchT(url, opts = {}, ms = 60000, retries = 1) {
  for (let i = 0; ; i++) {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), ms);
    try {
      return await fetch(url, { ...opts, signal: ac.signal });
    } catch (e) {
      if (i >= retries) throw e;
    } finally {
      clearTimeout(t);
    }
  }
}

/* ══════════════════════════ 渠道适配器 ══════════════════════════ */

/**
 * 各渠道统一入参：{ buf: Buffer, filename: string, cfg: object }
 * 统一出参：{ url, deleteUrl?, thumb?, raw? }
 */

async function uploadGitHub({ buf, filename, cfg }) {
  const g = cfg.github;
  if (!g.token) throw new Error('未配置 GitHub Token（设置 → GitHub 仓库）');
  const { dir, name } = safeName(filename);
  const repoPath = `${g.dir.replace(/\/+$/, '')}/${name}`;
  const api = `https://api.github.com/repos/${g.owner}/${g.repo}/contents/${repoPath}`;
  const body = {
    message: `${g.commitPrefix}${path.basename(filename || 'image')}`,
    branch: g.branch,
    content: buf.toString('base64'),
  };
  // 若同名文件已存在，GitHub 会报 422，这里不预查，直接让它失败并带出信息
  const r = await fetchT(api, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${g.token}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'guiyihan-picbed',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = j?.message || `HTTP ${r.status}`;
    throw new Error(`GitHub 提交失败：${msg}`);
  }
  const site = (g.site || '').replace(/\/+$/, '');
  const url = `${site}/${g.dir.replace(/\/+$/, '')}/${name}`;
  return {
    url,
    raw: j?.content?.download_url || url,
    note: '已提交到仓库，GitHub Actions 部署完成后直链生效（约 1-2 分钟）',
  };
}

async function uploadImgBB({ buf, filename, cfg }) {
  const key = cfg.imgbb?.key;
  if (!key) throw new Error('未配置 ImgBB API Key（imgbb.com 邮箱注册即可免费获取）');
  const fd = new FormData();
  fd.append('key', key);
  fd.append('image', buf.toString('base64'));
  fd.append('name', path.basename(filename || 'image', extOf(filename)) || 'image');
  if (cfg.imgbb?.expiration) fd.append('expiration', String(cfg.imgbb.expiration));
  const r = await fetchT('https://api.imgbb.com/1/upload', { method: 'POST', body: fd });
  const j = await r.json().catch(() => ({}));
  if (!j?.success) throw new Error(`ImgBB 失败：${j?.error?.message || `HTTP ${r.status}`}`);
  const d = j.data;
  return { url: d.display_url || d.url, thumb: d.thumb?.url || d.thumb, raw: d.url, deleteUrl: d.delete_url };
}

async function uploadPicGo({ buf, filename, cfg }) {
  const key = cfg.picgo?.key;
  if (!key) throw new Error('未配置 picgo.net API Key（www.picgo.net 邮箱注册，设置 → API 生成）');
  const fd = new FormData();
  fd.append('source', new Blob([buf], { type: 'application/octet-stream' }), path.basename(filename || 'image.png'));
  const r = await fetchT('https://www.picgo.net/api/1/upload', {
    method: 'POST',
    headers: { 'X-API-Key': key },
    body: fd,
  });
  const j = await r.json().catch(() => ({}));
  if (j?.status_code !== 200) throw new Error(`picgo.net 失败：${j?.error?.message || `HTTP ${r.status}`}`);
  const img = j.image || {};
  return {
    url: img.url,
    thumb: img.thumb?.url || img.medium?.url,
    raw: img.url,
    deleteUrl: img.delete_url,
  };
}

const ADAPTERS = { github: uploadGitHub, imgbb: uploadImgBB, picgo: uploadPicGo };

/* ══════════════════════════ HTTP 路由 ══════════════════════════ */

async function serveStatic(req, res, pathname) {
  let rel = pathname === '/' ? '/index.html' : pathname;
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR)) { res.writeHead(403); res.end(); return; }
  try {
    const data = await fsp.readFile(file);
    const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
    // 小文件自动 gzip
    if ((req.headers['accept-encoding'] || '').includes('gzip') && data.length > 1024) {
      zlib.gzip(data, (e, gz) => {
        if (e) { res.end(data); return; }
        res.setHeader('Content-Encoding', 'gzip');
        res.end(gz);
      });
    } else {
      res.end(data);
    }
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 Not Found');
  }
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://${req.headers.host}`);
  const p = u.pathname;

  try {
    /* ---- 配置 ---- */
    if (req.method === 'GET' && p === '/api/config') {
      const cfg = await getConfig();
      // 脱敏：只回传 key 的存在性与后四位
      const mask = s => (s ? '••••' + s.slice(-4) : '');
      return json(res, 200, {
        channel: cfg.channel,
        github: { ...cfg.github, token: mask(cfg.github.token), hasToken: !!cfg.github.token },
        imgbb: { key: mask(cfg.imgbb.key), hasKey: !!cfg.imgbb.key, expiration: cfg.imgbb.expiration },
        picgo: { key: mask(cfg.picgo.key), hasKey: !!cfg.picgo.key },
      });
    }
    if (req.method === 'PUT' && p === '/api/config') {
      const body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
      const cfg = await getConfig();
      // 前端传来的掩码值（••••xxxx）不覆盖真实密钥
      const keep = (oldV, newV) => (!newV || newV.startsWith('••••')) ? oldV : newV;
      if (body.channel) cfg.channel = body.channel;
      if (body.github) {
        cfg.github = { ...cfg.github, ...body.github };
        cfg.github.token = keep(cfg.github.token, body.github.token);
      }
      if (body.imgbb) {
        cfg.imgbb = { ...cfg.imgbb, ...body.imgbb };
        cfg.imgbb.key = keep(cfg.imgbb.key, body.imgbb.key);
      }
      if (body.picgo) {
        cfg.picgo = { ...cfg.picgo, ...body.picgo };
        cfg.picgo.key = keep(cfg.picgo.key, body.picgo.key);
      }
      await writeConfig(cfg);
      return json(res, 200, { ok: true });
    }

    /* ---- 上传 ---- */
    if (req.method === 'POST' && p === '/api/upload') {
      const body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
      const buf = Buffer.from(body.dataBase64 || '', 'base64');
      if (!buf.length) return json(res, 400, { error: '空文件' });
      if (buf.length > 32 * 1024 * 1024) return json(res, 400, { error: '超过 32MB 上限' });
      const filename = body.filename || 'image.png';
      if (!IMG_EXT.has(extOf(filename).toLowerCase()) && !IMG_EXT.has(path.extname(filename).toLowerCase())) {
        return json(res, 400, { error: `不支持的格式：${extOf(filename) || '未知'}` });
      }
      const cfg = await getConfig();
      const channel = body.channel || cfg.channel;
      const fn = ADAPTERS[channel];
      if (!fn) return json(res, 400, { error: `未知渠道：${channel}` });
      const t0 = Date.now();
      try {
        const result = await fn({ buf, filename, cfg });
        const item = {
          id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
          channel,
          name: path.basename(filename),
          size: buf.length,
          url: result.url,
          thumb: result.thumb || result.url,
          deleteUrl: result.deleteUrl || '',
          at: new Date().toISOString(),
        };
        await saveGalleryItem(item);
        return json(res, 200, { ok: true, item, ms: Date.now() - t0, note: result.note || '' });
      } catch (e) {
        return json(res, 502, { error: String(e.message || e) });
      }
    }

    /* ---- 图库 ---- */
    if (req.method === 'GET' && p === '/api/gallery') {
      const gal = await getGallery();
      return json(res, 200, gal);
    }
    const mDel = p.match(/^\/api\/gallery\/([a-z0-9]+)$/i);
    if (req.method === 'DELETE' && mDel) {
      const ok = await removeGalleryItem(mDel[1]);
      return json(res, ok ? 200 : 404, { ok });
    }

    /* ---- 回源代理（下载 / 预览外链图）---- */
    if (req.method === 'GET' && p === '/api/proxy') {
      const target = u.searchParams.get('url');
      let host;
      try { host = new URL(target).host; } catch { return json(res, 400, { error: 'url 无效' }); }
      if (!/(ibb\.co|picgo\.net|guiyihan\.top|iili\.io|see\.you)$/i.test(host)) {
        return json(res, 403, { error: '不在允许的域名白名单内' });
      }
      const r = await fetchT(target, { headers: { 'User-Agent': 'Mozilla/5.0' } }, 60000, 2);
      if (!r.ok) return json(res, 502, { error: `回源失败 HTTP ${r.status}` });
      const ab = await r.arrayBuffer();
      res.writeHead(200, {
        'Content-Type': r.headers.get('content-type') || 'application/octet-stream',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(u.searchParams.get('name') || 'image')}`,
      });
      return res.end(Buffer.from(ab));
    }

    /* ---- 静态资源 ---- */
    if (req.method === 'GET') return serveStatic(req, res, p);

    res.writeHead(405); res.end();
  } catch (e) {
    json(res, 500, { error: String(e.message || e) });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`\n  PicBed 简易图床`);
  console.log(`  http://${HOST}:${PORT}\n`);
  console.log('  Ctrl+C 退出\n');
});
