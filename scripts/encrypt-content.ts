/**
 * 构建脚本：加密受保护文章 + 生成元数据
 *
 * 用法：npx tsx scripts/encrypt-content.ts
 *
 * 流程：
 * 1. 读取 src/content/posts/ 下所有 md 文件
 * 2. 提取元数据 → 写入 src/data/articles.json
 * 3. 受保护文章：加密正文 → 写入 public/encrypted/{slug}.json
 * 4. 更新 .gitignore 忽略受保护的 md 文件
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { encryptContent, hashPassword } from '../src/lib/content-crypto';

const POSTS_DIR = join(import.meta.dirname, '..', 'src', 'content', 'posts');
const ENCRYPTED_DIR = join(import.meta.dirname, '..', 'public', 'encrypted');
const METADATA_FILE = join(import.meta.dirname, '..', 'src', 'data', 'articles.json');
const GITIGNORE = join(import.meta.dirname, '..', '.gitignore');

interface ArticleMeta {
  id: string;
  title: string;
  date: string;
  category: string;
  tags: string[];
  description: string;
  type: string;
  origin: string;
  access: string;
  passwordHash: string;
  hot: boolean;
}

function parseFrontmatter(content: string): { data: Record<string, any>; body: string } {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) return { data: {}, body: content };

  const fm: Record<string, any> = {};
  for (const line of match[1].split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    let val = line.slice(colonIdx + 1).trim();

    // 解析数组 [a, b, c]
    if (val.startsWith('[') && val.endsWith(']')) {
      val = val.slice(1, -1);
      fm[key] = val.split(',').map((s: string) => s.trim().replace(/^['"]|['"]$/g, ''));
    }
    // 解析布尔值
    else if (val === 'true') fm[key] = true;
    else if (val === 'false') fm[key] = false;
    // 去引号
    else fm[key] = val.replace(/^['"]|['"]$/g, '');
  }

  return { data: fm, body: match[2] };
}

function main() {
  // 读取所有 md 文件
  const mdFiles = readdirSync(POSTS_DIR)
    .filter(f => f.endsWith('.md'))
    .map(f => join(POSTS_DIR, f));

  const allMeta: ArticleMeta[] = [];
  let protectedCount = 0;

  // 确保 encrypted 目录存在
  if (!existsSync(ENCRYPTED_DIR)) {
    mkdirSync(ENCRYPTED_DIR, { recursive: true });
  }

  for (const filePath of mdFiles) {
    const raw = readFileSync(filePath, 'utf-8');
    const { data, body } = parseFrontmatter(raw);
    const slug = basename(filePath, '.md');

    const meta: ArticleMeta = {
      id: slug,
      title: data.title || slug,
      date: data.date ? String(data.date).slice(0, 10) : '2026-01-01',
      category: data.category || '未分类',
      tags: Array.isArray(data.tags) ? data.tags : [],
      description: data.description || '',
      type: data.type || 'article',
      origin: data.origin || 'original',
      access: data.access || 'public',
      passwordHash: '',
      hot: data.hot === true,
    };

    // 加密受保护文章
    if (data.access === 'protected' && data.password) {
      const password = String(data.password);
      meta.passwordHash = hashPassword(password);

      const encrypted = encryptContent(body, password);
      const encPath = join(ENCRYPTED_DIR, `${slug}.json`);
      writeFileSync(encPath, JSON.stringify(encrypted, null, 2), 'utf-8');
      protectedCount++;
      console.log(`  ✓ 已加密: ${slug} → public/encrypted/${slug}.json`);
    }

    allMeta.push(meta);
  }

  // 按日期倒序排列
  allMeta.sort((a, b) => b.date.localeCompare(a.date));

  // 确保 data 目录存在
  const dataDir = join(import.meta.dirname, '..', 'src', 'data');
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }

  // 写入元数据
  writeFileSync(METADATA_FILE, JSON.stringify(allMeta, null, 2), 'utf-8');
  console.log(`\n  ✓ 元数据已写入: src/data/articles.json (${allMeta.length} 篇文章)`);

  // 更新 .gitignore
  updateGitignore(allMeta.filter(m => m.access === 'protected'));

  console.log(`  ✓ 加密完成: ${protectedCount} 篇受保护文章`);
}

function updateGitignore(protectedArticles: ArticleMeta[]) {
  let content = existsSync(GITIGNORE) ? readFileSync(GITIGNORE, 'utf-8') : '';

  // 移除旧的受保护文章忽略规则
  content = content.replace(/# 受保护文章源文件\n(.*\n)*/g, '');

  // 添加新的忽略规则
  if (protectedArticles.length > 0) {
    const patterns = protectedArticles.map(m => `src/content/posts/${m.id}.md`).join('\n');
    content = content.trimEnd() + `\n\n# 受保护文章源文件（构建时加密，不提交明文）\n${patterns}\n`;
  }

  writeFileSync(GITIGNORE, content, 'utf-8');
}

main();
