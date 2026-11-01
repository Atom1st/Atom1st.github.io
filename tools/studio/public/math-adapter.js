/* LaTeX 定界符适配层
 *
 * 源文件使用 LaTeX 原生定界符 \(...\) / \[...\]（与博客 remark-latex-brackets
 * 插件一致），但 Vditor 的 lute 引擎只认 $...$ / $$...$$。
 *
 * 这里在「文件 ⇄ 编辑器」边界做双向转换：
 *   mdToEditor()   打开文章时：\( \) \[ \] → $ $$，CRLF 统一为 LF
 *   mdFromEditor() 保存文章时：$ $$ → \( \) \[ \]（还原源文件写法）
 *
 * 设计要点：
 * - 只替换定界符本身，不动公式内容 → 往返严格无损（\[ 与 $$ 等长）；
 * - 跳过代码块 / 行内代码，避免误伤代码里的反斜杠和美元符号；
 * - mdFromEditor 的匹配规则与 micromark-extension-math 对齐
 *   （块 $$ 独占行、行内同一行且内侧不贴空白），编辑器里渲染成公式
 *   的内容才会被转回，正文里的普通美元符号（价格等）不受影响；
 * - EOL：编辑器内部统一 LF，保存时用 toEol() 按原文件换行风格还原，
 *   保证源文件字节级稳定（git diff 干净）。
 * - 陷阱备忘：String.replace 的替换串里 "$$" 会被解释成字面 "$"，
 *   必须用函数形式 () => '$$'。
 */

const MATH_CODE_SPLIT = /(```[\s\S]*?(?:```|$)|~~~[\s\S]*?(?:~~~|$)|`[^`\n]*`)/g;

function mathMapOutsideCode(src, fn) {
  const parts = src.split(MATH_CODE_SPLIT);
  return parts.map((part, i) => (i % 2 === 1 ? part : fn(part))).join('');
}

/** 文件内容 → 编辑器内容（内部统一 LF） */
function mdToEditor(src) {
  return mathMapOutsideCode(String(src || '').replace(/\r\n/g, '\n'), s => s
    .replace(/\\\[/g, () => '$$')
    .replace(/\\\]/g, () => '$$')
    .replace(/\\\(/g, () => '$')
    .replace(/\\\)/g, () => '$'));
}

/** 编辑器内容 → 文件内容（LF；用 toEol 还原原文件换行风格） */
function mdFromEditor(src) {
  return mathMapOutsideCode(String(src || ''), s => s
    // 块：$$ 独占行 → \[ \] 独占行（内部换行原样保留）
    .replace(/^[ \t]*\$\$[ \t]*\n([\s\S]*?)\n[ \t]*\$\$[ \t]*$/gm,
      (_m, inner) => `\\[\n${inner}\n\\]`)
    // 行内 $$...$$（同一行）→ \[...\]
    .replace(/(?<![\\$])\$\$(?!\s)([^$\n]+?)(?<!\s)\$\$(?!\$)/g,
      (_m, inner) => `\\[${inner}\\]`)
    // 行内 $...$ → \(...\)：同一行、非转义、内侧不贴空白、闭 $ 后不紧跟 $
    .replace(/(?<![\\$])\$(?!\s)([^$\n]+?)(?<!\s)\$(?!\$)/g,
      (_m, inner) => `\\(${inner}\\)`));
}

/** 按原文件换行风格还原（编辑器内部是 LF） */
function toEol(text, eol) {
  if (eol === '\r\n') return String(text || '').replace(/\r?\n/g, '\r\n');
  return String(text || '').replace(/\r?\n/g, '\n');
}
