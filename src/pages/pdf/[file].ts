/**
 * PDF 发布端点（静态构建）
 *
 * 把 src/content/posts/ 下所有 .pdf 发布为 /pdf/<文件名>.pdf，
 * 配合文章 frontmatter 里的 `pdf: <文件名>.pdf` 字段使用。
 */
import type { APIRoute } from 'astro';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const POSTS_DIR = join(process.cwd(), 'src', 'content', 'posts');

export function getStaticPaths() {
  // 只发布实际存在于 posts 目录里的 PDF，天然防止路径穿越
  const pdfs = readdirSync(POSTS_DIR).filter((f) => f.toLowerCase().endsWith('.pdf'));
  return pdfs.map((file) => ({ params: { file }, props: { file } }));
}

export const GET: APIRoute = ({ props }) => {
  const buf = readFileSync(join(POSTS_DIR, props.file));
  return new Response(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
