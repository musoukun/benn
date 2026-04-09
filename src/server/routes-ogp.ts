import { Hono } from 'hono';
import type { User } from '@prisma/client';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { prisma } from './db';

export const ogpRoutes = new Hono<{ Variables: { user: User | null } }>();

// =====================================================================
// 外部 URL の OGP 取得 (in-memory + file cache 1日)
// =====================================================================

type OgpData = {
  url: string;
  host: string;
  title: string | null;
  description: string | null;
  image: string | null;
  siteName: string | null;
  fetchedAt: number;
};

const memCache = new Map<string, OgpData>();
const TTL_MS = 24 * 60 * 60 * 1000; // 1日
const FETCH_TIMEOUT_MS = 6_000;

async function fetchOgp(url: string): Promise<OgpData> {
  const cached = memCache.get(url);
  if (cached && Date.now() - cached.fetchedAt < TTL_MS) return cached;

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  let html = '';
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': 'UchiBot/1.0 (+https://uchi.example)' },
      signal: ctrl.signal,
      redirect: 'follow',
    });
    if (!res.ok) throw new Error(`http ${res.status}`);
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('text/html')) throw new Error('not html: ' + ct);
    // 1MB 上限で読む
    const ab = await res.arrayBuffer();
    html = new TextDecoder('utf-8').decode(ab.slice(0, 1024 * 1024));
  } catch (e) {
    clearTimeout(t);
    const fallback: OgpData = {
      url,
      host: safeHost(url),
      title: null,
      description: null,
      image: null,
      siteName: null,
      fetchedAt: Date.now(),
    };
    memCache.set(url, fallback);
    return fallback;
  }
  clearTimeout(t);

  const data: OgpData = {
    url,
    host: safeHost(url),
    title: pickMeta(html, 'og:title') || pickTitle(html),
    description: pickMeta(html, 'og:description') || pickMeta(html, 'description'),
    image: absolutize(pickMeta(html, 'og:image'), url),
    siteName: pickMeta(html, 'og:site_name'),
    fetchedAt: Date.now(),
  };
  memCache.set(url, data);
  return data;
}

function pickMeta(html: string, name: string): string | null {
  // <meta property="og:title" content="..."> または name="..."
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`<meta[^>]+property=["']${escaped}["'][^>]+content=["']([^"']+)["']`, 'i'),
    new RegExp(`<meta[^>]+name=["']${escaped}["'][^>]+content=["']([^"']+)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${escaped}["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${escaped}["']`, 'i'),
  ];
  for (const p of patterns) {
    const m = html.match(p);
    if (m) return decodeEntities(m[1]);
  }
  return null;
}

function pickTitle(html: string): string | null {
  const m = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return m ? decodeEntities(m[1].trim()) : null;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'");
}

function absolutize(maybeRelative: string | null, baseUrl: string): string | null {
  if (!maybeRelative) return null;
  try {
    return new URL(maybeRelative, baseUrl).toString();
  } catch {
    return null;
  }
}

function safeHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

ogpRoutes.get('/', async (c) => {
  const url = c.req.query('url');
  if (!url) return c.json({ error: 'url が必要です' }, 400);
  // 簡単な URL バリデーション (http/https のみ)
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return c.json({ error: 'invalid url' }, 400);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return c.json({ error: 'http/https のみ' }, 400);
  }
  const data = await fetchOgp(url);
  return c.json(data);
});

// =====================================================================
// Uchi 内コンテンツの OGP 画像生成 (Satori + resvg)
// 背景: グラデ + 太字タイトル + 著者アバター + ユーザ名 + Uchi ロゴ
// =====================================================================

let _fontCache: Buffer | null = null;
async function loadFont(): Promise<Buffer> {
  if (_fontCache) return _fontCache;
  const p = path.join(process.cwd(), 'assets', 'fonts', 'NotoSansJP-Bold.otf');
  try {
    _fontCache = await fs.readFile(p);
    return _fontCache;
  } catch {
    throw new Error(
      'OGP フォントが見つかりません: ' +
        p +
        ' — `curl -L -o assets/fonts/NotoSansJP-Bold.otf https://github.com/notofonts/noto-cjk/raw/main/Sans/OTF/Japanese/NotoSansCJKjp-Bold.otf` を実行してください'
    );
  }
}

