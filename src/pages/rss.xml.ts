import articlesData from '../data/articles.json';

const SITE = 'https://guiyihan.top';

function esc(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export const GET = async () => {
  const items = (articlesData as any[])
    .filter((p: any) => p.type === 'article')
    .sort((a: any, b: any) => b.date.localeCompare(a.date))
    .map((p: any) => {
      const link = `${SITE}/articles/${p.id}/`;
      return `    <item>
      <title>${esc(p.title)}</title>
      <link>${link}</link>
      <guid isPermaLink="true">${link}</guid>
      <pubDate>${new Date(p.date).toUTCString()}</pubDate>
      <description>${esc(p.description || `${p.category} · ${p.date}`)}</description>
      <category>${esc(p.category)}</category>
    </item>`;
    })
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Guiyihan的博客</title>
    <link>${SITE}</link>
    <description>记录、文学、理论、学习与生活</description>
    <language>zh-CN</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${items}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' },
  });
};
