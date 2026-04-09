import React, { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { Avatar } from './Avatar';

// シンプルなクライアント側の正方形クロップ:
// - file 選択 → Image 化
// - canvas にドラッグ可能な「クロップ枠」 (scale + 位置 で表示)
// - クロップ実行で 512x512 の正方形 PNG を生成 → uploadFile → updateMe(avatarUrl)

const OUTPUT_SIZE = 512;
const PREVIEW_SIZE = 320;

export function AvatarSection() {
  const [me, setMe] = useState<{ id: string; name: string; avatarUrl: string | null } | null>(null);
  const [emoji, setEmoji] = useState('');
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    api.getMe().then((u) => {
      if (u) setMe({ id: u.id, name: u.name, avatarUrl: u.avatarUrl });
    });
  }, []);

  // クロップ枠を描画
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv || !img) return;
    const ctx = cv.getContext('2d')!;
    ctx.clearRect(0, 0, cv.width, cv.height);
    // ベース fit (正方形に短辺を合わせる)
    const base = Math.min(cv.width / img.width, cv.height / img.height);
    const s = base * scale;
    const w = img.width * s;
    const h = img.height * s;
    // tx/ty は中央基準のオフセット
    const cx = cv.width / 2;
    const cy = cv.height / 2;
    ctx.drawImage(img, cx - w / 2 + tx, cy - h / 2 + ty, w, h);

    // 暗い overlay + 中央に正方形クロップ枠
    const cropPx = Math.min(cv.width, cv.height) - 20;
    const cropX = (cv.width - cropPx) / 2;
    const cropY = (cv.height - cropPx) / 2;
    ctx.fillStyle = 'rgba(15,23,42,.55)';
    ctx.fillRect(0, 0, cv.width, cv.height);
    // 正方形をくり抜く
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(cv.width / 2, cv.height / 2, cropPx / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    // 円の枠
    ctx.beginPath();
    ctx.arc(cv.width / 2, cv.height / 2, cropPx / 2, 0, Math.PI * 2);
    ctx.strokeStyle = '#5fcfdc';
    ctx.lineWidth = 3;
    ctx.stroke();
  }, [img, scale, tx, ty]);

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const url = URL.createObjectURL(f);
    const im = new Image();
    im.onload = () => {
      setImg(im);
      setScale(1);
      setTx(0);
      setTy(0);
    };
    im.src = url;
  };

  const onMouseDown = (e: React.MouseEvent) => {
    setDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY, tx, ty });
  };
  const onMouseMove = (e: React.MouseEvent) => {
    if (!dragging || !dragStart) return;
    setTx(dragStart.tx + (e.clientX - dragStart.x));
    setTy(dragStart.ty + (e.clientY - dragStart.y));
  };
  const onMouseUp = () => setDragging(false);

  const cropAndUpload = async () => {
    if (!img) return;
    setSaving(true);
    setMsg(null);
    try {
      // 出力 canvas
      const out = document.createElement('canvas');
      out.width = OUTPUT_SIZE;
      out.height = OUTPUT_SIZE;
      const octx = out.getContext('2d')!;
      // プレビューと同じスケール演算で出力 canvas に描画
      const cv = canvasRef.current!;
      const cropPx = Math.min(cv.width, cv.height) - 20;
      // プレビュー上のベース fit
      const base = Math.min(cv.width / img.width, cv.height / img.height);
      const s = base * scale;
      const w = img.width * s;
      const h = img.height * s;
      const cx = cv.width / 2;
      const cy = cv.height / 2;
      const drawX = cx - w / 2 + tx;
      const drawY = cy - h / 2 + ty;
      // クロップ範囲 (プレビュー座標)
      const cropX = (cv.width - cropPx) / 2;
      const cropY = (cv.height - cropPx) / 2;
      // ソース画像内の対応座標
      const sx = (cropX - drawX) / s;
      const sy = (cropY - drawY) / s;
      const sw = cropPx / s;
      const sh = cropPx / s;
      octx.drawImage(img, sx, sy, sw, sh, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
      const blob: Blob = await new Promise((resolve) =>
        out.toBlob((b) => resolve(b!), 'image/png')
      );
      const file = new File([blob], 'avatar.png', { type: 'image/png' });
      const up = await api.uploadFile(file);
      await api.updateMe({ avatarUrl: up.url });
      setMe((prev) => (prev ? { ...prev, avatarUrl: up.url } : prev));
      setImg(null);
      setMsg('アバターを更新しました');
    } catch (e: any) {
      setMsg('失敗: ' + (e?.message || e));
    } finally {
      setSaving(false);
    }
  };

  const useEmoji = async () => {
    if (!emoji.trim()) return;
    setSaving(true);
    try {
      // 絵文字を 256x256 PNG にレンダリングしてアップロード
      const cv = document.createElement('canvas');
      cv.width = 256;
      cv.height = 256;
      const ctx = cv.getContext('2d')!;
      // 背景: 水色グラデ
      const grad = ctx.createLinearGradient(0, 0, 256, 256);
      grad.addColorStop(0, '#a8f1f7');
      grad.addColorStop(1, '#5fcfdc');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 256, 256);
      // 絵文字を中央に
      ctx.font = '160px serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(emoji.trim().slice(0, 2), 128, 140);
      const blob: Blob = await new Promise((resolve) =>
        cv.toBlob((b) => resolve(b!), 'image/png')
      );
      const file = new File([blob], 'avatar-emoji.png', { type: 'image/png' });
      const up = await api.uploadFile(file);
      await api.updateMe({ avatarUrl: up.url });
      setMe((prev) => (prev ? { ...prev, avatarUrl: up.url } : prev));
      setMsg('絵文字アバターを設定しました');
      setEmoji('');
    } catch (e: any) {
      setMsg('失敗: ' + (e?.message || e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>プロフィール画像</h3>
      {me && (
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 16 }}>
          <Avatar user={me} />
          <div>
            <div style={{ fontWeight: 700 }}>{me.name}</div>
            <div style={{ color: 'var(--muted)', fontSize: 12 }}>現在のアバター</div>
          </div>
        </div>
      )}

      {/* 絵文字でアバターを作る */}
      <div className="avatar-emoji-row">
        <label style={{ fontWeight: 700, fontSize: 13 }}>絵文字でアバターを作る:</label>
        <input
          type="text"
          value={emoji}
          onChange={(e) => setEmoji(e.target.value)}
          placeholder="🐱"
          style={{ width: 80, padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 24, textAlign: 'center' }}
        />
        <button className="btn" disabled={saving || !emoji.trim()} onClick={useEmoji}>
          設定
        </button>
      </div>

      <hr style={{ margin: '20px 0', border: 'none', borderTop: '1px solid var(--border)' }} />

      {/* 画像ファイルからクロップ */}
      <label style={{ fontWeight: 700, fontSize: 13 }}>画像をアップロードして正方形にクロップ:</label>
      <div style={{ marginTop: 8 }}>
        <input type="file" accept="image/*" onChange={onFile} />
      </div>
      {img && (
        <div style={{ marginTop: 12 }}>
          <div className="avatar-crop">
            <canvas
              ref={canvasRef}
              width={PREVIEW_SIZE}
              height={PREVIEW_SIZE}
              onMouseDown={onMouseDown}
              onMouseMove={onMouseMove}
              onMouseUp={onMouseUp}
              onMouseLeave={onMouseUp}
              style={{ cursor: dragging ? 'grabbing' : 'grab', borderRadius: 8 }}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
            <label style={{ fontSize: 12, color: 'var(--muted)' }}>ズーム</label>
            <input
              type="range"
              min={0.5}
              max={4}
              step={0.05}
              value={scale}
              onChange={(e) => setScale(parseFloat(e.target.value))}
              style={{ flex: 1 }}
            />
            <button className="btn" disabled={saving} onClick={cropAndUpload}>
              {saving ? '保存中…' : 'クロップして保存'}
            </button>
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
            画像をドラッグして位置を調整、スライダーでズーム。
          </div>
        </div>
      )}
      {msg && <div style={{ marginTop: 12, color: 'var(--accent)' }}>{msg}</div>}
    </div>
  );
}
