import { useEffect } from 'react';

// 動的に <head> の og:title / og:image / og:description を差し替える hook。
// SSR ではないので Twitter / Slack 等のクローラ向け SEO 効果は限定的だが、
// プレビュー機能を持つツール (Discord 等) や手動で head を見るユーザ向けには有効。

type OgMeta = {
  title?: string;
  description?: string;
  image?: string; // 絶対 URL 推奨
  url?: string;
  type?: 'article' | 'website';
};

function setMeta(prop: string, value: string | undefined) {
  if (typeof document === 'undefined') return;
  const head = document.head;
  let el = head.querySelector(`meta[property="${prop}"]`) as HTMLMetaElement | null;
  if (!value) {
    if (el) el.remove();
    return;
  }
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute('property', prop);
    head.appendChild(el);
  }
  el.setAttribute('content', value);
}

function setNamedMeta(name: string, value: string | undefined) {
  if (typeof document === 'undefined') return;
  let el = document.head.querySelector(`meta[name="${name}"]`) as HTMLMetaElement | null;
  if (!value) {
    if (el) el.remove();
    return;
  }
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute('name', name);
    document.head.appendChild(el);
  }
  el.setAttribute('content', value);
}

export function useOgMeta(meta: OgMeta) {
  useEffect(() => {
    if (meta.title) document.title = meta.title + ' · Uchi';
    setMeta('og:title', meta.title);
    setMeta('og:description', meta.description);
    setMeta('og:image', meta.image);
    setMeta('og:url', meta.url || (typeof window !== 'undefined' ? window.location.href : undefined));
    setMeta('og:type', meta.type || 'article');
    setMeta('og:site_name', 'Uchi');
    setNamedMeta('twitter:card', 'summary_large_image');
    setNamedMeta('twitter:title', meta.title);
    setNamedMeta('twitter:description', meta.description);
    setNamedMeta('twitter:image', meta.image);
    return () => {
      // unmount で消すのは過剰なのでそのまま (次のページが上書き)
    };
  }, [meta.title, meta.description, meta.image, meta.url, meta.type]);
}
