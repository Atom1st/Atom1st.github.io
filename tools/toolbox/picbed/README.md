# PicBed · 简易图床

零依赖本地 WebUI 图床（纯 Node 内置模块）。上传本地图片到云端、生成直链、下载、历史图库。

## 启动

双击 `start.cmd`（自动打开浏览器），或：

```
node tools/toolbox/picbed/server.mjs
```

地址：http://127.0.0.1:7790 （可用环境变量 `PICBED_PORT` 改端口）

## 渠道

| 渠道 | 注册方式 | 单图上限 | 直链域名 | 适用 |
|---|---|---|---|---|
| **博客仓库** | GitHub Token（Settings → Developer settings → PAT，需 repo 权限） | 32MB（API 限制实际更小） | `guiyihan.top/uploads/…` | 博客配图首选，自持、不依赖第三方 |
| **ImgBB** | imgbb.com 邮箱注册 → api.imgbb.com 免费拿 Key | 32MB | `i.ibb.co` | 第三方托管；注意部分网络下直链图可能加载不出 |
| **picgo.net** | www.picgo.net 邮箱注册 → 设置 → API 生成密钥 | 25MB | picgo.net | 国内第三方备选 |

> 曾测试的匿名直传方案（0x0.st / catbox / uguu / tmpfiles / postimages 等）截至 2026-11 在大陆网络下均不可用或已停止匿名上传，故未内置。

## 工作原理

浏览器 → 本地 Node 服务（127.0.0.1:7790）→ 各图床 API。
密钥只保存在本机 `.picbed.json`（已 gitignore），不经过浏览器第三方、不提交仓库。
ImgBB 接口有 CORS 限制，必须走本地服务转发。

## 文件

- `server.mjs` — 服务：静态托管 / 配置 / 上传转发 / 回源下载 / 图库记录
- `public/` — WebUI（拖拽、粘贴、批量队列、链接格式、图库搜索）
- `.picbed.json` — 配置与密钥（本机）
- `.picbed-gallery.json` — 上传历史（本机，最多 500 条）

## 注意

- 「博客仓库」渠道每次上传是一次 git commit，由 GitHub Actions 自动部署，直链约 1-2 分钟后生效。
- 上传历史只是本地记录；删除记录不会删除云端图片（ImgBB 的 deleteUrl 可手动打开删除）。
