// 密码哈希生成脚本
// 使用方法: node scripts/gen-password-hash.js "你的密码"
// 将输出的哈希值填入文章 frontmatter 的 password 字段

import { createHash } from 'crypto';

const password = process.argv[2];
if (!password) {
  console.error('请提供密码: node scripts/gen-password-hash.js "你的密码"');
  process.exit(1);
}

const hash = createHash('sha256').update(password).digest('hex');
console.log('密码哈希 (SHA-256):');
console.log(hash);
console.log('\n在文章 frontmatter 中添加:');
console.log(`password: "${hash}"`);