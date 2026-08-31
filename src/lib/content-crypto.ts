/**
 * 构建时 AES-256-GCM 内容加密工具
 * 使用 PBKDF2 派生密钥 + AES-256-GCM 加密
 */
import { createCipheriv, createHash, pbkdf2Sync, randomBytes } from 'node:crypto';

const PBKDF2_ITERATIONS = 100_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;
const KEY_LENGTH = 32; // 256 bits

export interface EncryptedData {
  /** Base64 编码的随机盐值 (16 bytes) */
  salt: string;
  /** Base64 编码的初始化向量 (12 bytes) */
  iv: string;
  /** Base64 编码的密文 + 16 bytes GCM 认证标签 */
  ct: string;
  /** PBKDF2 迭代次数 */
  iterations: number;
}

/**
 * 从密码派生 AES-256 密钥
 */
function deriveKey(password: string, salt: Buffer): Buffer {
  return pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, KEY_LENGTH, 'sha256');
}

/**
 * 加密明文内容
 * @param plaintext - 要加密的明文
 * @param password - 用于加密的密码
 * @returns 加密后的数据对象
 */
export function encryptContent(plaintext: string, password: string): EncryptedData {
  const salt = randomBytes(SALT_BYTES);
  const iv = randomBytes(IV_BYTES);
  const key = deriveKey(password, salt);

  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag(); // 16 bytes

  return {
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    ct: Buffer.concat([body, tag]).toString('base64'),
    iterations: PBKDF2_ITERATIONS,
  };
}

/**
 * 生成密码的 SHA-256 哈希（用于客户端校验）
 */
export function hashPassword(password: string): string {
  return createHash('sha256').update(password, 'utf8').digest('hex');
}
