import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const posts = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/posts' }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    category: z.string(),
    tags: z.array(z.string()).default([]),
    description: z.string().optional(),
    hot: z.boolean().default(false),
    type: z.enum(['article', 'resource', 'page']).default('article'),
    origin: z.enum(['original', 'repost']).default('original'),
    access: z.enum(['public', 'protected']).default('public'),
    password: z.string().optional(),
  }),
});

export const collections = { posts };
