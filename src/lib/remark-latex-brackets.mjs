/**
 * remark 插件：把 LaTeX 原生定界符 \(...\) / \[...\] 转换为
 * remark-math 能识别的 $...$ / $$...$$
 *
 * 为什么不能在 AST 上做：Markdown 规范会把 \(、\[ 当作转义序列
 * 处理掉反斜杠，等 remark 拿到 AST 时 `\(` 已经变成 `(`，
 * 无法再区分公式边界，所以必须在解析前处理原始文本。
 */
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkMath from 'remark-math';

/** 跳过代码块 / 行内代码，避免误伤代码里的反斜杠 */
function transformOutsideCode(src) {
  const parts = src.split(/(```[\s\S]*?(?:```|$)|~~~[\s\S]*?(?:~~~|$)|`[^`\n]*`)/g);
  return parts
    .map((part, i) => (i % 2 === 1 ? part : transformDelimiters(part)))
    .join('');
}

function transformDelimiters(src) {
  return src
    // 块级公式 \[...\] -> $$...$$（前后补空行，保证成为独立段落）
    .replace(/\\\[([\s\S]*?)\\\]/g, (_m, inner) => `\n\n$$\n${inner.trim()}\n$$\n\n`)
    // 行内公式 \(...\) -> $...$
    .replace(/\\\(([\s\S]*?)\\\)/g, (_m, inner) => `$${inner.trim()}$`);
}

/** @type {import('unified').Plugin<[], import('mdast').Root>} */
export function remarkLatexBrackets() {
  // 子解析器必须带 remark-math 的解析扩展：
  // math 节点只能在 parse 阶段由 micromark 扩展生成，
  // 后置 transformer 无法把普通文本重新解析成公式
  const parser = unified().use(remarkParse).use(remarkMath);
  return (tree, file) => {
    const raw = String(file.value ?? '');
    if (!raw.includes('\\(') && !raw.includes('\\[')) return;
    // unified 中 transformer 返回新树不会生效，必须原地替换 children
    const newTree = parser.parse(transformOutsideCode(raw));
    tree.children = newTree.children;
  };
}
