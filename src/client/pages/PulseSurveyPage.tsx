import React, { useState, useEffect, useCallback } from 'react';
import {
  ClipboardCheck, BarChart3, TrendingUp, CheckCircle, ChevronRight, Building2,
} from 'lucide-react';
import { api } from '../api';
import { useMe } from '../useMe';
import { PulseSurveyForm } from '../components/PulseSurveyForm';
import { PulseSurveyResults } from '../components/PulseSurveyResults';
import { PulseSurveyTrends } from '../components/PulseSurveyTrends';
import type {
  Affiliation,
  PulseSurveySummary,
  PulseSurveyDetail,
  PulseTrendData,
  PulseMyTrendItem,
  PulseMonthlyData,
} from '../types';

type Tab = 'my' | 'personal' | 'affiliation' | 'company';

export function PulseSurveyPage() {
  const me = useMe();

  const [tab, setTab] = useState<Tab>('my');
  const [toast, setToast] = useState<string | null>(null);

  // マイサーベイ
  const [mySurveys, setMySurveys] = useState<PulseSurveySummary[]>([]);
  const [activeSurveyId, setActiveSurveyId] = useState<string | null>(null);
  const [streak, setStreak] = useState<number | null>(null);

  // 所属別結果
  const [selectedAffId, setSelectedAffId] = useState<string | null>(null);
  const [affDetail, setAffDetail] = useState<PulseSurveyDetail | null>(null);
  const [affTrends, setAffTrends] = useState<PulseTrendData[]>([]);
  const [affHistory, setAffHistory] = useState<PulseSurveySummary[]>([]);
  const [affiliations, setAffiliations] = useState<Affiliation[]>([]);

  // 個人トレンド
  const [myTrends, setMyTrends] = useState<PulseMyTrendItem[]>([]);

  // 全社
  const [companyView, setCompanyView] = useState<'weekly' | 'monthly'>('weekly');
  const [companyWeekly, setCompanyWeekly] = useState<PulseTrendData[]>([]);
  const [companyMonthly, setCompanyMonthly] = useState<PulseMonthlyData[]>([]);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  // 自分の所属取得
  useEffect(() => {
    if (!me) return;
    api.getUserAffiliations(me.id).then(setAffiliations).catch(() => setAffiliations([]));
  }, [me]);

  // マイサーベイ読み込み
  const loadMySurveys = useCallback(() => {
    api.getMyCurrentPulses().then(setMySurveys).catch(() => setMySurveys([]));
  }, []);

  useEffect(() => { if (tab === 'my') loadMySurveys(); }, [tab, loadMySurveys]);

  // 個人トレンド読み込み
  useEffect(() => {
    if (tab === 'personal') {
      api.getMyPulseTrends(24).then(setMyTrends).catch(() => setMyTrends([]));
    }
  }, [tab]);

  // 全社データ読み込み
  useEffect(() => {
    if (tab === 'company') {
      api.getCompanyWeeklyPulse(12).then(setCompanyWeekly).catch(() => setCompanyWeekly([]));
      api.getCompanyMonthlyPulse(12).then(setCompanyMonthly).catch(() => setCompanyMonthly([]));
    }
  }, [tab]);

  // 所属別データ読み込み
  useEffect(() => {
    if (tab === 'affiliation' && selectedAffId) {
      api.getAffiliationPulseTrends(selectedAffId).then(setAffTrends).catch(() => setAffTrends([]));
      api.listPulseSurveys(selectedAffId, 20).then(setAffHistory).catch(() => setAffHistory([]));
    }
  }, [tab, selectedAffId]);

  // 所属タブの初期選択
  useEffect(() => {
    if (tab === 'affiliation' && !selectedAffId && affiliations.length > 0) {
      setSelectedAffId(affiliations[0].id);
    }
  }, [tab, selectedAffId, affiliations]);

  const handleSubmit = async (answers: Record<string, number>, comment?: string) => {
    if (!activeSurveyId) return;
    const res = await api.respondToPulse(activeSurveyId, answers, comment);
    setStreak(res.streak);
    setActiveSurveyId(null);
    showToast('回答を送信しました!');
    loadMySurveys();
  };

  const viewResult = async (surveyId: string) => {
    try {
      const d = await api.getPulseSurvey(surveyId);
      setAffDetail(d);
    } catch {
      showToast('結果の取得に失敗しました');
    }
  };

  if (!me) return <div className="loading">読み込み中...</div>;

  return (
    <div className="pulse-page">
      <h1 className="pulse-page-title">パルスサーベイ</h1>
      <p className="pulse-page-desc">週次セルフチェックで、チームと自分のエンゲージメントを可視化</p>

      {/* タブ */}
      <div className="tabs">
        <button className={tab === 'my' ? 'active' : ''} onClick={() => setTab('my')}>
          <ClipboardCheck size={16} /> マイサーベイ
          {mySurveys.some((s) => !s.myResponseExists) && <span className="pulse-badge" />}
        </button>
        <button className={tab === 'personal' ? 'active' : ''} onClick={() => setTab('personal')}>
          <TrendingUp size={16} /> 個人トレンド
        </button>
        <button className={tab === 'affiliation' ? 'active' : ''} onClick={() => setTab('affiliation')}>
          <BarChart3 size={16} /> 所属別結果
        </button>
        <button className={tab === 'company' ? 'active' : ''} onClick={() => setTab('company')}>
          <Building2 size={16} /> 全社
        </button>
      </div>

      <div className="pulse-content">
        {/* ======== マイサーベイタブ ======== */}
        {tab === 'my' && (
          <>
            {/* 回答フォーム表示中 */}
            {activeSurveyId && (
              <div className="card">
                <button className="btn-ghost" onClick={() => setActiveSurveyId(null)} style={{ marginBottom: 12 }}>
                  戻る
                </button>
                <PulseSurveyForm onSubmit={handleSubmit} />
              </div>
            )}

            {/* サーベイ結果表示中 */}
            {affDetail && !activeSurveyId && (
              <div>
                <button className="btn-ghost" onClick={() => setAffDetail(null)} style={{ marginBottom: 12 }}>
                  戻る
                </button>
                <h2 style={{ fontSize: '1rem', marginBottom: 12 }}>{affDetail.affiliationName} — {affDetail.periodLabel}</h2>
                <PulseSurveyResults survey={affDetail} />
              </div>
            )}

            {/* サーベイ一覧 */}
            {!activeSurveyId && !affDetail && (
              <>
                {mySurveys.length === 0 ? (
                  <div className="card pulse-no-survey">
                    <p>現在オープンなサーベイはありません。</p>
                    <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 4 }}>
                      管理者が新しいサーベイを開始するまでお待ちください。
                    </p>
                  </div>
                ) : (
                  <div className="pulse-survey-list">
                    {mySurveys.map((s) => (
                      <div key={s.id} className="card pulse-survey-card">
                        <div className="pulse-survey-card-header">
                          <div>
                            <span className="pulse-aff-name">{s.affiliationName}</span>
                            <span className="pulse-period">{s.periodLabel}</span>
                          </div>
                          <span className="pulse-deadline">
                            締切: {new Date(s.closesAt).toLocaleDateString('ja-JP')}
                          </span>
                        </div>
                        <div className="pulse-survey-card-meta">
                          <span>回答率: {s.memberCount > 0 ? Math.round((s.responseCount / s.memberCount) * 100) : 0}% ({s.responseCount}/{s.memberCount})</span>
                        </div>
                        <div className="pulse-survey-card-actions">
                          {s.myResponseExists ? (
                            <>
                              <span className="pulse-responded-badge">
                                <CheckCircle size={14} /> 回答済み
                              </span>
                              <button className="btn-ghost" onClick={() => viewResult(s.id)}>
                                結果を見る <ChevronRight size={14} />
                              </button>
                            </>
                          ) : (
                            <button className="btn" onClick={() => setActiveSurveyId(s.id)}>
                              回答する <ChevronRight size={14} />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {streak && streak > 1 && (
                  <div className="pulse-streak-banner">
                    {streak}週連続回答中!
                  </div>
                )}
              </>
            )}
          </>
        )}

        {/* ======== 個人トレンドタブ ======== */}
        {tab === 'personal' && (
          <>
            {myTrends.length === 0 ? (
              <div className="empty">まだ回答履歴がありません。サーベイに回答すると個人トレンドが表示されます。</div>
            ) : (
              <PulseSurveyTrends
                trends={myTrends.map((t) => ({
                  periodLabel: `${t.periodLabel} (${t.affiliationName})`,
                  dimensions: t.dimensions,
                  overall: t.overall ?? 0,
                  responseRate: 0,
                  responseCount: 0,
                }))}
              />
            )}
          </>
        )}

        {/* ======== 所属別結果タブ ======== */}
        {tab === 'affiliation' && (
          <>
            {affiliations.length === 0 ? (
              <div className="empty">所属が設定されていません。</div>
            ) : (
              <>
                <div className="pulse-aff-selector">
                  <select
                    value={selectedAffId || ''}
                    onChange={(e) => { setSelectedAffId(e.target.value); setAffDetail(null); }}
                  >
                    {affiliations.map((a) => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                </div>

                {/* トレンド */}
                {affTrends.length > 0 && (
                  <PulseSurveyTrends trends={affTrends} />
                )}

                {/* 履歴 */}
                {affHistory.length > 0 && (
                  <div className="pulse-history" style={{ marginTop: 16 }}>
                    <h3 style={{ fontSize: '1rem', marginBottom: 8 }}>サーベイ履歴</h3>
                    {affHistory.map((s) => (
                      <div key={s.id} className="card pulse-history-item" onClick={() => viewResult(s.id)} role="button" tabIndex={0}>
                        <div className="pulse-history-main">
                          <span className="pulse-period">{s.periodLabel}</span>
                          <span className={`pulse-status pulse-status-${s.status}`}>
                            {s.status === 'open' ? 'オープン' : 'クローズ'}
                          </span>
                        </div>
                        <div className="pulse-history-meta">
                          <span>回答: {s.responseCount}/{s.memberCount}</span>
                          <span>回答率: {s.memberCount > 0 ? Math.round((s.responseCount / s.memberCount) * 100) : 0}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* 個別結果 (モーダル的に表示) */}
                {affDetail && (
                  <div style={{ marginTop: 16 }}>
                    <button className="btn-ghost" onClick={() => setAffDetail(null)} style={{ marginBottom: 12 }}>
                      戻る
                    </button>
                    <h2 style={{ fontSize: '1rem', marginBottom: 12 }}>{affDetail.affiliationName} — {affDetail.periodLabel}</h2>
                    <PulseSurveyResults survey={affDetail} />
                  </div>
                )}
              </>
            )}
          </>
        )}
        {/* ======== 全社タブ ======== */}
        {tab === 'company' && (
          <>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <button
                className={companyView === 'weekly' ? 'btn' : 'btn-ghost'}
                onClick={() => setCompanyView('weekly')}
              >
                週次
              </button>
              <button
                className={companyView === 'monthly' ? 'btn' : 'btn-ghost'}
                onClick={() => setCompanyView('monthly')}
              >
                月次
              </button>
            </div>

            {companyView === 'weekly' && (
              companyWeekly.length === 0 ? (
                <div className="empty">まだ集計データがありません。サーベイを作成して回答を集めてください。</div>
              ) : (
                <PulseSurveyTrends trends={companyWeekly} />
              )
            )}

            {companyView === 'monthly' && (
              companyMonthly.length === 0 ? (
                <div className="empty">まだ月次データがありません。</div>
              ) : (
                <PulseSurveyTrends
                  trends={companyMonthly.map((m) => ({
                    periodLabel: m.month,
                    dimensions: m.dimensions,
                    overall: m.overall,
                    responseRate: m.responseRate,
                    responseCount: m.responseCount,
                  }))}
                />
              )
            )}
          </>
        )}
      </div>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
