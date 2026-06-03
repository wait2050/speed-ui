// ============================================================
// Sidebar — 侧边栏组件（历史/收藏/自助编排入口）
// ============================================================
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { loadHistory, loadFavorites, removeFavorite, loadPreferences, savePreferences } from '../storage';
import { formatSec } from '../utils/time';
import { readImportFile } from '../storage/export';
import {
  useAppStore, uploadSnapFileToStorage, loadSnapCustomBuffer,
} from '../state/store';
import { audioEngine } from '../audio/engine';
import type { HistoryEntry, Favorite, CompiledSequence, SoundType, SpeedTier } from '../types';

const TIER_LABELS: Record<SpeedTier, string> = { slow: '慢速', medium: '中速', fast: '快速', extreme: '极速' };
const SOUNDS: { id: SoundType; label: string }[] = [
  { id: 'tick', label: '经典嗒音' }, { id: 'woodblock', label: '木鱼' },
  { id: 'heartbeat', label: '心跳' }, { id: 'waterdrop', label: '水滴' },
  { id: 'fingertap', label: '指尖敲击' }, { id: 'bassdrum', label: '低音鼓点' },
];

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onLoadSequence: (seq: CompiledSequence) => void;
}

type Tab = 'history' | 'favorites' | 'stats' | 'settings';

