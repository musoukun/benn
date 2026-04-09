import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

// AES-256-GCM。env の UCHI_SECRET_KEY (32byte hex) を秘密鍵に使う。
const KEY_HEX = process.env.UCHI_SECRET_KEY || '';
if (KEY_HEX.length !== 64) {
  // dev で env が無いケースに備えてフォールバック (本番では絶対に env を渡すこと)
  console.warn('[crypto] UCHI_SECRET_KEY is not set or invalid. Falling back to a dev key.');
}
const KEY = Buffer.from(
  KEY_HEX.length === 64 ? KEY_HEX : '4f6c7a3a8b1d2e9f0a1c2b3d4e5f607182930a1b2c3d4e5f6071829304a5b6c7',
  'hex'
);

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', KEY, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('hex'), tag.toString('hex'), enc.toString('hex')].join(':');
}

export function decryptSecret(payload: string): string {
  const [ivHex, tagHex, encHex] = payload.split(':');
  if (!ivHex || !tagHex || !encHex) throw new Error('invalid encrypted payload');
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const enc = Buffer.from(encHex, 'hex');
  const decipher = createDecipheriv('aes-256-gcm', KEY, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}

// 末尾4文字だけ表示するマスク
export function maskKey(plain: string): string {
  if (!plain) return '';
  if (plain.length <= 8) return '••••';
  return '••••' + plain.slice(-4);
}
