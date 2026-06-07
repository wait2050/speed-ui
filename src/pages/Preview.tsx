// ============================================================
// Preview — 编排预览：统计 + 可编辑序列 + 开始按钮
// ============================================================
import React, { useMemo, useCallback, useState } from 'react';
import { useAppStore } from '../state/store';
import { compileSequence } from '../compiler/compiler';
import { loadPreferences } from '../storage';
import { formatMs } from '../utils/time';
import type { TimelineItem, SoundType, Phase } from '../types';

/** 声道模式显示的标签 */
const PAN_LABELS: Record<string, string> = {
  '0': '🎧 双耳',
  '-1': '⬅ 左耳',
  '1': '➡ 右耳',
  'alternating': '🔀 交错',
};

const SOUND_LABELS: Record<SoundType, string> = {
  tick: '经典嗒音 (tick)',
  woodblock: '木鱼 (woodblock)',
  heartbeat: '心跳 (heartbeat)',
  waterdrop: '水滴 (waterdrop)',
  fingertap: '指尖敲击 (fingertap)',
  bassdrum: '低音鼓点 (bassdrum)',
};

const ALL_ACTION_NAMES = [
  '捏住并旋转', '提拉然后松手',
  '上下刮擦', '左右捏住然后松开',
  '指腹摩擦', '周围区域摩擦', '反复点按',
];

function computeStats(timeline: TimelineItem[]) {
  let totalActionDuration = 0;
  let totalRestDuration = 0;
  let rounds = 0;
  let warmupRounds = 0;
  let coreRounds = 0;
  let sprintRounds = 0;

  for (const item of timeline) {
    if (item.type === 'action') {
      totalActionDuration += item.duration;
      rounds++;
      if (item.phase === 'warmup') warmupRounds++;
      else if (item.phase === 'core') coreRounds++;
      else if (item.phase === 'sprint_start' || item.phase === 'sprint_accel' || item.phase === 'sprint_peak') sprintRounds++;
    } else if (item.type === 'rest') {
      totalRestDuration += item.duration;
    }
  }

  return {
    totalDuration: totalActionDuration + totalRestDuration,
    totalActionDuration,
    totalRestDuration,
    rounds,
    warmupRounds,
    coreRounds,
    sprintRounds,
  };
}

