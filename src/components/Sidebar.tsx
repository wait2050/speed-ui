// ============================================================
// Sidebar — 侧边栏组件（历史/收藏/自助编排入口）
// ============================================================
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { loadHistory, loadFavorites, removeFavorite } from '../storage';
import { formatSec } from '../utils/time';
import { readImportFile } from '../storage/export';
import { useAppStore } from '../state/store';
import type { HistoryEntry, Favorite, CompiledSequence } from '../types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onLoadSequence: (seq: CompiledSequence) => void;
}

type Tab = 'history' | 'favorites' | 'stats';

export const Sidebar: React.FC<Props> = ({ isOpen, onClose, onLoadSequence }) => {
  const [tab, setTab] = useState<Tab>('history');
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const showHistoryDetail = useAppStore((s) => s.showHistoryDetail);

  useEffect(() => {
    if (isOpen) {
      setHistory(loadHistory());
      setFavorites(loadFavorites());
    }
  }, [isOpen]);

  const handleLoad = useCallback((seq: CompiledSequence) => {
    onLoadSequence(seq);
    onClose();
  }, [onLoadSequence, onClose]);

  const handleDeleteFav = useCallback((id: string) => {
    removeFavorite(id);
    setFavorites(prev => prev.filter(f => f.id !== id));
  }, []);

  const handleImport = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError(null);
    try {
      const data = await readImportFile(file);
      onLoadSequence(data.sequence);
      onClose();
    } catch (err: any) {
      setImportError(err.message);
    }
    // reset input
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [onLoadSequence, onClose]);

  if (!isOpen) return null;

  const tabs: { key: Tab; label: string }[] = [
    { key: 'history', label: `历史 (${history.length})` },
    { key: 'favorites', label: `收藏 (${favorites.length})` },
    { key: 'stats', label: '统计' },
  ];

  // 计算统计
  const totalSessions = history.length;
  const totalMin = Math.round(
    history.reduce((s, h) => s + h.totalDuration, 0) / 60
  );
  const avgRating =
    history.filter(h => h.rating).length > 0
      ? (
          history.filter(h => h.rating).reduce((s, h) => s + (h.rating ?? 0), 0) /
          history.filter(h => h.rating).length
        ).toFixed(1)
      : '-';

  return (
    <>
      {/* 遮罩 */}
      <div className="sidebar-overlay" onClick={onClose} />

      {/* 面板 */}
      <div className="sidebar-panel">
        <div className="sidebar-header">
          <h3>菜单</h3>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="sidebar-close" onClick={handleImport} title="导入编排">📥</button>
            <button className="sidebar-close" onClick={onClose}>✕</button>
          </div>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
        {importError && (
          <p style={{ fontSize: 11, color: '#e94560', padding: '0 20px 8px' }}>{importError}</p>
        )}

        {/* Tab 切换 */}
        <div className="sidebar-tabs">
          {tabs.map(t => (
            <button
              key={t.key}
              className={`sidebar-tab ${tab === t.key ? 'active' : ''}`}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* 历史记录 */}
        {tab === 'history' && (
          <div className="sidebar-list">
            {history.length === 0 && (
              <p className="sidebar-empty">暂无历史记录</p>
            )}
            {history.map(h => (
              <div
                key={h.id}
                className="sidebar-item"
                onClick={() => { showHistoryDetail(h.id); onClose(); }}
              >
                <div className="sidebar-item-main">
                  <span className="sidebar-item-label">
                    {formatSec(h.totalDuration)}
                  </span>
                  <span className="sidebar-item-meta">
                    {h.stats.rounds} 轮
                    {h.rating ? ` · ${'★'.repeat(h.rating)}` : ''}
                  </span>
                </div>
                <span className="sidebar-item-time">
                  {new Date(h.timestamp).toLocaleDateString('zh-CN', {
                    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                  })}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* 收藏夹 */}
        {tab === 'favorites' && (
          <div className="sidebar-list">
            {favorites.length === 0 && (
              <p className="sidebar-empty">暂无收藏</p>
            )}
            {favorites.map(f => (
              <div
                key={f.id}
                className="sidebar-item"
                onClick={() => handleLoad(f.sequence)}
              >
                <div className="sidebar-item-main">
                  <span className="sidebar-item-label">
                    {f.label || '未命名'}
                  </span>
                  <span className="sidebar-item-meta">
                    {formatSec(f.sequence.stats.totalDuration / 1000)}
                  </span>
                </div>
                <button
                  className="sidebar-delete"
                  onClick={e => { e.stopPropagation(); handleDeleteFav(f.id); }}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        {/* 使用统计 */}
        {tab === 'stats' && (
          <div className="sidebar-stats">
            {totalSessions === 0 ? (
              <p className="sidebar-empty">暂无使用数据</p>
            ) : (
              <>
                <div className="stat-row">
                  <span>累计次数</span>
                  <span>{totalSessions} 次</span>
                </div>
                <div className="stat-row">
                  <span>累计时长</span>
                  <span>{totalMin} 分钟</span>
                </div>
                <div className="stat-row">
                  <span>平均评分</span>
                  <span>{avgRating} / 5</span>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </>
  );
};
