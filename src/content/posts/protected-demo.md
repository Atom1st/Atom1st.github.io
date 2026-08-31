---
title: 受保护文章示例
date: 2026-08-31
category: 测试
tags: [受保护, 示例]
description: 这是一篇受密码保护的文章示例
type: article
origin: original
access: protected
password: "123456"
---

这是一篇受密码保护的文章。密码是 `123456`。

## 受保护内容

只有输入正确密码才能查看这部分内容。

### 密码保护功能说明

1. 在文章 frontmatter 中设置 `access: protected`
2. 使用 `node scripts/gen-password-hash.js "你的密码"` 生成 SHA-256 哈希
3. 将生成的哈希值填入 `password` 字段
4. 用户访问时需要输入密码，验证通过后才能查看内容
5. 验证状态保存在 sessionStorage 中，同一会话内无需重复输入

这是一个演示文章，展示密码保护功能的工作原理。