export const Sidebar: React.FC<Props> = ({ isOpen, onClose, onLoadSequence }) => {
  const [tab, setTab] = useState<Tab>('history');
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [importError, setImportError] = useState<string | null>(null);
  const [prefs, setPrefs] = useState(() => loadPreferences());
  const snapVol = useAppStore((s) => s.snapVolume);
  const setSnapVol = useAppStore((s) => s.setSnapVolume);
  const snapConfig = useAppStore((s) => s.snapConfig);
  const setSnapCustomUploaded = useAppStore((s) => s.setSnapCustomUploaded);
  const resetSnapToDefault = useAppStore((s) => s.resetSnapToDefault);
  const snapFileInputRef = useRef<HTMLInputElement>(null);
  const [snapUploadError, setSnapUploadError] = useState<string | null>(null);
  const [snapUploadBusy, setSnapUploadBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const showHistoryDetail = useAppStore((s) => s.showHistoryDetail);

  const handleBpmChange = useCallback((tier: SpeedTier, val: number) => {
    const newPrefs = { ...prefs, customBpm: { ...prefs.customBpm, [tier]: val } };
    setPrefs(newPrefs);
    savePreferences(newPrefs);
  }, [prefs]);

  const handleSoundChange = useCallback((tier: SpeedTier | 'cooldown', sound: SoundType) => {
    const newPrefs = { ...prefs, customSounds: { ...prefs.customSounds, [tier]: sound } };
    setPrefs(newPrefs);
    savePreferences(newPrefs);
    audioEngine.init().then(() => audioEngine.previewBeat(sound));
  }, [prefs]);

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

  // ---- 自定义响指音源上传 ----
  const handleSnapFilePick = useCallback(() => {
    setSnapUploadError(null);
    snapFileInputRef.current?.click();
  }, []);

  const handleSnapFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSnapUploadError(null);
    setSnapUploadBusy(true);
    try {
      const { filename, arrayBuffer } = await uploadSnapFileToStorage(file);
      setSnapCustomUploaded(filename);
      // 推送到当前正在播放的引擎（如果有）
      window.dispatchEvent(new CustomEvent('rhythm:snapSource', {
        detail: { kind: 'custom', arrayBuffer, filename },
      }));
    } catch (err: any) {
      setSnapUploadError(err.message ?? '上传失败');
    } finally {
      setSnapUploadBusy(false);
      if (snapFileInputRef.current) snapFileInputRef.current.value = '';
    }
  }, [setSnapCustomUploaded]);

  const handleSnapReset = useCallback(() => {
    setSnapUploadError(null);
    resetSnapToDefault();
    window.dispatchEvent(new CustomEvent('rhythm:snapSource', { detail: { kind: 'default' } }));
  }, [resetSnapToDefault]);

  if (!isOpen) return null;

  const tabs: { key: Tab; label: string }[] = [
    { key: 'history', label: `历史 (${history.length})` },
    { key: 'favorites', label: `收藏 (${favorites.length})` },
    { key: 'stats', label: '统计' },
    { key: 'settings', label: '设置' },
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
        <input
          ref={snapFileInputRef}
          type="file"
          accept="audio/*"
          style={{ display: 'none' }}
          onChange={handleSnapFileChange}
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

        {/* 设置 */}
        {tab === 'settings' && (
          <div className="sidebar-stats">
            {/* 响指音量 */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>👆 响指音量</span>
                <button className="btn-chip" onClick={async () => { await audioEngine.init(); audioEngine.previewSnap(snapVol / 100); }} style={{ fontSize: 11, padding: '4px 10px' }}>🔊 试听</button>
              </div>
              <input type="range" min={0} max={100} value={snapVol} onChange={e => setSnapVol(parseInt(e.target.value))} style={{ width: '100%' }} />
              <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{snapVol}%</span>
            </div>

            {/* 自定义响指音源 */}
            <div style={{ marginBottom: 20, borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 16 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', display: 'block', marginBottom: 8 }}>🎵 响指音源</span>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 8, lineHeight: 1.4 }}>
                当前：{snapConfig.sourceMode === 'custom' && snapConfig.customFilename
                  ? <><span style={{ color: 'var(--accent)' }}>自定义</span> · {snapConfig.customFilename}</>
                  : <><span>默认</span> · snap.mp3</>}
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button
                  className="btn-chip"
                  onClick={handleSnapFilePick}
                  disabled={snapUploadBusy}
                  style={{ fontSize: 11, padding: '5px 12px' }}
                >
                  {snapUploadBusy ? '上传中...' : '📎 更换音频'}
                </button>
                <button
                  className="btn-chip"
                  onClick={handleSnapReset}
                  disabled={snapUploadBusy || snapConfig.sourceMode === 'default'}
                  style={{ fontSize: 11, padding: '5px 12px', opacity: snapConfig.sourceMode === 'default' ? 0.4 : 1 }}
                >
                  ↺ 恢复默认
                </button>
              </div>
              {snapUploadError && (
                <p style={{ fontSize: 11, color: '#e94560', marginTop: 6 }}>{snapUploadError}</p>
              )}
              <p style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 6, lineHeight: 1.4 }}>
                支持 mp3 / wav / ogg，单文件 ≤ 5MB，自动持久化
              </p>
            </div>

            {/* 速度 / 音色 */}
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 16 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', display: 'block', marginBottom: 12 }}>🎵 速度 / 音色</span>
              {(Object.keys(prefs.customBpm) as SpeedTier[]).map(tier => (
                <div key={tier} style={{ marginBottom: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)' }}>{TIER_LABELS[tier]}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 11, color: 'var(--accent)' }}>{prefs.customBpm[tier]} BPM</span>
                    <button className="btn-chip" onClick={async () => { await audioEngine.init(); audioEngine.previewBpm(prefs.customBpm[tier], prefs.customSounds[tier]); }} style={{ fontSize: 10, padding: '2px 8px' }}>🔊</button>
                  </div>
                  </div>
                  <input type="range" min={40} max={200} value={prefs.customBpm[tier]} onChange={e => handleBpmChange(tier, parseInt(e.target.value))} style={{ width: '100%' }} />
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                    {SOUNDS.map(s => (
                      <button key={s.id} className={`btn-chip ${prefs.customSounds[tier] === s.id ? 'active' : ''}`} onClick={() => handleSoundChange(tier, s.id)} style={{ fontSize: 10, padding: '3px 8px' }}>
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              {/* 收尾音色 */}
              <div style={{ marginBottom: 14 }}>
                <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>收尾</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {SOUNDS.map(s => (
                    <button key={s.id} className={`btn-chip ${prefs.customSounds.cooldown === s.id ? 'active' : ''}`} onClick={() => handleSoundChange('cooldown', s.id)} style={{ fontSize: 10, padding: '3px 8px' }}>
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
};
