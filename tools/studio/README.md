# Studio · 本地写作工作台

一个跑在本机的单页写作工具，专为这个 Astro 博客做的：左边管文章、中间写 Markdown、右边改属性，写完点一下「一键发布」就 build + 推到 GitHub。

- 不联网、不上传、不依赖任何第三方服务
- 数据就是你仓库里的 `src/content/posts/*.md`，没有第二份副本
- 编辑器是 Vditor（本地离线副本，放在 `vendor/`），支持所见即所得 / 分屏 / 源码三种模式

## 启动

双击 `tools/studio/start.cmd`，浏览器会自动打开 <http://127.0.0.1:7788>。

命令行方式：

```bash
node tools/studio/server.mjs
# 指定端口
STUDIO_PORT=8090 node tools/studio/server.mjs
```

首次启动如果缺 `node_modules`，`start.cmd` 会自动跑 `bun install`。

## 能干什么

| 区域 | 功能 |
| --- | --- |
| 左栏 | 按分类筛选、全文搜索、新建文章、文章标记（加密 / 热门 / PDF / 资源 / 页面） |
| 中间 | Vditor 编辑器，Markdown 正文，图片直接拖进来会存到 `public/uploads/YYYYMM/` |
| 右栏 · 属性 | 标题 / slug / 日期 / 分类 / 类型 / 来源 / 访问权限 + 密码 / 摘要 / PDF / 热门 |
| 右栏 · 发布 | 一键发布、单独生成索引、单独 build、git 状态 / 日志 / pull |

一键发布的完整流程：

1. 保存当前 md
2. `bun run encrypt` —— 重新生成 `src/data/articles.json`，并加密受保护文章
3. `bun run build` —— 先验证站点能编译，编不过就不提交
4. `git add -A` → `git commit` → `git push origin <branch>`
5. GitHub Actions 自动部署，1–2 分钟后上线

日志实时滚动在下方抽屉里，任何一步失败会立刻中断并停在那一步。

## 快捷键

| 快捷键 | 动作 |
| --- | --- |
| `Ctrl` + `S` | 保存 |
| `Ctrl` + `Shift` + `P` | 一键发布 |
| `Ctrl` + `Shift` + `N` | 新建文章 |
| `Ctrl` + `K` | 聚焦搜索 |

## 几个约定

- **slug 就是文件名**，线上地址是 `/articles/<slug>`；改名会自动搬 `public/encrypted/<slug>.json`。
- **受保护文章**：`access: protected` + 填密码，密码明文写在本地 md 里（这类文件已被 `.gitignore` 排除），发布时正文会被 AES-GCM 加密到 `public/encrypted/`。
- **新建文章一定要走一遍「生成索引」**，否则 `articles.json` 里没有它，列表页就不会显示。一键发布会自动做。
- 编辑器里的 Markdown 就是博客正文，公式 `$…$` / `$$…$$` / `\(…\)` / `\[…]` 都支持。
- **LaTeX 方括号公式**：源文件保持 `\(…\)` / `\[…]` 写法（与博客 remark 插件一致），编辑器内会自动显示为 `$…$` / `$$…$$` 并正常渲染公式；保存时自动还原成方括号写法，源文件字节级不变。转换逻辑在 `public/math-adapter.js`。

## 目录

```
tools/studio/
├─ server.mjs          HTTP 服务 + 文件操作 + 命令执行（零依赖，只用 node 内置模块）
├─ public/             WebUI（index.html / app.css / app.js）
├─ vendor/dist/       Vditor 3.11.3 离线资源
├─ start.cmd           Windows 启动器
└─ .studio.json        本地偏好（发布时是否构建 / 是否加密），已 gitignore
```

## 注意

- 服务只监听 `127.0.0.1`，不会暴露到局域网。
- 「本地预览」按钮会另起一个 `astro dev`（默认 4321），按 `Ctrl+C` 退出 Studio 时会一并关掉它；直接关窗口则可能残留，需要到任务管理器结束 `node`。
- 发布用的是本机 git 凭据，和你平时在终端 `git push` 完全一样。
