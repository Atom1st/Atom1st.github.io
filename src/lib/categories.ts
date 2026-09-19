/** 文章分类配置与分类色块样式映射 */

export const CATEGORIES = ['全部', '记录', '文学', '理论', '学习', '生活', '评论'] as const;

const catClassMap: Record<string, string> = {
  记录: 'cat-jilu',
  文学: 'cat-wenxue',
  理论: 'cat-lilun',
  学习: 'cat-xuexi',
  生活: 'cat-shenghuo',
  评论: 'cat-pinglun',
};

/** 返回分类对应的色块 CSS 类名 */
export function catClass(category: string): string {
  return catClassMap[category] || 'cat-jilu';
}
