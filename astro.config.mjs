import { defineConfig } from 'astro/config';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { remarkLatexBrackets } from './src/lib/remark-latex-brackets.mjs';

// https://astro.build/config
export default defineConfig({
  site: 'https://guiyihan.top',
  markdown: {
    remarkPlugins: [remarkLatexBrackets, remarkMath],
    rehypePlugins: [rehypeKatex],
  },
});
