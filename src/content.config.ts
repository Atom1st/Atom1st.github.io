import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const validCategories = [
  '记录',
  '文学',
  '理论',
  '学习',
  '生活',
  '评论',
];

const posts = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/posts' }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    category: z.enum(validCategories),
    description: z.string().optional(),
    hot: z.boolean().default(false),
    type: z.enum(['article', 'resource', 'page']).default('article'),
    origin: z.enum(['original', 'repost']).default('original'),
    access: z.enum(['public', 'protected']).default('public'),
    password: z.string().nullish(),
  }),
});

export const collections = { posts };
