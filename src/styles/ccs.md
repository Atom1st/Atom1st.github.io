# CCS · Common Component Stylesheet 使用文档

> 一套亮色为主、直角硬朗、以「左侧色条」为强调语言的通用 CSS 样式表。
> 单文件、零依赖、可直接 `<link>` 到任何 HTML 页面。

- **样式表**：`src/styles/ccs.css`
- **组件总览**：`src/styles/ccs-preview.html`（静态预览）
- **交互演示**：`src/styles/ccs-demo.html`（带 JS 的可点、可开关实例）
- **零类名验证**：`src/styles/ccs-bare.html`（一个 class 都不加的裸 HTML，验证兜底层）

---

## 目录

1. [快速开始](#1-快速开始)
2. [设计约定](#2-设计约定)
3. [设计令牌（变量）](#3-设计令牌变量)
4. [排版](#4-排版)
5. [布局与页面骨架](#5-布局与页面骨架)
6. [按钮](#6-按钮)
7. [卡片](#7-卡片)
8. [徽章 / 标签 / 状态](#8-徽章--标签--状态)
9. [提示框](#9-提示框)
10. [表单](#10-表单)
11. [表格](#11-表格)
12. [导航组件](#12-导航组件)
13. [列表型组件](#13-列表型组件)
14. [文章正文](#14-文章正文)
15. [浮层：下拉 / 模态 / Toast / Tooltip](#15-浮层下拉--模态--toast--tooltip)
16. [杂项组件](#16-杂项组件)
17. [零类名兜底](#17-零类名兜底裸-html-也能看)
18. [工具类](#18-工具类)
19. [响应式](#19-响应式)
20. [接入现有博客的建议](#20-接入现有博客的建议)
21. [类名速查表](#21-类名速查表)

---

## 1. 快速开始

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="stylesheet" href="ccs.css">
  <!-- 图标可选，本样式表不内置图标字体 -->
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.5.2/css/all.min.css">
</head>
<body>
  <div class="page container">
    <h1 class="page-title">页面标题</h1>
    <button class="btn">主按钮</button>
  </div>
</body>
</html>
```

**三条规则**

| 规则 | 说明 |
|---|---|
| 类名无前缀 | 全部小写连字符，如 `.btn` `.card` `.badge`，可直接与任何框架共存 |
| 只改变量 | 想换主色/间距/字号，改 `:root` 里的变量，不要覆盖具体规则 |
| 状态用 `is-` | 选中/展开/隐藏统一 `.is-active` `.is-open` `.is-hidden` `.is-loading` `.is-disabled` |

---

## 2. 设计约定

- **亮色优先**：默认 `:root` 即亮色。附带的 `[data-theme="dark"]` 段是可选兜底，删掉不影响使用。
- **直角**：只有 `--radius: 0` 和 `--radius-sm: 2px` 两档。唯一例外是 `.btn.is-loading` 的转圈。
- **左侧色条是强调语言**：卡片、提示框、引用、代码块、资源条统一用 4px 左色条表达「重点在哪」。
- **无悬浮位移**：hover 只改颜色 / 边框 / 阴影，不 `translateY`，避免整页抖动。
- **无渐变堆积**：仅 skeleton 动画使用渐变，其余都是纯色块。

---

## 3. 设计令牌（变量）

全部定义在 `:root`。**推荐只覆盖变量来定制**。

### 3.1 颜色

| 变量 | 默认值 | 用途 |
|---|---|---|
| `--bg` | `#F6F8FA` | 页面底色 |
| `--bg-alt` | `#EEF2F6` | 次级底色、斑马纹 |
| `--paper` | `#FFFFFF` | 卡片、输入框等浮起面 |
| `--paper-alt` | `#FAFBFC` | 表头、代码块浅面 |
| `--inverse` | `#1F2328` | 反色面（tooltip） |
| `--border` | `#D0D7DE` | 默认边框 |
| `--border-strong` | `#AFB8C1` | 悬停/强调边框 |
| `--border-weak` | `#E6EAEF` | 分隔线 |
| `--text` | `#1F2328` | 主文字 |
| `--text-2` | `#4A5259` | 正文次要文字 |
| `--muted` | `#656D76` | 说明文字 |
| `--faint` | `#8C959F` | 最弱文字（日期、提示） |
| `--accent` | `#0969DA` | 主色 |
| `--accent-strong` | `#0550AE` | 主色深（链接） |
| `--accent-soft` | `rgba(9,105,218,.10)` | 主色浅底 |
| `--accent-line` | `rgba(9,105,218,.35)` | 主色半透明线 |
| `--success` | `#1A7F37` | 成功 |
| `--warning` | `#9A6700` | 警告 |
| `--danger` | `#CF222E` | 危险 |
| `--info` | `#1B7C83` | 信息 |
| `--purple` | `#8250DF` | 补充色 |
| `--text-on-accent` | `#FFFFFF` | 主色上的文字 |

语义色都有对应的 `--xxx-soft` 浅底版本（`--success-soft` / `--warning-soft` / `--danger-soft` / `--info-soft` / `--purple-soft`）。

### 3.2 字体与字号

| 变量 | 值 |
|---|---|
| `--font-sans` | 系统字体栈（含 PingFang SC / 微软雅黑 / Noto Sans SC） |
| `--font-mono` | `SFMono-Regular, JetBrains Mono, Consolas, ...` |
| `--fs-xs` ~ `--fs-display` | `12 / 13 / 15 / 16 / 18 / 20 / 24 / 30 / 38px` |
| `--lh-tight` / `--lh-base` / `--lh-loose` | `1.3 / 1.7 / 1.85` |

### 3.3 间距（4px 栅格）

`--sp-1` … `--sp-16` = `4 8 12 16 20 24 32 40 48 64px`

### 3.4 形状与动效

| 变量 | 值 | 说明 |
|---|---|---|
| `--radius` | `0px` | 容器用 |
| `--radius-sm` | `2px` | 按钮/输入框/徽章用 |
| `--bar` | `4px` | 左色条宽度 |
| `--border-w` | `1px` | 全局边框宽度 |
| `--shadow-sm` / `--shadow` / `--shadow-lg` | 三级阴影 | |
| `--t-fast` / `--t-base` | `.14s` / `.2s` ease | 过渡时长 |
| `--focus-ring` | 双层描边 | 键盘聚焦环 |

### 3.5 布局

`--container: 1080px`、`--container-narrow: 760px`
层级：`--z-dropdown: 100` < `--z-sticky: 900` < `--z-overlay: 980` < `--z-modal: 1000` < `--z-toast: 1100`

### 3.6 定制示例

```css
/* 换主色为墨绿，不改一行组件样式 */
:root {
  --accent: #1A7F37;
  --accent-strong: #116329;
  --accent-soft: rgba(26, 127, 55, .10);
  --accent-line: rgba(26, 127, 55, .35);
}
```

---

## 4. 排版

直接使用语义标签，无需加类。

```html
<h1>一级标题</h1>
<h2>二级标题</h2>
<p>正文段落，含 <a href="#">链接</a>、<strong>加粗</strong>、<em>斜体</em>、
   <code>行内代码</code>、<kbd>Ctrl</kbd>、<mark>高亮</mark>、<del>删除</del>。</p>

<hr>
<hr class="dashed">

<blockquote>
  引用段落，左侧色条标记。
  <cite>出处</cite>
</blockquote>

<pre><code>const sum = (a, b) =&gt; a + b;</code></pre>
<pre class="pre-dark"><code>// 深色代码块，与博客原风格一致
console.log('dark');</code></pre>

<table>
  <caption>表格标题</caption>
  <thead><tr><th>项目</th><th>内容</th></tr></thead>
  <tbody><tr><td>站名</td><td>Guiyihan</td></tr></tbody>
</table>
```

**辅助类**

| 类名 | 效果 |
|---|---|
| `.list-none` | 去项目符号 |
| `.list-check` | 方块勾选列表 |
| `.table-wrap` | 表格横向滚动容器 |
| `.table-sm` | 紧凑表格 |
| `.table-fixed` | 等宽列 |
| `td.num` | 数字右对齐 + 等宽数字 |
| `td.mono` | 等宽字体单元格 |
| `.caption` | 图注小字 |
| `.anchor` | 标题内锚点（hover 标题才显现） |
| `.scroll-progress` | 顶部滚动进度条（纯 CSS，支持时才生效） |

```html
<ul class="list-check">
  <li>已完成项</li>
</ul>
```

---

## 5. 布局与页面骨架

### 5.1 容器

```html
<div class="container">…</div>          <!-- 1080px -->
<div class="container container-narrow">…</div>  <!-- 760px，正文用 -->
<div class="container container-wide">…</div>    <!-- 1320px -->
<div class="container container-full">…</div>    <!-- 不限宽 -->
```

### 5.2 栅格

```html
<div class="grid grid-2">…</div>   <!-- 2 列，1024px 以下变 1 列 -->
<div class="grid grid-3">…</div>   <!-- 3 列 -->
<div class="grid grid-4">…</div>   <!-- 4 列 -->
<div class="grid grid-auto">…</div>     <!-- 自适应，最小 240px -->
<div class="grid grid-auto-lg">…</div>  <!-- 自适应，最小 320px -->

<div class="row">
  <div class="col">弹性列</div>
  <div class="col">弹性列</div>
</div>
```

### 5.3 完整骨架（顶栏 + 侧栏 + 主体）

```html
<body>
  <header class="header">
    <button class="menu-toggle" id="menuToggle"><i class="fas fa-bars"></i></button>
    <span class="brand">站点名</span>
    <nav class="nav-bar">
      <a href="#" class="is-active">首页</a>
      <a href="#">文章</a>
    </nav>
    <span class="spacer"></span>
    <button class="theme-toggle" id="themeToggle"><i class="fas fa-sun"></i></button>
  </header>

  <div class="layout-side">
    <aside class="sidebar" id="sidebar">
      <div class="profile">
        <img class="avatar avatar-lg" src="/avatar.jpg" alt="">
        <div class="name">名字</div>
        <div class="bio">一句话简介</div>
      </div>
      <nav class="side-nav">
        <div class="nav-title">导航</div>
        <a href="#" class="is-active"><i class="fas fa-home"></i> 首页</a>
        <a href="#"><i class="fas fa-book"></i> 文章</a>
      </nav>
      <ul class="contact-list">
        <li><i class="fas fa-envelope"></i><a href="mailto:…">邮箱</a></li>
      </ul>
    </aside>
    <div class="overlay" id="overlay"></div>

    <main class="main">
      <div class="page">
        <h1 class="page-title">页面标题</h1>
        <p class="page-sub">页面说明</p>
      </div>
    </main>
  </div>

  <footer class="footer">© 2026</footer>
</body>
```

移动端抽屉需要三行 JS（`.sidebar` 加/去 `is-open`，`.overlay` 加/去 `is-open`），见 `ccs-demo.html`。

**页面头部工具类**

```html
<div class="page-head">
  <span class="eyebrow">Category</span>
  <h1 class="page-title">标题（左侧 6px 色条）</h1>
  <p class="page-sub">副标题，与标题左对齐</p>
</div>
```

---

## 6. 按钮

基础类是 `.btn`，变体类叠加。

```html
<!-- 样式 -->
<button class="btn">主按钮</button>
<button class="btn btn-outline">描边</button>
<button class="btn btn-secondary">次级</button>
<button class="btn btn-ghost">幽灵</button>
<a class="btn btn-success" href="#">成功</a>
<button class="btn btn-warning">警告</button>
<button class="btn btn-danger">危险</button>
<button class="btn btn-inverse">反色</button>

<!-- 尺寸 -->
<button class="btn btn-sm">小</button>
<button class="btn">默认</button>
<button class="btn btn-lg">大</button>
<button class="btn btn-xl">特大</button>
<button class="btn btn-block">通栏</button>

<!-- 图标按钮 -->
<button class="btn btn-icon btn-secondary"><i class="fas fa-cog"></i></button>
<button class="btn btn-square"><i class="fas fa-xmark"></i></button>

<!-- 状态 -->
<button class="btn" disabled>禁用</button>
<button class="btn is-loading">加载中</button>

<!-- 按钮组 -->
<div class="btn-group">
  <button class="btn btn-secondary">日</button>
  <button class="btn btn-secondary is-active">周</button>
  <button class="btn btn-secondary">月</button>
</div>

<!-- 文本按钮 -->
<a class="btn-text" href="#">查看更多 →</a>
```

| 类名 | 说明 |
|---|---|
| `.btn` | 基础（主色实心） |
| `.btn-outline` | 描边，hover 填满 |
| `.btn-secondary` | 白底灰边 |
| `.btn-ghost` | 透明，hover 浅主色底 |
| `.btn-success/warning/danger/inverse` | 语义变体 |
| `.btn-sm/lg/xl` | 尺寸 |
| `.btn-block` | 宽度 100% |
| `.btn-icon` | 正方形图标按钮（38px） |
| `.btn-square` | 正方形（40px） |
| `.btn-group` | 拼接按钮组 |
| `.btn-text` | 无底色的文字按钮 |
| `.is-loading` | 纯 CSS 转圈，文字自动隐藏 |
| `.is-active` | 按钮组内的选中态（需自定义背景） |

---

## 7. 卡片

```html
<!-- 默认：左色条卡片，可整体做链接 -->
<a class="card" href="/post/1">
  <h3 class="card-title">标题</h3>
  <p class="card-text">描述文字。</p>
  <div class="card-meta">
    <span class="chip">记录</span>
    <span>·</span><span>2026-11-08</span>
  </div>
</a>

<!-- 位置变体 -->
<div class="card card-top">顶部色条</div>
<div class="card card-plain">无色条</div>
<div class="card card-flat">灰底无阴影</div>

<!-- 语义色 -->
<div class="card card-success">…</div>
<div class="card card-warning">…</div>
<div class="card card-danger">…</div>
<div class="card card-info">…</div>

<!-- 带页脚 -->
<div class="card">
  <h3 class="card-title">标题</h3>
  <p class="card-text">正文</p>
  <div class="card-footer">
    <span>12 次阅读</span>
    <a class="btn btn-sm" href="#">阅读</a>
  </div>
</div>

<!-- 组合：列表 / 网格 / 标签行 -->
<div class="card-list">
  <a class="card" href="#">…</a>
  <a class="card" href="#">…</a>
</div>

<div class="card-grid">
  <div class="card">…</div>
  <div class="card">…</div>
</div>
<div class="card-grid cols-3">…</div>

<div class="card-tags">
  <span class="badge badge-soft">原创</span>
  <a class="tag" href="#">数学</a>
</div>
```

| 类名 | 说明 |
|---|---|
| `.card` | 基础卡片，左 4px 主色条 |
| `.card-top` | 顶部 3px 色条，去左侧条 |
| `.card-plain` | 无彩色条 |
| `.card-flat` | 灰底、无阴影（嵌在卡片里用） |
| `.card-success/warning/danger/info` | 左色条换语义色 |
| `.card-title` / `.card-text` / `.card-meta` / `.card-footer` / `.card-tags` | 内部结构 |
| `.card-list` | 纵向紧凑列表 |
| `.card-grid` / `.cols-2` / `.cols-3` | 自适应 / 固定列网格 |

> 卡片加上 `.cat-*`（见第 8 节）时，**左色条会自动跟随分类色**。

---

## 8. 徽章 / 标签 / 状态

### 8.1 分类色（核心机制）

`.cat-*` 只定义两个局部变量 `--cat`（主色）和 `--cat-soft`（浅底）。加在**任意容器**上，容器内的 `.chip`、以及该容器自己的卡片左色条会自动使用这两个颜色。

```html
<div class="cat-teal">
  <span class="chip">理论</span>
</div>

<a class="card cat-purple" href="#">
  <div class="card-meta"><span class="chip">文学</span></div>
</a>
```

可用配色：`.cat-blue` `.cat-purple` `.cat-teal` `.cat-orange` `.cat-pink` `.cat-red` `.cat-green` `.cat-gray`（暗色主题已自动提亮）。

### 8.2 徽章

```html
<span class="badge">默认</span>
<span class="badge badge-outline">描边</span>
<span class="badge badge-muted">中性</span>
<span class="badge badge-success">已发布</span>
<span class="badge badge-warning">加密</span>
<span class="badge badge-danger">下线</span>
<span class="badge badge-info">信息</span>
<span class="badge badge-purple">原创</span>
<span class="badge badge-soft">软件</span>
<span class="badge badge-dot">在线</span>
```

### 8.3 标签与计数

```html
<a class="tag" href="#">TypeScript</a>
<span class="count">3</span>
```

### 8.4 状态点

```html
<span class="status online">在线</span>
<span class="status away">离开</span>
<span class="status busy">忙碌</span>
<span class="status pulse online">同步中（呼吸）</span>
```

| 类名 | 说明 |
|---|---|
| `.badge` + `-outline/-muted/-success/-warning/-danger/-info/-purple/-soft` | 徽章变体 |
| `.badge-dot` | 前置小方块 |
| `.tag` | 可点击标签 |
| `.chip` | 分类色块（依赖 `--cat` / `--cat-soft`） |
| `.status` + `online/away/busy/pulse` | 状态点 |
| `.count` | 红底数字角标 |

---

## 9. 提示框

```html
<div class="notice">默认提示，左色条标语气。</div>
<div class="notice notice-success">操作已成功保存。</div>
<div class="notice notice-warning">该文章已加密。</div>
<div class="notice notice-danger">构建失败：缺少 category 字段。</div>
<div class="notice notice-info">PDF 会新窗口打开。</div>

<!-- 带标题的横幅 -->
<div class="banner">
  <div class="banner-body">
    <h3>横幅标题</h3>
    <p>说明文字。</p>
  </div>
  <button class="banner-close">✕</button>
</div>
```

| 类名 | 说明 |
|---|---|
| `.notice` + `-success/-warning/-danger/-info` | 提示条；语义变体会同时染底色与文字色 |
| `.banner` / `.banner-body` / `.banner-close` | 顶部公告横幅 |
| `.help-text` | 字段下方帮助文字 |
| `.field-error` / `.error-text` | 字段下方错误文字 |

---

## 10. 表单

```html
<div class="field">
  <label class="label" for="title">标题<span class="req">*</span></label>
  <input id="title" type="text" placeholder="请输入标题">
  <span class="help-text">发布前会自动去除首尾空格。</span>
</div>

<div class="field">
  <label class="label">分类</label>
  <select><option>记录</option><option>文学</option></select>
</div>

<div class="field">
  <label class="label">摘要</label>
  <textarea placeholder="一句话简介…"></textarea>
  <span class="field-error">摘要不能为空。</span>
</div>

<!-- 搜索框（放大镜为纯 CSS，呈方框形，不出圆角） -->
<div class="search">
  <input type="search" placeholder="搜索文章…">
</div>

<!-- 输入组 -->
<div class="input-group">
  <span class="input-addon">https://</span>
  <input class="input" type="text" value="guiyihan.top">
  <span class="input-addon">.md</span>
</div>

<!-- 复选 / 单选 / 开关 -->
<label class="check"><input type="checkbox" checked> 原创</label>
<label class="radio"><input type="radio" name="acc" checked> 公开</label>
<label class="radio"><input type="radio" name="acc"> 受保护</label>
<label class="switch">
  <input type="checkbox" checked>
  <span class="track"></span>
  定时发布
</label>

<!-- 滑块 -->
<input type="range" min="0" max="100" value="60">

<!-- 两列表单 -->
<div class="form-grid">
  <div class="field">…</div>
  <div class="field">…</div>
  <div class="field full">…</div>       <!-- 跨两列 -->
  <div class="form-actions full">        <!-- 底部按钮区 -->
    <button class="btn">保存</button>
    <button class="btn btn-secondary">取消</button>
  </div>
</div>
```

> 裸 `input` / `select` / `textarea` 就已有完整样式，**不必加类**。`.input` 类仅用于需要覆盖 `input[type]` 选择器的场景。

| 类名 | 说明 |
|---|---|
| `.field` / `.label` / `.req` | 字段容器 / 标签 / 必填星号 |
| `.input-sm` / `.input-lg` | 输入框尺寸 |
| `.input-addon` | 输入组前后缀 |
| `.check` / `.radio` / `.switch` + `.track` | 复选 / 单选 / 直角开关 |
| `.check-group` / `.radio-group` | 纵向排列 |
| `.search` | 带放大镜的搜索框 |
| `.form-grid` / `.full` / `.form-actions` | 两列表单栅格 |
| `.is-invalid` / `.is-valid` | 校验态边框色 |
| `:disabled` / `[readonly]` | 自动灰化 |

---

## 11. 表格

```html
<!-- 外包卡片：有边框、无外溢 -->
<div class="table-card">
  <table>
    <thead><tr><th>项目</th><th>内容</th><th class="num">数量</th></tr></thead>
    <tbody>
      <tr><td>站名</td><td>Guiyihan 的博客</td><td class="num">1</td></tr>
      <tr><td>技术栈</td><td>Astro + bun</td><td class="num">2</td></tr>
    </tbody>
  </table>
</div>

<!-- 窄屏横向滚动 -->
<div class="table-wrap"><table>…</table></div>

<!-- 行内操作按钮 -->
<div class="table-actions">
  <button class="btn btn-sm btn-secondary">编辑</button>
  <button class="btn btn-sm btn-danger">删除</button>
</div>
```

裸 `table` 已有斑马纹、hover 高亮、表头灰底。

---

## 12. 导航组件

```html
<!-- 面包屑 -->
<ul class="breadcrumb">
  <li><a href="#">首页</a></li>
  <li><a href="#">文章</a></li>
  <li><span aria-current="page">正文</span></li>
</ul>

<!-- 分页 -->
<nav class="pagination">
  <span class="is-disabled">上一页</span>
  <a href="#" class="is-active">1</a>
  <a href="#">2</a>
  <a href="#">下一页</a>
</nav>

<!-- 筛选器 -->
<div class="filters">
  <a href="#" class="is-active">全部</a>
  <a href="#">记录</a>
  <a href="#">文学</a>
</div>

<!-- 标签页 -->
<div class="tabs">
  <button class="is-active">全部</button>
  <button>原创</button>
  <button>搬运</button>
</div>

<!-- 侧边图标导航 -->
<nav class="side-nav">
  <div class="nav-title">分类</div>
  <a href="#" class="is-active"><i class="fas fa-home"></i> 首页</a>
  <a href="#"><i class="fas fa-book"></i> 文章</a>
</nav>

<!-- 目录 TOC -->
<nav class="toc">
  <ol>
    <li class="is-active"><a href="#s1">第一节</a>
      <ol><li><a href="#s1-1">子节</a></li></ol>
    </li>
    <li><a href="#s2">第二节</a></li>
  </ol>
</nav>
```

| 类名 | 说明 |
|---|---|
| `.breadcrumb` | 斜杠分隔，`aria-current="page"` 自动加粗 |
| `.pagination` + `.is-active` / `.is-disabled` | 拼接式分页，无圆角 |
| `.filters` + `.is-active` | 分类筛选按钮组 |
| `.tabs` + `.is-active` | 下划线标签页 |
| `.side-nav` + `.nav-title` + `.is-active` | 左侧色条导航 |
| `.toc` + `.is-active` | 目录，支持嵌套缩进 |

---

## 13. 列表型组件

### 13.1 资源条 `.entry`

```html
<ul class="entry-list">
  <li class="entry">
    <div class="entry-body">
      <div class="entry-title">线性代数讲义.pdf</div>
      <div class="entry-desc">2026-10-30 · 学习</div>
    </div>
    <div class="entry-actions">
      <a class="btn btn-outline btn-sm" href="#">PDF</a>
      <a class="btn btn-sm" href="#">查看</a>
    </div>
  </li>
</ul>
```

### 13.2 友链/成员卡 `.tile`

```html
<div class="tile">
  <img src="/avatar.jpg" alt="">
  <div>
    <h3>站点名</h3>
    <p>一句话描述</p>
    <a href="#">https://example.com</a>
  </div>
</div>
```

### 13.3 步骤条 `.steps`

```html
<ol class="steps">
  <li>
    <span class="step-title">写文章</span>
    <p class="step-desc">在 posts 目录新建 md。</p>
  </li>
  <li>
    <span class="step-title">本地预览</span>
    <p class="step-desc">bun run dev 检查排版。</p>
  </li>
</ol>
```

### 13.4 数字卡 `.stats`

```html
<div class="stats">
  <div class="stat">
    <div class="stat-value">128</div>
    <div class="stat-label">文章</div>
  </div>
</div>
```

### 13.5 时间线 `.timeline`

```html
<ul class="timeline">
  <li><span class="time">2026-11-08</span>新增 CCS 样式表</li>
  <li><span class="time">2026-11-01</span>写作工作台上线</li>
</ul>
```

---

## 14. 文章正文

```html
<main class="main">
  <div class="page container container-narrow">
    <h1 class="page-title">文章标题</h1>

    <div class="article-meta">
      <span class="item"><i class="far fa-calendar"></i> 2026-11-08</span>
      <span class="item"><i class="fas fa-folder"></i> 记录</span>
      <span class="item"><i class="far fa-clock"></i> 8 分钟</span>
      <span class="item"><i class="fas fa-pen-nib"></i> 原创</span>
    </div>

    <article class="article-body">
      <h2>二级标题（自动带上分隔线）</h2>
      <p>正文……</p>
      <h3>三级标题</h3>
      <p>公式 $a^2+b^2=c^2$ 超长时自动横向滚动，不撑破布局。</p>
    </article>

    <nav class="post-nav">
      <a href="#"><span class="dir">← 上一篇</span>分类配色体系</a>
      <a href="#" class="next"><span class="dir">下一篇 →</span>写作工作台</a>
    </nav>
  </div>
</main>
```

密码框：

```html
<div class="lock-box">
  <div class="lock-icon"><i class="fas fa-lock"></i></div>
  <h3>文章已加密</h3>
  <p>请输入密码查看内容</p>
  <input type="password" placeholder="请输入密码">
  <button class="btn">解锁</button>
</div>
```

---

## 15. 浮层：下拉 / 模态 / Toast / Tooltip

### 15.1 下拉菜单

```html
<div class="dropdown" id="dd">
  <button class="btn btn-secondary">操作 ▾</button>
  <div class="dropdown-menu">
    <a href="#">编辑</a>
    <a href="#">复制链接</a>
    <div class="divider"></div>
    <button>删除</button>
  </div>
</div>
```

- `:hover` 自动展开；
- 点击式：给 `.dropdown` 加 `.is-open`。

### 15.2 模态

```html
<div class="modal-mask" id="modal">
  <div class="modal">
    <div class="modal-head">
      <h3>确认删除</h3>
      <button class="close" data-close>✕</button>
    </div>
    <div class="modal-body">删除后不可恢复。</div>
    <div class="modal-foot">
      <button class="btn btn-secondary" data-close>取消</button>
      <button class="btn btn-danger">删除</button>
    </div>
  </div>
</div>
```

给 `.modal-mask` 加 `.is-open` 显示（`display:flex`）。

### 15.3 Toast

```html
<div class="toast-wrap">
  <div class="toast success">保存成功</div>
  <div class="toast error">保存失败</div>
  <div class="toast warning">请检查网络</div>
</div>
```

`.toast-wrap` 默认固定在右下角；想在文档流里演示就覆盖 `position`。

### 15.4 Tooltip（零 JS）

```html
<span class="badge" data-tip="原创文章">原创</span>
<span class="badge" data-tip="向左弹出" data-tip-pos="left">左</span>
<span class="badge" data-tip="贴边对齐" data-tip-pos="right">右</span>
```

默认在上方居中；`data-tip-pos="left|right"` 改为对齐左/右边缘，避免出屏。

### 15.5 遮罩

```html
<div class="overlay is-open" id="overlay"></div>
```

---

## 16. 杂项组件

```html
<!-- 分组标题：横线 + 文字 + 横线 -->
<div class="divider-label">分组标题</div>

<!-- 骨架屏 -->
<div class="skeleton" style="width:60%;height:14px"></div>

<!-- 头像 -->
<img class="avatar avatar-sm" src="…">
<img class="avatar" src="…">
<img class="avatar avatar-lg" src="…">

<!-- 进度条 -->
<div class="progress"><span style="width:64%"></span></div>

<!-- 二维码框 -->
<div class="qr-box"><img src="/qr.png" alt="二维码"></div>

<!-- 代码块 + 复制按钮（按钮 hover 才出现） -->
<div class="code-block">
  <button class="copy-btn">复制</button>
  <pre><code>…</code></pre>
</div>

<!-- 主题切换 / 汉堡按钮 -->
<button class="theme-toggle"><i class="fas fa-sun"></i></button>
<button class="menu-toggle"><i class="fas fa-bars"></i></button>

<!-- 顶部滚动进度 -->
<div class="scroll-progress"></div>

<!-- 跑马灯式筛选行（复用 inline） -->
<div class="inline"><span class="badge">A</span><span class="badge">B</span></div>
```

---

## 17. 零类名兜底（裸 HTML 也能看）

**为什么需要这一节**：ccs.css 里绝大部分组件样式是**靠加类触发**的——不写 `.btn` 就没有按钮外观，不写 `.card` 就没有卡片边框。如果一段 HTML 一个类都没加，页面就只剩 `body` / `h1~h6` / `p` / `a` / `table` 这些标签级规则在工作，看起来非常像「CSS 没加载成功」。

第 17 节里的规则专门补齐这批**裸标签**的默认呈现，让「一个 class 都不加」的 HTML 也直接能用。

### 17.1 生效范围

| 裸标签 | 兜底后效果 |
|---|---|
| `body > h1 ~ h6 / p / ul / ol / dl / table / pre / blockquote / figure / hr / fieldset` | 自动居中，最大宽度 760px（最佳阅读行宽） |
| `body > form` | 白底卡片 + 左侧主色条 + 内边距，宽 760px 居中 |
| `label`（无 class） | 块级、14px 加粗，和 `.label` 一致 |
| `input` / `select` / `textarea`（无 class） | 统一样式：白底、1px 边框、2px 圆角、9px/12px 内边距、占满整行 |
| `input[type=checkbox]` / `[type=radio]` | 例外处理：不占整行，跟随文字基线 |
| `input[type=submit]` | 主色实心按钮（等同 `.btn`） |
| `input[type=button]` / `[type=reset]` | 描边按钮（等同 `.btn-outline`） |
| `button`（无 class） | 描边按钮，不再是浏览器原生灰按钮 |
| `output` | 主色浅底徽章，像个结果框 |
| `fieldset` / `legend` | 带边框分组 + 分组标题 |

### 17.2 关键修正：无 `type` 属性的 `input`

最常见的写法是：

```html
<input id="a" name="a">
```

它**没有 `type` 属性**，等价于 `type="text"`。但 CSS 属性选择器 `input[type="text"]` 是**匹配不到**它的——旧版 ccs.css 就是栽在这里，导致这类输入框完全拿不到样式，只剩浏览器原生外观。

同理 `<input type="submit">` 也不属于 `.btn` 体系，旧版会保持原生灰按钮。

现在这两处都修好了：表单控件选择器改成**排除法**，`input[type=submit|button|reset]` 和裸 `<button>` 补了与 `.btn` 一致的兜底外观。

```css
:where(input:not([type="checkbox"]):not([type="radio"]):not([type="range"])
        :not([type="color"]):not([type="hidden"]):not([type="submit"])
        :not([type="button"]):not([type="reset"]):not([type="image"]),
       select, textarea, .input) { … }
```

好处：

- 任何「文本型」的 input（含无 `type`、含未来新增的 `type="week"` 等）都被覆盖，不用逐个列举；
- 复选框 / 单选 / 滑块 / 隐藏域等特殊控件被显式排除，不受影响；
- 外层用 `:where()` 包了一层，**权重为 0**，所以 `.input-sm` / `.search input` 之类组件规则依然能正常覆盖它，不会被兜底样式压住。

### 17.3 使用建议

- **只想快速写个能看的页面**：什么都不用加，直接写裸标签，落在 `body` 或 `body > main/section/article` 下即可。
- **想要精细控制**：照常加类（`.page` / `.field` / `.btn` …），兜底样式不会干扰——它对 `.btn` `.card` 等已命名的组件**一律不生效**（选择器都带 `:not([class])`，或只作用于 `body` 的直接子级）。
- **不想要这层兜底**：把 ccs.css 第 17 节整段删掉即可，其余功能不受影响。
- **注意 `body > form` 的卡片外观**：如果你在自己的表单外面已经套了 `.card`，不要让 `<form>` 同时又是 `body` 的直接子级，否则会出现「双层边框」。把 `<form>` 放进 `.card` 里面即可。

### 17.4 一个 Class 都不加的最小示例

```html
<link rel="stylesheet" href="ccs.css">

<h1>A + B 计算器</h1>

<form>
  <label for="a">A</label>
  <input id="a" name="a" inputmode="decimal">

  <label for="b">B</label>
  <input id="b" name="b" inputmode="decimal">

  <input type="submit" value="计算 A + B">
</form>

<p>结果：<output id="sum">—</output></p>
```

整页零 class，但标题有层级、表单是白色卡片带主色条、输入框有描边和内边距、提交按钮是主色实心块、结果是主色徽章。可直接打开 `ccs-bare.html` 对照。

---

## 18. 工具类

| 类名 | 效果 |
|---|---|
| `.stack` / `.stack-sm` | 纵向 flex，gap 12px / 8px |
| `.inline` | 横向 flex，wrap，垂直居中 |
| `.between` | 两端对齐 |
| `.center` | 水平垂直居中 |
| `.mt-0/2/4/6/8`，`.mb-0/2/4/6/8` | 外边距（带 `!important`） |
| `.text-muted` / `.text-faint` | 文字色 |
| `.text-sm` / `.text-xs` | 字号 |
| `.text-center` / `.text-right` | 对齐 |
| `.uppercase` | 大写字距小标题 |
| `.mono` | 等宽字体 |
| `.w-full` | 宽度 100% |
| `.is-hidden` | `display:none !important` |
| `.sr-only` | 屏读可见、视觉隐藏 |

---

## 19. 响应式

| 断点 | 行为 |
|---|---|
| `≤1024px` | `.grid-3/4`、`.card-grid.cols-3` 降为 2 列 |
| `≤880px` | `.menu-toggle` 显示；`.sidebar` 变抽屉（`position:fixed` + `translateX(-100%)`，加 `.is-open` 滑出）；`.layout-side` 改块级；卡片网格与表单栅格变 1 列；`.nav-bar` 隐藏 |
| `≤560px` | 标题字号降一档；`.entry` 换行、按钮撑满；`.tile` 纵向排列 |
| `print` | 隐藏顶栏/侧栏/浮动元素，转黑白高对比，卡片与代码块禁止分页断开 |
| `prefers-reduced-motion` | 关闭动效与平滑滚动 |

抽屉 JS 示例：

```js
const sb = document.getElementById('sidebar');
const ov = document.getElementById('overlay');
document.getElementById('menuToggle').onclick = () => {
  sb.classList.toggle('is-open');
  ov.classList.toggle('is-open');
};
ov.onclick = () => {
  sb.classList.remove('is-open');
  ov.classList.remove('is-open');
};
```

---

## 20. 接入现有博客的建议

现有 `global.css` 与 CCS **类名大量重叠**（`.card` `.btn` `.tag` `.notice` `.nav` `.sidebar`…），直接同时引入会互相覆盖。两种安全做法：

### 方案 A：逐页新写（推荐，零风险）

新页面只引 CCS，不引 `global.css`：

```astro
---
// 新页面布局：只引 ccs.css
import '../styles/ccs.css';
---
```

适合做独立落地页、工具页、活动页。

### 方案 B：整站迁移（需要一次改名）

| 旧类名 | 新类名 |
|---|---|
| `.nav`（侧栏导航） | `.side-nav` |
| `.cat-jilu / wenxue / lilun / xuexi / shenghuo / pinglun` | `.cat-blue / cat-purple / cat-teal / cat-orange / cat-pink / cat-red` |
| `.cat-chip` | `.chip` |
| `.category-filters` | `.filters` |
| `.res-list` / `.res-list li` | `.entry-list` / `.entry` |
| `.friend-grid` / `.friend-card` | `.card-grid` / `.tile` |
| `.password-box` | `.lock-box` |
| `.badges .badge.original/.repost/.public/.protected` | `.badge` + `.badge-soft/.badge-muted/.badge-success/.badge-warning` |
| `.content` | `.page` |
| `.layout` | `.layout-side` |
| `#decryptedContent` 的重复排版规则 | 统一用 `.article-body` |

需要同步改动的位置：`BaseLayout.astro`、`Topbar.astro`、`Sidebar.astro`、`ArticleCard.astro`、`ArticleMeta.astro`、`index.astro`、`articles/index.astro`、`articles/[...slug].astro`、`about.astro`、`friends.astro`、`resources.astro`、`guestbook.astro`、`reward.astro`、`lib/categories.ts`。

迁移前建议先 `bun run dev` 开一个分支验证，确认无视觉回退后再合并。

---

## 21. 类名速查表

| 分组 | 类名 |
|---|---|
| **布局** | `.container` `.container-narrow/-wide/-full` `.row` `.col` `.grid` `.grid-2/3/4/auto/auto-lg` `.shell` `.header` `.brand` `.spacer` `.nav-bar` `.main` `.page` `.page-head` `.page-title` `.page-sub` `.eyebrow` `.footer` `.layout-side` `.sidebar` |
| **按钮** | `.btn` `.btn-outline/-secondary/-ghost/-success/-warning/-danger/-inverse` `.btn-sm/lg/xl/block/icon/square` `.btn-group` `.btn-text` `.is-loading` |
| **卡片** | `.card` `.card-top/-plain/-flat/-success/-warning/-danger/-info` `.card-title/-text/-meta/-footer/-tags` `.card-list` `.card-grid` `.cols-2/3` |
| **徽章** | `.badge` `-outline/-muted/-success/-warning/-danger/-info/-purple/-soft/-dot` `.tag` `.chip` `.status` `.count` `.cat-blue/purple/teal/orange/pink/red/green/gray` |
| **提示** | `.notice` `-success/-warning/-danger/-info` `.banner` `.banner-body` `.banner-close` `.help-text` `.field-error` |
| **表单** | `.field` `.label` `.req` `.input` `.input-sm/lg` `.input-group` `.input-addon` `.textarea` `.check` `.radio` `.switch` `.track` `.check-group` `.form-grid` `.full` `.form-actions` `.search` `.is-invalid/-valid` |
| **表格** | `.table-card` `.table-wrap` `.table-sm` `.table-fixed` `.table-actions` `.num` |
| **导航** | `.breadcrumb` `.pagination` `.filters` `.tabs` `.toc` `.side-nav` `.nav-title` `.profile` `.avatar` `.contact-list` |
| **列表** | `.entry-list` `.entry` `.entry-body/-title/-desc/-actions` `.tile` `.steps` `.step-title/-desc` `.stats` `.stat` `.stat-value/-label` `.timeline` `.time` |
| **文章** | `.article` `.article-body` `.article-meta` `.post-nav` `.dir` `.next` `.lock-box` `.lock-icon` |
| **浮层** | `.dropdown` `.dropdown-menu` `.divider` `.modal-mask` `.modal` `.modal-head/-body/-foot` `.toast-wrap` `.toast` `.overlay` `[data-tip]` `[data-tip-pos]` |
| **杂项** | `.divider-label` `.skeleton` `.avatar-sm/lg` `.progress` `.qr-box` `.caption` `.code-block` `.copy-btn` `.theme-toggle` `.menu-toggle` `.scroll-progress` |
| **工具** | `.stack` `.stack-sm` `.inline` `.between` `.center` `.mt-*` `.mb-*` `.text-*` `.uppercase` `.mono` `.w-full` `.is-hidden` `.sr-only` |
| **状态** | `.is-active` `.is-open` `.is-loading` `.is-disabled` `.is-invalid` `.is-valid` `.is-hidden` |
| **零类名兜底** | 无需任何类名：`body > h1~h6/p/ul/ol/table/form/hr` · 裸 `label` · 裸 `input`/`select`/`textarea` · `input[type=submit]` · 裸 `button` · `output` · `fieldset`/`legend` |
