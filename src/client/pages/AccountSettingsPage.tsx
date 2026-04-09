import React, { useEffect, useState } from 'react';
import { api } from '../api';
import type { Affiliation, AIConfig } from '../types';
import { ProfileEditor } from '../components/ProfileEditor';

type Tab = 'profile' | 'affiliation' | 'ai' | 'prompts';

export function AccountSettingsPage() {
  const [tab, setTab] = useState<Tab>('profile');

  return (
    <div className="container">
      <h2 style={{ marginTop: 0 }}>アカウント設定</h2>
      <div className="tabs">
        <button className={tab === 'profile' ? 'active' : ''} onClick={() => setTab('profile')}>プロフィール</button>
        <button className={tab === 'affiliation' ? 'active' : ''} onClick={() => setTab('affiliation')}>所属</button>
        <button className={tab === 'ai' ? 'active' : ''} onClick={() => setTab('ai')}>AIプロバイダ</button>
        <button className={tab === 'prompts' ? 'active' : ''} onClick={() => setTab('prompts')}>プロンプト</button>
      </div>
      {tab === 'profile' && <ProfileEditor />}
      {tab === 'affiliation' && <AffiliationSection />}
      {tab === 'ai' && <AIConfigSection />}
      {tab === 'prompts' && <PromptSection />}
    </div>
  );
}

