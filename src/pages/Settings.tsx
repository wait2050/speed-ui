import React, { useState, useCallback, useRef } from 'react';
import { useAppStore, uploadSnapFileToStorage } from '../state/store';
import { loadPreferences, savePreferences } from '../storage';
import { audioEngine } from '../audio/engine';
import type { SoundType, SpeedTier } from '../types';
import { DEFAULT_PREFERENCES } from '../types';

const TIER_LABELS: Record<SpeedTier, string> = { slow: '慢速', medium: '中速', fast: '快速', extreme: '极速' };
const SOUNDS: { id: SoundType; label: string }[] = [
  { id: 'tick', label: '经典嗒音' }, { id: 'woodblock', label: '木鱼' },
  { id: 'heartbeat', label: '心跳' }, { id: 'waterdrop', label: '水滴' },
  { id: 'fingertap', label: '指尖敲击' }, { id: 'bassdrum', label: '低音鼓点' },
];

export const Settings: React.FC = () => {
  const [prefs, setPrefs] = useState(() => loadPreferences());
  const snapVol = useAppStore((s) => s.snapVolume);
  const setSnapVol = useAppStore((s) => s.setSnapVolume);
  const snapConfig = useAppStore((s) => s.snapConfig);
  const setSnapCustomUploaded = useAppStore((s) => s.setSnapCustomUploaded);
  const resetSnapToDefault = useAppStore((s) => s.resetSnapToDefault);

  const snapFileInputRef = useRef<HTMLInputElement>(null);
  const [snapUploadError, setSnapUploadError] = useState<string | null>(null);
  const [snapUploadBusy, setSnapUploadBusy] = useState(false);

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

  const handleResetPrefs = useCallback(() => {
    if (window.confirm('确定要恢复所有速度与音色预设为默认值吗？')) {
      savePreferences(DEFAULT_PREFERENCES);
      setPrefs({ ...DEFAULT_PREFERENCES });
    }
  }, []);

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

  return (
    <div className="page settings-page">
      <div className="home-hero">
        <h1 className="app-title">全局设置</h1>
        <p className="home-subtitle">配置您的音色、节拍速度与系统行为</p>
      </div>

      <input
        ref={snapFileInputRef}
        type="file"
        accept="audio/*"
        style={{ display: 'none' }}
        onChange={handleSnapFileChange}
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', paddingBottom: '40px', width: '100%', maxWidth: '600px' }}>
        {/* 响指设置 */}
        <section className="glass-card" style={{ padding: '20px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '16px', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '10px' }}>
            👆 响指音频配置
          </h2>

          <div style={{ marginBottom: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary)' }}>响指音量</span>
              <button
                className="btn-chip"
                onClick={async () => { await audioEngine.init(); audioEngine.previewSnap(snapVol / 100); }}
                style={{ fontSize: '11px', padding: '4px 12px' }}
              >
                🔊 试听响指
              </button>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={snapVol}
              onChange={e => setSnapVol(parseInt(e.target.value))}
              style={{ width: '100%', cursor: 'pointer' }}
            />
            <span style={{ fontSize: '12px', color: 'var(--accent)', marginTop: '4px', display: 'block' }}>{snapVol}%</span>
          </div>

          <div>
            <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary)', display: 'block', marginBottom: '8px' }}>响指音源</span>
            <div style={{ fontSize: '12px', color: 'var(--text-primary)', marginBottom: '12px', padding: '8px 12px', background: 'rgba(0,0,0,0.15)', borderRadius: '6px' }}>
              当前状态：{snapConfig.sourceMode === 'custom' && snapConfig.customFilename
                ? <><span style={{ color: 'var(--accent)' }}>自定义</span> ({snapConfig.customFilename})</>
                : <><span>系统默认</span> (snap.mp3)</>}
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button
                className="btn-chip"
                onClick={handleSnapFilePick}
                disabled={snapUploadBusy}
                style={{ fontSize: '12px', padding: '8px 16px' }}
              >
                {snapUploadBusy ? '正在上传...' : '📎 上传自定义音频'}
              </button>
              <button
                className="btn-chip"
                onClick={handleSnapReset}
                disabled={snapUploadBusy || snapConfig.sourceMode === 'default'}
                style={{ fontSize: '12px', padding: '8px 16px', opacity: snapConfig.sourceMode === 'default' ? 0.4 : 1 }}
              >
                ↺ 恢复默认音源
              </button>
            </div>
            {snapUploadError && (
              <p style={{ fontSize: '11px', color: '#e94560', marginTop: '8px' }}>{snapUploadError}</p>
            )}
            <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '8px', lineHeight: 1.4 }}>
              * 支持 mp3 / wav / ogg，单文件限制在 5MB 以内。
            </p>
          </div>
        </section>

        {/* 速度与音色 */}
        <section className="glass-card" style={{ padding: '20px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '16px', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '10px' }}>
            🎵 速度与音色配置
          </h2>

          {(Object.keys(prefs.customBpm) as SpeedTier[]).map(tier => (
            <div key={tier} style={{ marginBottom: '24px', borderBottom: '1px dashed rgba(255,255,255,0.04)', paddingBottom: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>{TIER_LABELS[tier]}节拍</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '13px', color: 'var(--accent)', fontWeight: 600 }}>{prefs.customBpm[tier]} BPM</span>
                  <button
                    className="btn-chip"
                    onClick={async () => { await audioEngine.init(); audioEngine.previewBpm(prefs.customBpm[tier], prefs.customSounds[tier]); }}
                    style={{ fontSize: '11px', padding: '2px 8px' }}
                  >
                    试听 🔊
                  </button>
                </div>
              </div>

              <input
                type="range"
                min={40}
                max={200}
                value={prefs.customBpm[tier]}
                onChange={e => handleBpmChange(tier, parseInt(e.target.value))}
                style={{ width: '100%', cursor: 'pointer', marginBottom: '10px' }}
              />

              <span style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>选择音色</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {SOUNDS.map(s => (
                  <button
                    key={s.id}
                    className={`btn-chip ${prefs.customSounds[tier] === s.id ? 'active' : ''}`}
                    onClick={() => handleSoundChange(tier, s.id)}
                    style={{ fontSize: '11px', padding: '6px 10px' }}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          ))}

          {/* 收尾音色 */}
          <div style={{ paddingBottom: '8px' }}>
            <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', display: 'block', marginBottom: '8px' }}>收尾阶段音色</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {SOUNDS.map(s => (
                <button
                  key={s.id}
                  className={`btn-chip ${prefs.customSounds.cooldown === s.id ? 'active' : ''}`}
                  onClick={() => handleSoundChange('cooldown', s.id)}
                  style={{ fontSize: '11px', padding: '6px 10px' }}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* 恢复全部默认 */}
        <button
          className="btn-chip"
          onClick={handleResetPrefs}
          style={{
            padding: '12px',
            fontSize: '13px',
            borderRadius: '12px',
            border: '1px solid rgba(255,255,255,0.1)',
            background: 'rgba(255,255,255,0.02)',
            color: 'var(--text-secondary)',
            cursor: 'pointer'
          }}
        >
          ↺ 恢复速度与音色默认预设
        </button>
      </div>
    </div>
  );
};
