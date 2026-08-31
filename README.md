# 人工智能极客之家（AI-new）

基于 **Astro** + **bun** 重建的个人站点，复刻原静态站 `AI-geek` 的视觉效果，并把「最新文章」改为按日期动态生成、「热门资源」改为由 Markdown 里的 `hot` 标记决定。

新增功能：
- ✅ **亮/暗模式切换**：右上角日月图标切换，跟随系统偏好，记忆用户选择
- ✅ **文章 AES-256-GCM 加密**：受保护文章正文加密存储，用户输入密码解密，同会话免重复输入
- ✅ **评论区主题同步**：Giscus 评论区自动跟随站点亮/暗模式

线上地址：<https://atom1st.github.io>

---

## 一、本地开发与构建

需要本机已安装 [bun](https://bun.sh)（推荐）或 Node.js 20+。

```bash
# 安装依赖
bun install

# 本地预览（带热更新，默认 http://localhost:4321）
bun run dev

# 类型检查
bun run check

# 生成静态站点到 dist/
bun run build

# 本地预览构建产物
bun run preview
```

> 修改任意 `.md` 或 `.astro` 文件后，`bun run dev` 会自动刷新，无需重启。

---

## 二、目录结构

```
src/
├── site.ts                 # 站点信息：标题、头像、导航菜单、联系方式
├── content.config.ts       # 文章/资源集合的字段定义（frontmatter schema）
├── data/
│   └── articles.json       # 所有文章/资源的元数据（构建脚本生成，需提交）
├── components/             # 复用组件（Topbar / Sidebar / ArticleCard / ArticleMeta / Giscus）
├── layouts/
│   └── BaseLayout.astro     # 全站框架（顶栏 + 侧边栏 + 全局样式 + KaTeX）
├── lib/
│   ├── reading.ts           # 字数 / 阅读时长统计
│   └── content-crypto.ts    # AES-256-GCM 加密/解密工具
├── pages/                  # 路由（一个 .astro 文件 = 一个页面）
│   ├── index.astro          # 主页（最新文章 + 热门资源 + 快速导航）
│   ├── articles/
│   │   ├── index.astro      # 文章列表
│   │   └── [...slug].astro  # 单篇文章/资源页（按 md 文件名路由）
│   ├── resources.astro      # 资源列表
│   ├── friends.astro        # 友链
│   ├── about.astro          # 关于（读取 about.md）
│   ├── guestbook.astro      # 留言板（Giscus 评论）
│   └── reward.astro         # 打赏
├── content/
│   └── posts/               # 所有文章与资源，都是 .md 文件
└── styles/
    └── global.css           # 全局样式（与原站 style.css 一致）
scripts/
├── encrypt-content.ts       # 构建脚本：加密受保护文章 + 生成 articles.json
└── gen-password-hash.js     # 独立密码哈希生成器（仅供参考，encrypt 脚本已内置）
public/
└── encrypted/               # 加密后的文章内容（.json），需提交
.github/
└── workflows/
    └── deploy.yml           # GitHub Actions 自动部署
```

---

## 三、写一篇新文章

在 `src/content/posts/` 下新建一个 `.md` 文件，文件名就是网址（去掉 `.md`）。
例如 `src/content/posts/my-post.md` → 访问 `/articles/my-post`。

文件头部写 frontmatter：

```md
---
title: 文章标题
date: 2026-08-28          # 发布日期，决定"最新文章"排序
category: 教程            # 分类
tags: [人工智能, 入门]     # 标签，可多个
description: 一句话简介     # 卡片与列表里显示的摘要
type: article             # article=文章；resource=资源；page=独立页(如关于)
origin: original          # original=原创；repost=搬运（显示徽章）
access: public            # public=公开；protected=受保护（需密码）
---
正文用 Markdown 书写，支持：

- 代码块
- 数学公式：行内 $E=mc^2$，独立块用 $$ \frac{a}{b} $$（已接入 KaTeX）
- 表格、引用、列表等标准语法
```

保存后它会出现在：

- 主页「最新文章」区块（按 `date` 倒序，取前若干篇）
- 「文章」页 `/articles`

### 3.1 文章加密（AES-256-GCM 受保护内容）

加密采用 **AES-256-GCM** 算法 + **PBKDF2** 密钥派生（100k 迭代），受保护文章的正文以密文形式存储在 `public/encrypted/` 目录，`dist/` 构建产物中不含明文。

**添加/修改受保护文章的流程：**

1. 在 frontmatter 中设置 `access: protected`，并写入**明文密码**：
   ```md
   ---
   title: 秘密文档
   date: 2026-08-31
   category: 内部
   access: protected
   password: 你的密码
   ---
   ```

2. 运行加密脚本（自动生成 `articles.json` 和 `public/encrypted/*.json`）：
   ```bash
   bun run encrypt
   ```

3. 提交生成的文件并推送：
   ```bash
   git add -A
   git commit -m "添加/更新加密文章"
   git push origin main
   ```

> **重要**：`src/data/articles.json` 和 `public/encrypted/*.json` **必须提交到仓库**。
> GitHub Actions 构建时不会运行 encrypt 脚本，直接使用已提交的 `articles.json`。
> 如果忘记运行 `bun run encrypt` 就推送，加密文章将不会出现在线上。

### 3.2 删除 / 修改文章

**删除公开文章**：直接删除对应的 `.md` 文件，然后运行一次 `bun run encrypt` 刷新 `articles.json`（否则该文章仍会残留在列表数据里）：

```bash
# 删除 src/content/posts/xxx.md
bun run encrypt
git add -A
git commit -m "删除文章 xxx"
git push origin main
```

**删除受保护文章**：除了删除 `.md` 源文件，还要**手动删除**对应的 `public/encrypted/{slug}.json` 密文文件，再运行 `bun run encrypt`（该命令会同步更新 `.gitignore`，移除已删除文章的忽略规则）：

```bash
# 1. 删除 src/content/posts/xxx.md
# 2. 删除 public/encrypted/xxx.json
# 3. 重新生成元数据
bun run encrypt
git add -A
git commit -m "删除受保护文章 xxx"
git push origin main
```

**修改公开文章**：直接编辑 `.md` 文件即可，`dev` 会自动刷新。若修改了 `title / date / description` 等能在列表显示的字段，建议也跑一次 `bun run encrypt` 让 `articles.json` 同步，否则列表页显示的是旧元数据。

**修改受保护文章的密码或正文**：编辑 `.md`（改 `password` 或正文）→ `bun run encrypt` 重新加密 → 提交生成的 `public/encrypted/*.json` 与 `articles.json` 并推送。

---

## 四、添加一个资源 / 让它出现在「热门资源」

资源也是 `.md`，区别只在前置字段：

```md
---
title: 2026 丘成桐夏令营课件
date: 2026-08-20
category: 资源
tags: [PDF, 下载]
description: 大学数学与人工智能讲义。
hot: true                # ← 关键：加上这一行就进主页「热门资源」和资源页
type: resource
---
下载链接、说明等正文……
```

- 只写 `type: resource`、不写 `hot`：仅在「资源」页 `/resources` 显示，不进主页热门区。
- 写 `hot: true`：同时进主页「热门资源」和「资源」页。
- 「热门资源」的**唯一判定依据就是 md 里的 `hot` 字段**，改这里即可增减，无需改任何页面代码。

---

## 五、修改关于页 / 独立页

关于页内容在 `src/content/posts/about.md`（`type: page`，不会进文章列表）。
直接编辑该文件即可，样式沿用全站模板。

---

## 六、添加友链

编辑 `src/pages/friends.astro`，在 `.friend-grid` 里复制一个 `.friend-card` 块：

```astro
<div class="friend-card">
  <img src="头像URL" alt="头像" />
  <div>
    <h3>站点名</h3>
    <p>一句话描述</p>
    <a href="https://友链地址" target="_blank" rel="noopener">https://友链地址</a>
  </div>
</div>
```

底部「本站信息」表格同理直接改文字。

---

## 七、改站点信息（标题 / 头像 / 导航 / 联系方式）

全部集中在 `src/site.ts`：

```ts
export const site = {
  title: '人工智能极客之家',
  name: 'Guiyihan',
  bio: '人工智能极客之家',
  avatar: '/my.jpg',          // 放在 public/ 下的图片，如 public/my.jpg
  nav: [                      // 顶部/侧边栏导航菜单
    { href: '/', label: '主页', icon: 'fa-house' },
    // ...新增菜单项就在此加一行
  ],
  contact: [                  // 侧边栏联系方式
    { icon: 'fa-envelope', label: '邮箱', href: 'mailto:...' },
  ],
};
```

- 换头像：把图片放进 `public/`，改 `avatar` 路径。
- 加导航项：在 `nav` 数组加一项（`icon` 用 Font Awesome 类名，如 `fa-link`）。

---

## 八、改样式

全局样式在 `src/styles/global.css`，配色等变量在文件顶部 `:root` 里（与原站一致）。
直接改这里即可影响全站。

---

## 九、部署（GitHub Pages）

### 自动部署

仓库已配置 `.github/workflows/deploy.yml`：每次 push 到 `main` 会自动执行 `bun install → bun run build → 部署 dist/`。

前提（一次性设置）：仓库 `Settings → Pages → Build and deployment → Source` 选 **GitHub Actions**。

```bash
# 提交并推送即触发部署
git add -A
git commit -m "更新内容"
git push origin main
```

约 1–2 分钟后访问 <https://atom1st.github.io> 即为最新版。

### 完整工作流

**日常改文章（公开）**：直接编辑 `src/content/posts/` 下的 md 文件 → 推送即可。

**添加/修改受保护文章**：

```bash
# 1. 编辑 md 文件（设置 access: protected + password: 明文密码）
# 2. 运行加密脚本
bun run encrypt
# 3. 提交并推送（articles.json 和 encrypted/*.json 会提交到仓库）
git add -A
git commit -m "添加/更新加密文章"
git push origin main
```

> **注意**：本仓库 Pages 来源是 GitHub Actions，**不要**切回「从分支部署」，
> 否则 GitHub 会用 Jekyll 去解析 `.astro` 源文件而报错。

### 9.1 给 AI 的部署指南（本仓库注意事项）

把这个仓库交给 AI 帮忙维护 / 部署时，请遵循以下要点，避免踩坑：

- **不要改 GitHub Pages 来源**：部署方式固定为「GitHub Actions」，切回「从分支部署」会被 Jekyll 解析 `.astro` 报错。如误切回，请到 `Settings → Pages` 改回「GitHub Actions」。
- **不要把加密文章源文件提交上去**：受保护文章的 `.md` 会由 `bun run encrypt` 自动加入 `.gitignore`。人工新增受保护文章时请记得运行该命令，**不要** `git add -f` 强制提交明文 md。
- **每次推送前先本地验证**：依赖全新检出时先 `bun install`（首次）或 `bun install --frozen-lockfile`（CI 一致），再 `bun run build` 确认 0 报错。若新加了依赖，记得提交 `bun.lock`。
- **绝不能跳过 `bun run encrypt`**：CI 构建时**不会**运行加密脚本，`articles.json` 和 `public/encrypted/*.json` 必须已提交。忘记运行会导致加密文章列表缺失。
- **删除/改名文章时要同步清理**：删除受保护文章需同时删 `public/encrypted/{slug}.json`；删除/改名任何文章后都运行一次 `bun run encrypt` 刷新 `articles.json`。
- **文章路由与文件名强相关**：`src/content/posts/{name}.md` → `/articles/{name}`。改动文件名即改变 URL，会产生死链，改名时留意其他页面引用。
- **常见报错提示**：
  - 404 打不开某篇文章 → 检查该文章 md 是否被 `.gitignore` 忽略而未提交（受保护文章常见）。
  - 页面无 header/侧边栏样式 → 确认页面继承了 `BaseLayout`（`import BaseLayout from '../layouts/BaseLayout.astro'`），样式来自 `src/styles/global.css`。
  - 新页面无菜单 → 在 `src/site.ts` 的 `nav` 数组加一项。
- **完整操作流程（AI 自助部署）**：
  1. `git pull` 拉取最新代码
  2. 新增文章：在 `src/content/posts/` 写 md；受保护文章设置 `access: protected` + `password` 明文密码
  3. `bun run encrypt`（新增/删除/修改任何文章后都建议跑一次）
  4. `bun run build` 本地验证，产物正常
  5. `git add -A && git commit -m "..." && git push origin main`
  6. 等 GitHub Actions 构建约 1–2 分钟，访问线上地址确认

---

## 十、常用速查

| 想做的事 | 改哪里 |
| --- | --- |
| 发文章 | `src/content/posts/` 新建 `.md`（`type: article`） |
| 发资源 | 同上，`type: resource` |
| 进主页热门 | md 里加 `hot: true` |
| 文章加密 | md 里加 `access: protected` + `password: 明文密码`，然后 `bun run encrypt` |
| 删除文章 | 删除 `.md`（受保护还要删 `public/encrypted/*.json`），然后 `bun run encrypt` |
| 改关于页 | `src/content/posts/about.md` |
| 加友链 | `src/pages/friends.astro` |
| 改标题/头像/菜单/联系方式 | `src/site.ts` |
| 改外观配色 | `src/styles/global.css` 顶部 `:root` |
| 加导航页 | 在 `src/pages/` 新建 `.astro` 并在 `site.ts` 的 `nav` 加链接 |

---

## 十一、亮/暗模式说明

- 右上角顶栏显示 日/月 图标，点击切换
- 首次访问跟随系统偏好（`prefers-color-scheme`）
- 用户手动切换后记忆到 `localStorage`，下次访问恢复选择
- Giscus 评论区自动同步主题变化
- CSS 变量在 `src/styles/global.css` 的 `:root`（亮色）和 `[data-theme="dark"]`（暗色）中定义