async function renderOgpPng(opts: {
  title: string;
  authorName: string;
  authorAvatarUrl?: string | null;
  emoji?: string;
}) {
  // 動的 import (依存が大きいので)
  const satori = (await import('satori')).default;
  const { Resvg } = await import('@resvg/resvg-js');
  const font = await loadFont();

  // VNode を直接 JSX 無しで作る (React 不要)
  const node: any = {
    type: 'div',
    props: {
      style: {
        width: 1200,
        height: 630,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: 64,
        background: 'linear-gradient(135deg, #5fcfdc 0%, #a8f1f7 50%, #ffffff 100%)',
        fontFamily: 'NotoSansJP',
      },
      children: [
        // 上: タイトルと絵文字
        {
          type: 'div',
          props: {
            style: { display: 'flex', flexDirection: 'column', gap: 24 },
            children: [
              {
                type: 'div',
                props: {
                  style: { fontSize: 72, lineHeight: 1.1 },
                  children: opts.emoji || '📝',
                },
              },
              {
                type: 'div',
                props: {
                  style: {
                    fontSize: 64,
                    fontWeight: 800,
                    color: '#0f172a',
                    lineHeight: 1.25,
                    maxHeight: 320,
                    overflow: 'hidden',
                    display: 'flex',
                  },
                  children: opts.title.slice(0, 80),
                },
              },
            ],
          },
        },
        // 下: 著者 + Uchi ロゴ
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              alignItems: 'center',
              gap: 20,
              fontSize: 32,
              color: '#0f172a',
            },
            children: [
              {
                type: 'div',
                props: {
                  style: {
                    width: 64,
                    height: 64,
                    borderRadius: 999,
                    background: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 32,
                    fontWeight: 800,
                    color: '#5fcfdc',
                    border: '2px solid #5fcfdc',
                  },
                  children: (opts.authorName || '?').slice(0, 1).toUpperCase(),
                },
              },
              {
                type: 'div',
                props: {
                  style: { fontSize: 32, fontWeight: 700, flex: 1 },
                  children: opts.authorName,
                },
              },
              {
                type: 'div',
                props: {
                  style: {
                    fontSize: 36,
                    fontWeight: 800,
                    color: '#0f172a',
                    background: '#fff',
                    padding: '10px 22px',
                    borderRadius: 12,
                    border: '3px solid #5fcfdc',
                  },
                  children: '🏠 Uchi',
                },
              },
            ],
          },
        },
      ],
    },
  };

  const svg = await satori(node, {
    width: 1200,
    height: 630,
    fonts: [{ name: 'NotoSansJP', data: font, weight: 700, style: 'normal' }],
  });
  const resvg = new Resvg(svg);
  return resvg.render().asPng();
}

// 簡易キャッシュ: articleId/postId + updatedAt をキーに in-memory
const pngCache = new Map<string, { png: Buffer; key: string }>();

ogpRoutes.get('/articles/:id/image', async (c) => {
  const id = c.req.param('id');
  const a = await prisma.article.findUnique({
    where: { id },
    select: { id: true, title: true, emoji: true, updatedAt: true, author: { select: { name: true, avatarUrl: true } } },
  });
  if (!a) return c.text('not found', 404);
  const cacheKey = `a:${a.id}:${a.updatedAt.getTime()}`;
  let entry = pngCache.get(a.id);
  if (entry?.key === cacheKey) {
    return new Response(entry.png, {
      headers: { 'content-type': 'image/png', 'cache-control': 'public, max-age=86400' },
    });
  }
  const png = await renderOgpPng({
    title: a.title || '無題',
    authorName: a.author?.name || '匿名',
    authorAvatarUrl: a.author?.avatarUrl,
    emoji: a.emoji || '📝',
  });
  pngCache.set(a.id, { png, key: cacheKey });
  return new Response(png, {
    headers: { 'content-type': 'image/png', 'cache-control': 'public, max-age=86400' },
  });
});

ogpRoutes.get('/posts/:id/image', async (c) => {
  const id = c.req.param('id');
  const p = await prisma.post.findUnique({
    where: { id },
    select: { id: true, body: true, updatedAt: true, author: { select: { name: true, avatarUrl: true } } },
  });
  if (!p) return c.text('not found', 404);
  const cacheKey = `p:${p.id}:${p.updatedAt.getTime()}`;
  let entry = pngCache.get(p.id);
  if (entry?.key === cacheKey) {
    return new Response(entry.png, {
      headers: { 'content-type': 'image/png', 'cache-control': 'public, max-age=86400' },
    });
  }
  const title = (p.body || '').slice(0, 80);
  const png = await renderOgpPng({
    title,
    authorName: p.author?.name || '匿名',
    authorAvatarUrl: p.author?.avatarUrl,
    emoji: '💬',
  });
  pngCache.set(p.id, { png, key: cacheKey });
  return new Response(png, {
    headers: { 'content-type': 'image/png', 'cache-control': 'public, max-age=86400' },
  });
});
