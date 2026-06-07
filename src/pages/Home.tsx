// ============================================================
// Home — 主页：总时长设定 + 手风琴卡片分组 + 生成编排
// ============================================================
import React, { useState, useCallback, useEffect } from 'react';
import { useAppStore } from '../state/store';
import { compileSequence } from '../compiler/compiler';
import { loadPreferences, savePreferences } from '../storage';
import { audioEngine } from '../audio/engine';
import { Footer } from '../components/Footer';
import type { PhaseOption } from '../types';

// ---- SectionCard 组件（始终展开的平铺区块） ----
const SectionCard: React.FC<{
  title: string;
  badge?: string;
  children: React.ReactNode;
}> = ({ title, badge, children }) => {
  return (
    <div className="section-card">
      <div className="section-card-header">
        <div className="section-card-title">
          <span>{title}</span>
          {badge && <span className="accordion-badge">{badge}</span>}
        </div>
      </div>
      <div className="section-card-body">
        {children}
      </div>
    </div>
  );
};

export const Home: React.FC = () => {
  const { startCompiling: dispatchStartCompiling, compilationDone } = useAppStore();
  const [prefs, setPrefs] = useState(() => loadPreferences());
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

  const [climaxMin, setClimaxMin] = useState(3);
  const [afterglowMin, setAfterglowMin] = useState(1);

  const [snapCounts, setSnapCountsState] = useState<Record<string, number>>(() => {
    return useAppStore.getState().snapConfig.counts;
  });

  // 休息时间范围（秒）
  const [restRanges, setRestRanges] = useState<Record<string, { min: number | ''; max: number | '' }>>(() => ({
    warmup: { min: 15, max: 25 },
    core: { min: 10, max: 20 },
    sprint: { min: 10, max: 20 },
  }));

  // 订阅 store 中的 snapCounts（防止从其他来源修改时不同步）
  useEffect(() => {
    const unsub = useAppStore.subscribe((s) => {
      setSnapCountsState(s.snapConfig.counts);
    });
    return unsub;
  }, []);

  const updateSnapCounts = useCallback((next: Record<string, number>) => {
    setSnapCountsState(next);
    useAppStore.getState().setSnapCounts(next as any);
  }, []);

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

  const updateRestRange = useCallback((phase: string, field: 'min' | 'max', valStr: string) => {
    if (valStr === '') {
      setRestRanges(prev => ({
        ...prev,
        [phase]: { ...prev[phase], [field]: '' },
      }));
      return;
    }
    const val = parseInt(valStr, 10);
    if (isNaN(val)) return;
    setRestRanges(prev => ({
      ...prev,
      [phase]: { ...prev[phase], [field]: val },
    }));
  }, []);

  const handleRestRangeBlur = useCallback((phase: string, field: 'min' | 'max') => {
    setRestRanges(prev => {
      const current = prev[phase];
      let val = current[field];
      if (val === '') {
        val = field === 'min' ? 10 : 20;
      }
      const clampedVal = Math.max(3, Math.min(300, val));
      return {
        ...prev,
        [phase]: { ...prev[phase], [field]: clampedVal },
      };
    });
  }, []);

  const updateInsertWarmupPref = useCallback((field: 'enabled' | 'probability' | 'minDur' | 'maxDur', val: any) => {
    setPrefs(prev => {
      const current = prev.coreInsertWarmup ?? { enabled: false, probability: 30, minDur: 10, maxDur: 20 };
      const nextPrefs = {
        ...prev,
        coreInsertWarmup: {
          ...current,
          [field]: val,
        },
      };
      savePreferences(nextPrefs);
      return nextPrefs;
    });
  }, []);

  const handleCompile = useCallback(async () => {
    await audioEngine.init();
    dispatchStartCompiling();
    setTimeout(() => {
      const totalMs = prefs.defaultDuration * 1000;
      const cleanedRestRanges = Object.keys(restRanges).reduce((acc, phase) => {
        const r = restRanges[phase];
        const minVal = Math.max(3, Math.min(300, typeof r.min === 'number' ? r.min : 10));
        const maxVal = Math.max(3, Math.min(300, typeof r.max === 'number' ? r.max : 20));
        acc[phase] = {
          min: Math.min(minVal, maxVal),
          max: Math.max(minVal, maxVal),
        };
        return acc;
      }, {} as Record<string, { min: number; max: number }>);

      const compiled = compileSequence(totalMs, prefs, undefined, { enabled: enabledPhases }, enabledActions, climaxMin, afterglowMin, cleanedRestRanges);
      compilationDone(compiled);
    }, 50);
  }, [dispatchStartCompiling, compilationDone, prefs, enabledPhases, enabledActions, climaxMin, afterglowMin, restRanges]);

  const handleDurationChange = useCallback((val: number) => {
    const newPrefs = { ...prefs, defaultDuration: val };
    setPrefs(newPrefs);
    savePreferences(newPrefs);
  }, [prefs]);

  const presets = [10, 15, 20, 25, 30, 40, 50, 60];
  const minutes = Math.floor(prefs.defaultDuration / 60);

  return (
    <div className="page home-page">
      {/* Hero: 大面积留白渲染情绪 */}
      <div className="home-hero">
        <h1 className="app-title">节奏按摩 <sup className="version-badge">v1.1</sup></h1>
        <p className="home-subtitle">引导器</p>
      </div>

      {/* 时长选择 - 无边框大卡片 */}
      <section className="glass-card duration-card">
        <div className="duration-display">
          <span className="stat-number duration-value">{minutes}</span>
          <span className="duration-unit">分钟</span>
        </div>
        <input
          type="range"
          className="duration-slider"
          min={1}
          max={60}
          value={minutes}
          onChange={e => handleDurationChange(parseInt(e.target.value) * 60)}
        />
        <div className="preset-row">
          {presets.map(p => (
            <button
              key={p}
              className={`btn-chip ${minutes === p ? 'active' : ''}`}
              onClick={() => handleDurationChange(p * 60)}
            >
              {p}′
            </button>
          ))}
        </div>
      </section>

      {/* 阶段配置 */}
      <SectionCard title="阶段配置">
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
              className={`btn-chip ${enabledPhases.has(key) ? 'active' : ''}`}
              onClick={() => togglePhase(key)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="accordion-sub-label">高潮冲刺 {climaxMin} 分钟 · 余韵 {afterglowMin} 分钟</div>
        <div className="phase-toggles-row">
          <span className="phase-mini-label">高潮</span>
          {[1, 2, 3, 4, 5].map(m => (
            <button
              key={`c${m}`}
              className={`btn-chip ${climaxMin === m ? 'active' : ''}`}
              onClick={() => setClimaxMin(m)}
            >
              {m}′
            </button>
          ))}
          <span className="phase-mini-label" style={{ marginLeft: 8 }}>余韵</span>
          {[1, 2, 3].map(m => (
            <button
              key={`a${m}`}
              className={`btn-chip ${afterglowMin === m ? 'active' : ''}`}
              onClick={() => setAfterglowMin(m)}
            >
              {m}′
            </button>
          ))}
        </div>

      </SectionCard>

      {/* 休息时间范围 */}
      <SectionCard title="休息时间范围" badge="秒">
        <p className="accordion-sub-label">每个阶段每次休息的随机时长范围（最小～最大），单位秒</p>
        <div className="rest-range-grid">
          {(['warmup', 'core', 'sprint'] as const).map(phase => {
            const labels: Record<string, string> = { warmup: '热身', core: '核心', sprint: '冲刺' };
            const r = restRanges[phase];
            return (
              <div key={phase} className="rest-range-group">
                <span className="phase-mini-label">{labels[phase]}</span>
                <div className="rest-range-inputs">
                  <input
                    type="number"
                    className="duration-input"
                    min={3}
                    max={300}
                    value={r.min}
                    onChange={e => updateRestRange(phase, 'min', e.target.value)}
                    onBlur={() => handleRestRangeBlur(phase, 'min')}
                  />
                  <span className="rest-range-sep">~</span>
                  <input
                    type="number"
                    className="duration-input"
                    min={3}
                    max={300}
                    value={r.max}
                    onChange={e => updateRestRange(phase, 'max', e.target.value)}
                    onBlur={() => handleRestRangeBlur(phase, 'max')}
                  />
                  <span className="rest-range-unit">秒</span>
                </div>
              </div>
            );
          })}
        </div>
      </SectionCard>

      {/* 核心段插入热身动作 */}
      <SectionCard title="核心段插入热身动作">
        <p className="accordion-sub-label">核心阶段的每个休息时间过后，有概率随机插入一个热身动作（周围区域摩擦/反复点按）</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '8px' }}>
          {/* 开关 */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span className="phase-mini-label" style={{ fontSize: '13px' }}>启用该功能</span>
            <input
              type="checkbox"
              style={{ width: '20px', height: '20px', cursor: 'pointer' }}
              checked={prefs.coreInsertWarmup?.enabled ?? false}
              onChange={e => updateInsertWarmupPref('enabled', e.target.checked)}
            />
          </div>

          {(prefs.coreInsertWarmup?.enabled ?? false) && (
            <>
              {/* 概率 */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span className="phase-mini-label">随机概率</span>
                  <span style={{ fontSize: '12px', color: 'var(--accent)' }}>{prefs.coreInsertWarmup?.probability ?? 30}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={prefs.coreInsertWarmup?.probability ?? 30}
                  onChange={e => updateInsertWarmupPref('probability', parseInt(e.target.value))}
                  style={{ width: '100%' }}
                />
              </div>

              {/* 时长范围 */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span className="phase-mini-label">插入动作时长 (秒)</span>
                <div className="rest-range-inputs" style={{ marginTop: '4px' }}>
                  <input
                    type="number"
                    className="duration-input"
                    min={3}
                    max={120}
                    value={prefs.coreInsertWarmup?.minDur ?? 10}
                    onChange={e => {
                      const val = parseInt(e.target.value);
                      updateInsertWarmupPref('minDur', isNaN(val) ? '' : val);
                    }}
                    onBlur={() => {
                      const current = prefs.coreInsertWarmup?.minDur;
                      const val = typeof current === 'number' ? current : 10;
                      updateInsertWarmupPref('minDur', Math.max(3, Math.min(120, val)));
                    }}
                  />
                  <span className="rest-range-sep">~</span>
                  <input
                    type="number"
                    className="duration-input"
                    min={3}
                    max={120}
                    value={prefs.coreInsertWarmup?.maxDur ?? 20}
                    onChange={e => {
                      const val = parseInt(e.target.value);
                      updateInsertWarmupPref('maxDur', isNaN(val) ? '' : val);
                    }}
                    onBlur={() => {
                      const current = prefs.coreInsertWarmup?.maxDur;
                      const val = typeof current === 'number' ? current : 20;
                      updateInsertWarmupPref('maxDur', Math.max(3, Math.min(120, val)));
                    }}
                  />
                  <span className="rest-range-unit">秒</span>
                </div>
              </div>
            </>
          )}
        </div>
      </SectionCard>

      {/* 响指次数 */}
      <SectionCard title="响指次数" badge={`${Object.values(snapCounts).reduce((a, b) => a + b, 0)} 次`}>
        <p className="accordion-sub-label">每个阶段随机插入 0-4 次响指（热身阶段除外）</p>
        <div className="phase-toggles-row snap-toggles">
          {([
            ['core', '核心'], ['sprint_start', '起冲'], ['sprint_accel', '加速'],
            ['sprint_peak', '顶峰'], ['climax', '高潮'], ['afterglow', '余韵'],
          ] as [string, string][]).map(([key, label]) => (
            <span key={key} className="snap-group">
              <span className="snap-label">{label}</span>
              {[0, 1, 2, 3, 4].map(n => (
                <button
                  key={n}
                  className={`btn-chip snap-chip ${(snapCounts[key] ?? 0) === n ? 'active' : ''}`}
                  onClick={() => updateSnapCounts({ ...snapCounts, [key]: n })}
                >
                  {n}
                </button>
              ))}
            </span>
          ))}
        </div>
      </SectionCard>

      {/* 动作选择 */}
      <SectionCard title="可选动作" badge={`${enabledActions.size}/7`}>
        <div className="phase-toggles-row">
          {ALL_ACTION_NAMES.map(name => (
            <button
              key={name}
              className={`btn-chip action-chip ${enabledActions.has(name) ? 'active' : ''}`}
              onClick={() => toggleAction(name)}
            >
              {name}
            </button>
          ))}
        </div>
      </SectionCard>

      {/* CTA 按钮 — 自然流，非固定定位 */}
      <button className="btn-primary btn-compile-inline" onClick={handleCompile}>
        生成编排
      </button>

      <Footer />
    </div>
  );
};