function AffiliationSection() {
  const [all, setAll] = useState<Affiliation[]>([]);
  const [mine, setMine] = useState<Set<string>>(new Set());
  const [newName, setNewName] = useState('');

  const reload = async () => {
    const list = await api.listAffiliations();
    setAll(list);
    const me = await api.getMe();
    if (me) {
      const ua = await api.getUserAffiliations(me.id);
      setMine(new Set(ua.map((a) => a.id)));
    }
  };
  useEffect(() => { reload(); }, []);

  const toggle = async (id: string) => {
    const next = new Set(mine);
    if (next.has(id)) next.delete(id); else next.add(id);
    setMine(next);
    await api.setMyAffiliations(Array.from(next));
  };

  const addNew = async () => {
    if (!newName.trim()) return;
    const a = await api.createAffiliation(newName.trim());
    setNewName('');
    const next = new Set(mine);
    next.add(a.id);
    setMine(next);
    await api.setMyAffiliations(Array.from(next));
    reload();
  };

  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>所属タグ</h3>
      <p style={{ color: 'var(--muted)', fontSize: 13 }}>自分が所属するチームのタグを設定。記事公開時に閲覧範囲の指定に使えます。</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        {all.map((a) => (
          <button
            key={a.id}
            className={'tag ' + (mine.has(a.id) ? '' : '')}
            onClick={() => toggle(a.id)}
            style={{
              cursor: 'pointer',
              background: mine.has(a.id) ? 'var(--accent-soft)' : '#edf2f7',
              color: mine.has(a.id) ? '#0f172a' : 'var(--muted)',
              fontWeight: mine.has(a.id) ? 700 : 400,
              border: mine.has(a.id) ? '1px solid rgba(15,23,42,.1)' : '1px solid transparent',
              padding: '6px 14px',
            }}
          >
            {a.name}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          type="text"
          placeholder="新しい所属名"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          style={{ padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 6, flex: 1 }}
        />
        <button className="btn" onClick={addNew}>追加</button>
      </div>
    </div>
  );
}

function AIConfigSection() {
  const [items, setItems] = useState<AIConfig[]>([]);
  const [provider, setProvider] = useState<'openai' | 'anthropic' | 'gemini'>('gemini');
  const [endpoint, setEndpoint] = useState('');
  const [model, setModel] = useState('gemini-2.5-flash');
  const [apiKey, setApiKey] = useState('');
  const [isDefault, setIsDefault] = useState(true);

  const reload = () => api.listAIConfigs().then(setItems);
  useEffect(() => { reload(); }, []);

  const create = async () => {
    if (!apiKey || !model) return alert('apiKey と model は必須です');
    await api.createAIConfig({
      provider,
      endpoint: endpoint || undefined,
      model,
      apiKey,
      isDefault,
    });
    setApiKey('');
    reload();
  };

  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>AIプロバイダ</h3>
      <p style={{ color: 'var(--muted)', fontSize: 13 }}>OpenAI / Anthropic / Gemini のAPIキーを登録できます (AES-256-GCM で暗号化保存)。</p>

      {items.map((it) => (
        <div key={it.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="tag">{it.provider}</span>
          <span style={{ flex: 1 }}>{it.model} / <code>{it.apiKeyMasked}</code></span>
          {it.isDefault ? <span className="tag" style={{ background: 'var(--accent-soft)' }}>default</span> :
            <button className="btn btn-ghost" onClick={async () => { await api.setDefaultAIConfig(it.id); reload(); }}>default に設定</button>}
          <button className="btn btn-danger" onClick={async () => { if (confirm('削除しますか?')) { await api.deleteAIConfig(it.id); reload(); } }}>削除</button>
        </div>
      ))}

      <h4>新規追加</h4>
      <div style={{ display: 'grid', gap: 8 }}>
        <select value={provider} onChange={(e) => {
          const p = e.target.value as any;
          setProvider(p);
          // 当面はモデル切替UIを出さず、各社固定のおすすめモデルを採用する
          if (p === 'openai') setModel('gpt-5-mini');
          if (p === 'anthropic') setModel('claude-sonnet-4-6');
          if (p === 'gemini') setModel('gemini-2.5-flash');
        }} style={{ padding: 8, borderRadius: 6, border: '1px solid var(--border)' }}>
          <option value="gemini">Gemini (gemini-2.5-flash)</option>
          <option value="openai">OpenAI (gpt-5-mini)</option>
          <option value="anthropic">Anthropic (claude-sonnet-4-6)</option>
        </select>
        <input placeholder="endpoint (省略可)" value={endpoint} onChange={(e) => setEndpoint(e.target.value)}
          style={{ padding: 8, borderRadius: 6, border: '1px solid var(--border)' }} />
        <input type="password" placeholder="API Key" value={apiKey} onChange={(e) => setApiKey(e.target.value)}
          style={{ padding: 8, borderRadius: 6, border: '1px solid var(--border)' }} />
        <label style={{ display: 'flex', gap: 8 }}>
          <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} />
          デフォルトに設定
        </label>
        <button className="btn" onClick={create}>追加</button>
      </div>
    </div>
  );
}

function PromptSection() {
  const [review, setReview] = useState('');
  const [summary, setSummary] = useState('');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    api.getPrompts().then((p) => { setReview(p.review); setSummary(p.summary); setLoaded(true); });
  }, []);

  if (!loaded) return <div className="loading">読み込み中…</div>;

  return (
    <div>
      <div className="card" style={{ marginBottom: 12 }}>
        <h3 style={{ marginTop: 0 }}>レビュー用プロンプト</h3>
        <textarea
          value={review}
          onChange={(e) => setReview(e.target.value)}
          style={{ width: '100%', minHeight: 240, padding: 12, borderRadius: 6, border: '1px solid var(--border)', fontFamily: 'monospace', fontSize: 13 }}
        />
        <button className="btn" style={{ marginTop: 8 }} onClick={async () => { await api.setPrompt('review', review); alert('保存しました'); }}>保存</button>
      </div>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>要約用プロンプト</h3>
        <textarea
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          style={{ width: '100%', minHeight: 160, padding: 12, borderRadius: 6, border: '1px solid var(--border)', fontFamily: 'monospace', fontSize: 13 }}
        />
        <button className="btn" style={{ marginTop: 8 }} onClick={async () => { await api.setPrompt('summary', summary); alert('保存しました'); }}>保存</button>
      </div>
    </div>
  );
}
