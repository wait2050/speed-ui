// ============================================================
// Home — 主页：总时长设定 + 生成编排
// ============================================================
import React, { useState, useCallback } from 'react';
import { useAppStore } from '../state/store';
import { compileSequence } from '../compiler/compiler';
import { loadPreferences, savePreferences } from '../storage';
import { audioEngine } from '../audio/engine';
import { formatSec } from '../utils/time';
import { Footer } from '../components/Footer';
import type { SoundType, SpeedTier, PhaseOption } from '../types';

const TIER_LABELS: Record<SpeedTier, string> = {
  slow: '慢速',
  medium: '中速',
  fast: '快速',
  extreme: '极速',
};

const SOUNDS: { id: SoundType; label: string }[] = [
  { id: 'tick', label: '经典嗒音' },
  { id: 'woodblock', label: '木鱼' },
  { id: 'heartbeat', label: '心跳' },
  { id: 'waterdrop', label: '水滴' },
  { id: 'fingertap', label: '指尖敲击' },
  { id: 'bassdrum', label: '低音鼓点' },
];

export const Home: React.FC = () => {
  const { startCompiling: dispatchStartCompiling, compilationDone } = useAppStore();
  const [prefs, setPrefs] = useState(() => loadPreferences());
  const [showSettings, setShowSettings] = useState(false);
  const [enabledPhases, setEnabledPhases] = useState<Set<PhaseOption>>(
    () => new Set<PhaseOption>(['warmup', 'core', 'sprint', 'climax', 'afterglow', 'cooldown'])
  );

  const ALL_ACTION_NAMES = [
    '捏住并旋转', '提拉然后松手',
    '上下刮擦', '左右捏住然后松开',
    '指腹摩擦', '周围区域摩擦', '反复点按',
  ];

  const [enabledActions, setEnabledActions] = useState<Set<string>>(
    () => new Set(ALL_ACTION_NAMES)
  );

  const [climaxMin, setClimaxMin] = useState(3);     // 高潮冲刺 1-5 分钟
  const [afterglowMin, setAfterglowMin] = useState(1); // 余韵 1-3 分钟

  const [snapCounts, setSnapCounts] = useState<Record<string, number>>({
    core: 0, sprint_start: 0, sprint_accel: 0, sprint_peak: 0, climax: 0, afterglow: 0,
  });

  const togglePhase = useCallback((p: PhaseOption) => {
    setEnabledPhases(prev => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p); else next.add(p);
      return next;
    });
  }, []);

  const toggleAction = useCallback((name: string) => {
    setEnabledActions(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  }, []);

  const handleCompile = useCallback(async () => {
    // 首次用户交互时初始化音频引擎
    await audioEngine.init();

    dispatchStartCompiling();

    // 编译器是纯函数，但用 setTimeout 避免阻塞 UI
    setTimeout(() => {
      const totalMs = prefs.defaultDuration * 1000;
      const compiled = compileSequence(totalMs, prefs, undefined, { enabled: enabledPhases }, enabledActions, climaxMin, afterglowMin, snapCounts);
      compilationDone(compiled);
    }, 50);
  }, [dispatchStartCompiling, compilationDone, prefs, enabledPhases, enabledActions, climaxMin, afterglowMin, snapCounts]);

  const handleDurationChange = useCallback((val: number) => {
    const newPrefs = { ...prefs, defaultDuration: val };
    setPrefs(newPrefs);
    savePreferences(newPrefs);
  }, [prefs]);

  const handleBpmChange = useCallback((tier: SpeedTier, val: number) => {
    const newPrefs = {
      ...prefs,
      customBpm: { ...prefs.customBpm, [tier]: val },
    };
    setPrefs(newPrefs);
    savePreferences(newPrefs);
  }, [prefs]);

  const handleSoundChange = useCallback((tier: SpeedTier | 'cooldown', sound: SoundType) => {
    const newPrefs = {
      ...prefs,
      customSounds: { ...prefs.customSounds, [tier]: sound },
    };
    setPrefs(newPrefs);
    savePreferences(newPrefs);
    // 试听
    audioEngine.init().then(() => audioEngine.previewBeat(sound));
  }, [prefs]);

  const presets = [10, 15, 20, 25, 30, 40, 50, 60];

  return (
    <div className="page home-page">
      <h1 className="app-title">节奏按摩引导器</h1>

      {/* 时长设定 */}
      <section className="duration-section">
        <div className="duration-display">
          <span className="duration-value">{Math.floor(prefs.defaultDuration / 60)}</span>
          <span className="duration-unit">分钟</span>
        </div>
        <input
          type="range"
          className="duration-slider"
          min={1}
          max={60}
          value={Math.floor(prefs.defaultDuration / 60)}
          onChange={e => handleDurationChange(parseInt(e.target.value) * 60)}
        />
        <div className="preset-row">
          {presets.map(p => (
            <button
              key={p}
              className={`preset-btn ${Math.floor(prefs.defaultDuration / 60) === p ? 'active' : ''}`}
              onClick={() => handleDurationChange(p * 60)}
            >
              {p}′
            </button>
          ))}
        </div>
      </section>

      {/* 阶段选择 */}
      <section className="phase-toggles">
        <span className="phase-toggles-label">包含阶段</span>
        <div className="phase-toggles-row">
          {([
            ['warmup', '热身'],
            ['core', '核心'],
            ['sprint', '冲刺'],
            ['climax', '高潮'],
            ['afterglow', '余韵'],
            ['cooldown', '收尾'],
          ] as [PhaseOption, string][]).map(([key, label]) => (
            <button
              key={key}
              className={`phase-toggle ${enabledPhases.has(key) ? 'active' : ''}`}
              onClick={() => togglePhase(key)}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      {/* 高潮/余韵时长 */}
      <section className="phase-toggles">
        <span className="phase-toggles-label">高潮冲刺 {climaxMin} 分钟 · 余韵 {afterglowMin} 分钟</span>
        <div className="phase-toggles-row">
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)', alignSelf: 'center' }}>高潮</span>
          {[1, 2, 3, 4, 5].map(m => (
            <button
              key={`c${m}`}
              className={`phase-toggle ${climaxMin === m ? 'active' : ''}`}
              onClick={() => setClimaxMin(m)}
            >
              {m}′
            </button>
          ))}
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)', alignSelf: 'center', marginLeft: 8 }}>余韵</span>
          {[1, 2, 3].map(m => (
            <button
              key={`a${m}`}
              className={`phase-toggle ${afterglowMin === m ? 'active' : ''}`}
              onClick={() => setAfterglowMin(m)}
            >
              {m}′
            </button>
          ))}
        </div>
      </section>

      {/* 打响指次数 */}
      <section className="phase-toggles">
        <span className="phase-toggles-label">打响指次数</span>
        <div className="phase-toggles-row">
          {([
            ['core', '核心'], ['sprint_start', '起冲'], ['sprint_accel', '加速'],
            ['sprint_peak', '顶峰'], ['climax', '高潮'], ['afterglow', '余韵'],
          ] as [string, string][]).map(([key, label]) => (
            <span key={key} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)' }}>{label}</span>
              {[0, 1, 2, 3, 4].map(n => (
                <button
                  key={n}
                  className={`phase-toggle ${(snapCounts[key] ?? 0) === n ? 'active' : ''}`}
                  onClick={() => setSnapCounts(prev => ({ ...prev, [key]: n }))}
                  style={{ padding: '3px 8px', fontSize: 10, minWidth: 24 }}
                >
                  {n}
                </button>
              ))}
            </span>
          ))}
        </div>
      </section>

      {/* 动作选择 */}
      <section className="phase-toggles">
        <span className="phase-toggles-label">可选动作 ({enabledActions.size}/{ALL_ACTION_NAMES.length})</span>
        <div className="phase-toggles-row">
          {ALL_ACTION_NAMES.map(name => (
            <button
              key={name}
              className={`phase-toggle action-toggle ${enabledActions.has(name) ? 'active' : ''}`}
              onClick={() => toggleAction(name)}
            >
              {name}
            </button>
          ))}
        </div>
      </section>

      {/* 生成按钮 */}
      <button className="btn btn-compile" onClick={handleCompile}>
        生成编排
      </button>

      {/* 设置 */}
      <button
        className="btn btn-settings-toggle"
        onClick={() => setShowSettings(!showSettings)}
      >
        {showSettings ? '收起设置 ▲' : '自定义速度/音色 ▼'}
      </button>

      {showSettings && (
        <div className="settings-panel">
          {(Object.keys(prefs.customBpm) as SpeedTier[]).map(tier => (
            <div key={tier} className="settings-row">
              <span className="settings-label">{TIER_LABELS[tier]}</span>
              <input
                type="range"
                min={40}
                max={200}
                value={prefs.customBpm[tier]}
                onChange={e => handleBpmChange(tier, parseInt(e.target.value))}
              />
              <span className="settings-value">{prefs.customBpm[tier]} BPM</span>
              <div className="sound-picker">
                {SOUNDS.map(s => (
                  <button
                    key={s.id}
                    className={`sound-btn ${prefs.customSounds[tier] === s.id ? 'active' : ''}`}
                    onClick={() => handleSoundChange(tier, s.id)}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <div className="settings-row">
            <span className="settings-label">收尾</span>
            <div className="sound-picker">
              {SOUNDS.map(s => (
                <button
                  key={s.id}
                  className={`sound-btn ${prefs.customSounds.cooldown === s.id ? 'active' : ''}`}
                  onClick={() => handleSoundChange('cooldown', s.id)}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <Footer />
    </div>
  );
};