export const Preview: React.FC = () => {
  const { compiled, totalDuration, startPlaying, compilationDone, reset } = useAppStore();
  const prefs = loadPreferences();

  const [lockedActions, setLockedActions] = useState<Map<number, string>>(new Map());
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  if (!compiled) return null;
  const stats = compiled.stats;

  const updateTimeline = useCallback((newTimeline: TimelineItem[]) => {
    const nextStats = computeStats(newTimeline);
    compilationDone({ ...compiled, timeline: newTimeline, stats: nextStats });
  }, [compiled, compilationDone]);

  const handleStart = useCallback(() => {
    startPlaying();
  }, [startPlaying]);

  const handleRecompile = useCallback(() => {
    const totalMs = totalDuration * 1000;
    const newSeq = compileSequence(totalMs, prefs, lockedActions);
    compilationDone(newSeq);
    setExpandedIdx(null);
  }, [compilationDone, totalDuration, prefs, lockedActions]);

  const handleReset = useCallback(() => {
    reset();
  }, [reset]);

  const toggleLock = useCallback((actionIdx: number, name: string) => {
    setLockedActions(prev => {
      const next = new Map(prev);
      if (next.get(actionIdx) === name) {
        next.delete(actionIdx);
      } else {
        next.set(actionIdx, name);
      }
      return next;
    });
  }, []);

  const handleFieldChange = useCallback((index: number, field: string, value: any) => {
    const nextTimeline = compiled.timeline.map((item, idx) => {
      if (idx !== index) return item;
      return { ...item, [field]: value };
    });
    updateTimeline(nextTimeline as TimelineItem[]);
  }, [compiled, updateTimeline]);

  const deleteItem = useCallback((index: number) => {
    const nextTimeline = compiled.timeline.filter((_, idx) => idx !== index);
    updateTimeline(nextTimeline);
    setExpandedIdx(null);
  }, [compiled, updateTimeline]);

  const moveItem = useCallback((index: number, direction: 'up' | 'down') => {
    const nextTimeline = [...compiled.timeline];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= nextTimeline.length) return;

    // Swap
    const temp = nextTimeline[index];
    nextTimeline[index] = nextTimeline[targetIndex];
    nextTimeline[targetIndex] = temp;

    updateTimeline(nextTimeline);
    setExpandedIdx(targetIndex);
  }, [compiled, updateTimeline]);

  const addItem = useCallback((type: 'action' | 'rest' | 'transition') => {
    const nextTimeline = [...compiled.timeline];
    // Find the end marker to insert before it
    const endIdx = nextTimeline.findIndex(item => item.type === 'end');

    let newItem: TimelineItem;
    if (type === 'action') {
      newItem = {
        type: 'action',
        name: '指腹摩擦',
        duration: 30000,
        bpm: 80,
        sound: 'woodblock',
        volume: 0.8,
        phase: 'core',
        pan: 0,
      };
    } else if (type === 'rest') {
      newItem = {
        type: 'rest',
        duration: 15000,
        phase: 'core',
      };
    } else {
      newItem = {
        type: 'transition',
        signal: 'single_ding',
        phase: 'core',
      };
    }

    if (endIdx !== -1) {
      nextTimeline.splice(endIdx, 0, newItem);
    } else {
      nextTimeline.push(newItem);
    }

    updateTimeline(nextTimeline);
    // Expand the newly added item (placed right before 'end')
    const newIdx = endIdx !== -1 ? endIdx : nextTimeline.length - 1;
    setExpandedIdx(newIdx);
  }, [compiled, updateTimeline]);

  return (
    <div className="page preview-page">
      <h2>编排预览</h2>

      {/* 统计概览 */}
      <div className="stats-grid">
        <div className="glass-card stat-item">
          <span className="stat-number">{formatMs(stats.totalDuration)}</span>
          <span className="stat-label">总时长</span>
        </div>
        <div className="glass-card stat-item">
          <span className="stat-number">{formatMs(stats.totalActionDuration)}</span>
          <span className="stat-label">动作总时长</span>
        </div>
        <div className="glass-card stat-item">
          <span className="stat-number">{formatMs(stats.totalRestDuration)}</span>
          <span className="stat-label">休息总时长</span>
        </div>
        <div className="glass-card stat-item">
          <span className="stat-number">{stats.rounds}</span>
          <span className="stat-label">总轮数</span>
        </div>
      </div>

      <div className="phase-summary">
        热身 {stats.warmupRounds} 轮 → 核心 {stats.coreRounds} 轮
        {stats.sprintRounds > 0 && ` → 冲刺 ${stats.sprintRounds} 轮`}
      </div>

      {/* 可编辑序列列表 */}
      <div className="sequence-scroll">
        {compiled.timeline.map((item, index) => {
          if (item.type === 'end') return null;

          const isExpanded = expandedIdx === index;

          return (
            <div
              key={index}
              className={`edit-action-row ${
                item.type === 'rest'
                  ? 'rest-row'
                  : item.type === 'transition'
                  ? 'transition-row'
                  : ''
              }`}
              style={item.type === 'transition' ? { background: 'rgba(255,255,255,0.02)', borderLeft: '3px solid var(--accent)' } : undefined}
            >
              <div className="edit-action-main">
                {item.type === 'rest' ? (
                  <>
                    <span className="lock-btn" style={{ visibility: 'hidden' }}>🔓</span>
                    <span className="edit-action-name rest-name">⏳ 休息阶段</span>
                    <span className="edit-action-dur">{Math.round(item.duration / 1000)}s</span>
                    <button
                      className="edit-expand-btn"
                      onClick={() => setExpandedIdx(isExpanded ? null : index)}
                    >
                      {isExpanded ? '▲ 编辑' : '▼ 编辑'}
                    </button>
                  </>
                ) : item.type === 'transition' ? (
                  <>
                    <span className="lock-btn" style={{ visibility: 'hidden' }}>🔓</span>
                    <span className="edit-action-name" style={{ color: 'var(--accent)', fontWeight: 500 }}>
                      🔔 过渡信号: {item.signal === 'single_ding' ? '单音叮' : item.signal === 'double_ding' ? '双音叮' : '重音鼓'}
                    </span>
                    <span className="edit-action-dur" style={{ visibility: 'hidden' }}>0s</span>
                    <button
                      className="edit-expand-btn"
                      onClick={() => setExpandedIdx(isExpanded ? null : index)}
                    >
                      {isExpanded ? '▲ 编辑' : '▼ 编辑'}
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      className={`lock-btn ${lockedActions.get(index) === item.name ? 'locked' : ''}`}
                      onClick={() => toggleLock(index, item.name)}
                      title={lockedActions.get(index) === item.name ? '已锁定（重新编排不变）' : '点击锁定此动作'}
                    >
                      {lockedActions.get(index) === item.name ? '🔒' : '🔓'}
                    </button>
                    <span className="edit-action-name">⚙️ {item.name}</span>
                    <span className="edit-action-pan" style={{ marginRight: 8 }}>{PAN_LABELS[String(item.pan)] ?? '🎧'}</span>
                    <span className="edit-action-bpm" style={{ fontSize: 11, background: 'rgba(255,255,255,0.05)', padding: '2px 6px', borderRadius: 4, marginRight: 8 }}>{item.bpm} BPM</span>
                    <span className="edit-action-dur">{Math.round(item.duration / 1000)}s</span>
                    <button
                      className="edit-expand-btn"
                      onClick={() => setExpandedIdx(isExpanded ? null : index)}
                    >
                      {isExpanded ? '▲ 编辑' : '▼ 编辑'}
                    </button>
                  </>
                )}
              </div>

              {isExpanded && (
                <div className="edit-action-options" style={{ display: 'flex', flexDirection: 'column', gap: '10px', background: 'rgba(0,0,0,0.2)', padding: '12px', borderRadius: '8px', margin: '4px 10px 10px 10px' }}>
                  {item.type === 'action' && (
                    <>
                      {/* 动作名称 */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <span className="replace-label">动作名称：</span>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <select
                            className="duration-input"
                            style={{ flex: 1, height: '32px', textAlign: 'left', padding: '0 8px' }}
                            value={ALL_ACTION_NAMES.includes(item.name) ? item.name : 'custom'}
                            onChange={e => {
                              if (e.target.value === 'custom') {
                                handleFieldChange(index, 'name', '自定义动作');
                              } else {
                                handleFieldChange(index, 'name', e.target.value);
                              }
                            }}
                          >
                            {ALL_ACTION_NAMES.map(n => <option key={n} value={n}>{n}</option>)}
                            <option value="custom">✍️ 自定义名称...</option>
                          </select>
                          {!ALL_ACTION_NAMES.includes(item.name) && (
                            <input
                              type="text"
                              className="duration-input"
                              style={{ flex: 1, height: '32px' }}
                              value={item.name}
                              onChange={e => handleFieldChange(index, 'name', e.target.value)}
                              placeholder="自定义动作名称"
                            />
                          )}
                        </div>
                      </div>

                      {/* 节拍速度 & 音色 */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <span className="replace-label">节拍速度 (BPM)：</span>
                          <input
                            type="number"
                            className="duration-input"
                            style={{ width: '100%', height: '32px' }}
                            min={20}
                            max={240}
                            value={item.bpm}
                            onChange={e => handleFieldChange(index, 'bpm', parseInt(e.target.value) || 60)}
                          />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <span className="replace-label">合成音色：</span>
                          <select
                            className="duration-input"
                            style={{ width: '100%', height: '32px', padding: '0 8px', textAlign: 'left' }}
                            value={item.sound}
                            onChange={e => handleFieldChange(index, 'sound', e.target.value)}
                          >
                            {Object.entries(SOUND_LABELS).map(([k, v]) => (
                              <option key={k} value={k}>{v}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* 声道模式 */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <span className="replace-label">声道定位：</span>
                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                          {Object.entries(PAN_LABELS).map(([val, label]) => {
                            const isSelected = String(item.pan) === val;
                            return (
                              <button
                                key={val}
                                className={`replace-btn ${isSelected ? 'active' : ''}`}
                                style={{ padding: '6px 12px' }}
                                onClick={() => handleFieldChange(index, 'pan', val === 'alternating' ? 'alternating' : parseFloat(val))}
                              >
                                {label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </>
                  )}

                  {/* 过渡信号选择 */}
                  {item.type === 'transition' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <span className="replace-label">过渡信号音：</span>
                      <select
                        className="duration-input"
                        style={{ width: '100%', height: '32px', padding: '0 8px', textAlign: 'left' }}
                        value={item.signal}
                        onChange={e => handleFieldChange(index, 'signal', e.target.value)}
                      >
                        <option value="single_ding">🔔 单音叮 (single_ding)</option>
                        <option value="double_ding">🔔🔔 双音叮 (double_ding)</option>
                        <option value="heavy_beats">🥁 重音鼓点 (heavy_beats)</option>
                      </select>
                    </div>
                  )}

                  {/* 持续时长 (动作 & 休息) */}
                  {(item.type === 'action' || item.type === 'rest') && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <span className="replace-label">持续时长（秒）：</span>
                      <input
                        type="number"
                        className="duration-input"
                        style={{ width: '100%', height: '32px' }}
                        min={item.type === 'action' ? 5 : 1}
                        max={600}
                        value={Math.round(item.duration / 1000)}
                        onChange={e => handleFieldChange(index, 'duration', (parseInt(e.target.value) || 1) * 1000)}
                      />
                    </div>
                  )}

                  {/* 排序与删除操作 */}
                  <div style={{ display: 'flex', gap: '8px', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '10px', marginTop: '4px' }}>
                    <button
                      className="replace-btn"
                      style={{ flex: 1, padding: '8px' }}
                      disabled={index === 0}
                      onClick={() => moveItem(index, 'up')}
                    >
                      ▲ 上移
                    </button>
                    <button
                      className="replace-btn"
                      style={{ flex: 1, padding: '8px' }}
                      disabled={index === compiled.timeline.length - 2} // exclude 'end' which is at length - 1
                      onClick={() => moveItem(index, 'down')}
                    >
                      ▼ 下移
                    </button>
                    <button
                      className="replace-btn"
                      style={{ flex: 1, padding: '8px', background: 'rgba(233, 69, 96, 0.2)', color: '#e94560' }}
                      onClick={() => deleteItem(index)}
                    >
                      🗑️ 删除
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {/* 添加动作/休息/过渡的悬浮工具栏 */}
        <div style={{ display: 'flex', gap: '8px', padding: '12px', borderTop: '1px solid rgba(255,255,255,0.05)', background: 'rgba(255,255,255,0.01)' }}>
          <button className="replace-btn" style={{ flex: 1, padding: '10px 0', border: '1px dashed rgba(255,255,255,0.15)', background: 'none' }} onClick={() => addItem('action')}>
            ➕ 添加动作
          </button>
          <button className="replace-btn" style={{ flex: 1, padding: '10px 0', border: '1px dashed rgba(255,255,255,0.15)', background: 'none' }} onClick={() => addItem('rest')}>
            ➕ 添加休息
          </button>
          <button className="replace-btn" style={{ flex: 1, padding: '10px 0', border: '1px dashed rgba(255,255,255,0.15)', background: 'none' }} onClick={() => addItem('transition')}>
            ➕ 添加过渡信号
          </button>
        </div>
      </div>

      {/* 操作按钮 */}
      <div className="preview-actions">
        <button className="btn-primary btn-start" onClick={handleStart}>
          开始播放
        </button>
        <button className="btn-secondary btn-recompile" onClick={handleRecompile}>
          重新随机编排
        </button>
        <button className="btn-secondary btn-recompile" onClick={handleReset} style={{ flex: 'none', padding: '16px 16px', fontSize: 13 }}>
          放弃
        </button>
      </div>
    </div>
  );
};