import articlesData from '../data/articles.json';

const SITE = 'https://guiyihan.top';

const staticPaths = [
  '/',
  '/articles',
  '/archive',
  '/resources',
  '/friends',
  '/about',
  '/guestbook',
  '/reward',
  '/zhongqiu',
];

export const GET = async () => {
  const articlePaths = (articlesData as any[])
    .filter((p: any) => p.type === 'article')
    .map((p: any) => `/articles/${p.id}/`);
  const paths = [...staticPaths, ...articlePaths];
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${paths.map((path) => `  <url><loc>${SITE}${path}</loc></url>`).join('\n')}
</urlset>`;

  return new Response(body, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
};
