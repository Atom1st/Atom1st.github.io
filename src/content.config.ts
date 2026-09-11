import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const validCategories = [
  '个人记录',
  '科技工程',
  '算法理论',
  '生活游记',
  '学习文化课',
  '休闲娱乐',
  '闲话',
];

const posts = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/posts' }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    category: z.enum(validCategories),
    tags: z.array(z.string()).default([]),
    description: z.string().optional(),
    hot: z.boolean().default(false),
    type: z.enum(['article', 'resource', 'page']).default('article'),
    origin: z.enum(['original', 'repost']).default('original'),
    access: z.enum(['public', 'protected']).default('public'),
    password: z.string().nullish(),
  }),
});

export const collections = { posts };
