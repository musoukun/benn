import React, { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { Avatar } from './Avatar';

// コミュニティアイコン編集 (プロフィールアバターと同じクロップ UX)。
// AvatarSection の community 版。即時 API 反映。
// 代表 (owner) のみが操作する想定。

const OUTPUT_SIZE = 512;
const PREVIEW_SIZE = 320;

type Community = { id: string; name: string; avatarUrl: string | null; avatarColor: string | null };

export function CommunityIconEditor({
  community,
  onUpdated,
}: {
  community: Community;
  onUpdated: (avatarUrl: string | null) => void;
}) {
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
    const cv = canvasRef.current;
    if (!cv || !img) return;
    const ctx = cv.getContext('2d')!;
    ctx.clearRect(0, 0, cv.width, cv.height);
    const base = Math.min(cv.width / img.width, cv.height / img.height);
    const s = base * scale;
    const w = img.width * s;
    const h = img.height * s;
    const cx = cv.width / 2;
    const cy = cv.height / 2;
    ctx.drawImage(img, cx - w / 2 + tx, cy - h / 2 + ty, w, h);
    const cropPx = Math.min(cv.width, cv.height) - 20;
    ctx.fillStyle = 'rgba(15,23,42,.55)';
    ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(cv.width / 2, cv.height / 2, cropPx / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
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
      const out = document.createElement('canvas');
      out.width = OUTPUT_SIZE;
      out.height = OUTPUT_SIZE;
      const octx = out.getContext('2d')!;
      const cv = canvasRef.current!;
      const cropPx = Math.min(cv.width, cv.height) - 20;
      const base = Math.min(cv.width / img.width, cv.height / img.height);
      const s = base * scale;
      const w = img.width * s;
      const h = img.height * s;
      const cx = cv.width / 2;
      const cy = cv.height / 2;
      const drawX = cx - w / 2 + tx;
      const drawY = cy - h / 2 + ty;
      const cropX = (cv.width - cropPx) / 2;
      const cropY = (cv.height - cropPx) / 2;
      const sx = (cropX - drawX) / s;
      const sy = (cropY - drawY) / s;
      const sw = cropPx / s;
      const sh = cropPx / s;
      octx.drawImage(img, sx, sy, sw, sh, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
      const blob: Blob = await new Promise((resolve) =>
        out.toBlob((b) => resolve(b!), 'image/png')
      );
      const file = new File([blob], 'community-icon.png', { type: 'image/png' });
      const up = await api.uploadFile(file);
      const updated = await api.updateCommunity(community.id, { avatarUrl: up.url });
      onUpdated(updated.avatarUrl ?? up.url);
      setImg(null);
      setMsg('コミュニティアイコンを更新しました');
    } catch (e: any) {
      setMsg('失敗: ' + (e?.message || e));
    } finally {
      setSaving(false);
    }
  };

  // カラーピッカー
  const [color, setColor] = useState(community.avatarColor || '#5fcfdc');
  const [savingColor, setSavingColor] = useState(false);

  const saveColor = async () => {
    setSavingColor(true);
    setMsg(null);
    try {
      await api.updateCommunity(community.id, { avatarColor: color });
      onUpdated(community.avatarUrl ?? null); // reload
      setMsg('アイコンの色を変更しました');
    } catch (e: any) {
      setMsg('失敗: ' + (e?.message || e));
    } finally {
      setSavingColor(false);
    }
  };

  const resetColor = async () => {
    setSavingColor(true);
    setMsg(null);
    try {
      await api.updateCommunity(community.id, { avatarColor: null });
      setColor('#5fcfdc');
      onUpdated(community.avatarUrl ?? null);
      setMsg('デフォルトの色に戻しました');
    } catch (e: any) {
      setMsg('失敗: ' + (e?.message || e));
    } finally {
      setSavingColor(false);
    }
  };

  const clearIcon = async () => {
    setSaving(true);
    setMsg(null);
    try {
      const updated = await api.updateCommunity(community.id, { avatarUrl: null });
      onUpdated(updated.avatarUrl ?? null);
      setMsg('頭文字アイコンに戻しました');
    } catch (e: any) {
      setMsg('失敗: ' + (e?.message || e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>コミュニティアイコン</h3>
      <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 16 }}>
        <Avatar user={{ name: community.name, avatarUrl: community.avatarUrl }} size="lg" />
        <div>
          <div style={{ fontWeight: 700 }}>{community.name}</div>
          <div style={{ color: 'var(--muted)', fontSize: 14 }}>現在のアイコン</div>
        </div>
      </div>

      <label style={{ fontWeight: 700, fontSize: 15 }}>画像をアップロードして円形にクロップ:</label>
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
            <label style={{ fontSize: 14, color: 'var(--muted)' }}>ズーム</label>
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
              {saving ? '保存中…' : 'クロップして確定'}
            </button>
          </div>
          <div style={{ fontSize: 14, color: 'var(--muted)', marginTop: 4 }}>
            画像をドラッグして位置を調整、スライダーでズーム。
          </div>
        </div>
      )}

      <hr style={{ margin: '20px 0', border: 'none', borderTop: '1px solid var(--border)' }} />

      <div>
        <label style={{ fontWeight: 700, fontSize: 15 }}>または、名前の頭文字アイコンに戻す:</label>
        <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 12 }}>
          <button type="button" className="btn btn-ghost" disabled={saving} onClick={clearIcon}>
            頭文字アイコンに戻す
          </button>
          <span style={{ fontSize: 14, color: 'var(--muted)' }}>
            画像を使わず、コミュニティ名の1文字目を表示します
          </span>
        </div>
      </div>

      <hr style={{ margin: '20px 0', border: 'none', borderTop: '1px solid var(--border)' }} />

      <div>
        <label style={{ fontWeight: 700, fontSize: 15 }}>頭文字アイコンの背景色:</label>
        <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4, marginBottom: 8 }}>
          文字色は背景に合わせて自動で白/黒に切り替わります
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            style={{ width: 48, height: 48, padding: 2, border: '2px solid var(--border)', borderRadius: 8, cursor: 'pointer', background: 'transparent' }}
          />
          <Avatar user={{ name: community.name, avatarUrl: null, avatarColor: color }} size="lg" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <button className="btn" disabled={savingColor} onClick={saveColor}>
              {savingColor ? '保存中…' : 'この色に変更'}
            </button>
            <button className="btn btn-ghost" disabled={savingColor} onClick={resetColor} style={{ fontSize: 13 }}>
              デフォルトに戻す
            </button>
          </div>
        </div>
      </div>

      {msg && <div style={{ marginTop: 12, color: 'var(--accent)' }}>{msg}</div>}
    </div>
  );
}
