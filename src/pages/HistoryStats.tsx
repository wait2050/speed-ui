import React, { useState, useCallback, useEffect, useRef } from 'react';
import { loadHistory, loadFavorites, removeFavorite, loadStats } from '../storage';
import { formatSec } from '../utils/time';
import { useAppStore } from '../state/store';
import { readImportFile } from '../storage/export';
import type { HistoryEntry, Favorite } from '../types';

export const HistoryStats: React.FC = () => {
  const [activeSubTab, setActiveSubTab] = useState<'history' | 'favorites' | 'stats'>('history');
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const { showHistoryDetail, compilationDone } = useAppStore();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const reloadData = useCallback(() => {
    setHistory(loadHistory());
    setFavorites(loadFavorites());
  }, []);

  useEffect(() => {
    reloadData();
  }, [reloadData]);

  const handleDeleteFav = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    removeFavorite(id);
    setFavorites(prev => prev.filter(f => f.id !== id));
  }, []);

  const handleLoadFavorite = useCallback((fav: Favorite) => {
    compilationDone(fav.sequence);
  }, [compilationDone]);

  const handleImportClick = useCallback(() => {
    setImportError(null);
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError(null);
    try {
      const data = await readImportFile(file);
      compilationDone(data.sequence);
    } catch (err: any) {
      setImportError(err.message ?? '导入失败');
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [compilationDone]);

  const stats = loadStats();

  return (
    <div className="page history-stats-page">
      <div className="home-hero">
        <h1 className="app-title">历史与统计</h1>
        <p className="home-subtitle">您的使用记录与偏好统计</p>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      {/* Sub Tabs */}
      <div className="sub-tabs-container glass-card" style={{ display: 'flex', gap: '4px', padding: '4px', borderRadius: '10px', marginBottom: '24px', width: '100%', maxWidth: '600px' }}>
        {(['history', 'favorites', 'stats'] as const).map((sub) => {
          const labels = { history: '历史', favorites: '收藏', stats: '统计' };
          const isActive = activeSubTab === sub;
          return (
            <button
              key={sub}
              className={`btn-chip ${isActive ? 'active' : ''}`}
              style={{ flex: 1, padding: '8px 0', borderRadius: '6px', border: 'none', background: isActive ? 'var(--accent)' : 'transparent', color: isActive ? '#fff' : 'var(--text-secondary)', fontSize: '12px', fontWeight: 600 }}
              onClick={() => setActiveSubTab(sub)}
            >
              {labels[sub]}
            </button>
          );
        })}
      </div>

      <div className="sub-tab-content" style={{ width: '100%', maxWidth: '600px' }}>
        {activeSubTab === 'history' && (
          <div className="history-list-container">
            {history.length === 0 ? (
              <div className="empty-state glass-card" style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                <span style={{ fontSize: '32px', display: 'block', marginBottom: '12px' }}>📂</span>
                暂无历史记录
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {history.map((h) => (
                  <div
                    key={h.id}
                    className="glass-card history-item-card"
                    style={{ padding: '16px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                    onClick={() => showHistoryDetail(h.id)}
                  >
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '15px', color: 'var(--text-primary)', marginBottom: '4px' }}>
                        ⏱️ {formatSec(h.totalDuration)}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                        {h.stats.rounds} 轮循环 · {h.rating ? `评分 ${'★'.repeat(h.rating)}` : '未评分'}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                        {new Date(h.timestamp).toLocaleString('zh-CN', {
                          month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                        })}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeSubTab === 'favorites' && (
          <div className="favorites-list-container">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>我的收藏列表</span>
              <button
                className="btn-chip"
                onClick={handleImportClick}
                style={{ fontSize: '12px', padding: '6px 14px', border: '1px dashed rgba(255,255,255,0.2)', background: 'transparent' }}
              >
                📥 导入编排 JSON
              </button>
            </div>

            {importError && (
              <div className="glass-card" style={{ padding: '10px 16px', background: 'rgba(233, 69, 96, 0.15)', color: '#e94560', fontSize: '12px', borderRadius: '8px', marginBottom: '12px' }}>
                ❌ 导入错误：{importError}
              </div>
            )}

            {favorites.length === 0 ? (
              <div className="empty-state glass-card" style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                <span style={{ fontSize: '32px', display: 'block', marginBottom: '12px' }}>⭐</span>
                收藏夹空空如也，体验完成后可将编排加入收藏。
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {favorites.map((f) => (
                  <div
                    key={f.id}
                    className="glass-card favorite-item-card"
                    style={{ padding: '16px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                    onClick={() => handleLoadFavorite(f)}
                  >
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '15px', color: 'var(--text-primary)', marginBottom: '4px' }}>
                        🌟 {f.label || '未命名编排'}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                        总时长: {formatSec(f.sequence.stats.totalDuration / 1000)} · {f.sequence.stats.rounds} 轮
                      </div>
                    </div>
                    <button
                      className="btn-chip"
                      style={{ padding: '6px 12px', border: '1px solid rgba(233, 69, 96, 0.3)', color: '#e94560', background: 'transparent' }}
                      onClick={(e) => handleDeleteFav(f.id, e)}
                    >
                      删除
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeSubTab === 'stats' && (
          <div className="stats-dashboard">
            {!stats ? (
              <div className="empty-state glass-card" style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                <span style={{ fontSize: '32px', display: 'block', marginBottom: '12px' }}>📊</span>
                暂无足够数据，生成几次编排后再来查看吧
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="glass-card" style={{ padding: '16px', textAlign: 'center' }}>
                    <span style={{ fontSize: '24px', fontWeight: 700, color: 'var(--accent)', display: 'block' }}>{stats.totalSessions}</span>
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>累计使用次数</span>
                  </div>
                  <div className="glass-card" style={{ padding: '16px', textAlign: 'center' }}>
                    <span style={{ fontSize: '24px', fontWeight: 700, color: 'var(--accent)', display: 'block' }}>{Math.round(stats.totalDurationMs / 60000)}</span>
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>累计时长 (分钟)</span>
                  </div>
                </div>

                <div className="glass-card" style={{ padding: '16px', textAlign: 'center' }}>
                  <span style={{ fontSize: '24px', fontWeight: 700, color: 'var(--accent)', display: 'block' }}>{stats.averageRating || '-'} / 5</span>
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>平均评分</span>
                </div>

                {stats.topActions.length > 0 && (
                  <div className="glass-card" style={{ padding: '16px' }}>
                    <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '12px' }}>🔥 最常进行的动作</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {stats.topActions.map((act, index) => (
                        <div key={act.name} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                          <span style={{ color: 'var(--text-secondary)' }}>{index + 1}. {act.name}</span>
                          <span style={{ color: 'var(--accent)', fontWeight: 500 }}>{act.count} 次</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
