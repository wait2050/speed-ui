// ============================================================
// Preview — 编排预览：统计 + 可编辑序列 + 开始按钮
// ============================================================
import React, { useMemo, useCallback, useState } from 'react';
import { useAppStore } from '../state/store';
import { compileSequence } from '../compiler/compiler';
import { loadPreferences } from '../storage';
import { formatMs } from '../utils/time';
import type { TimelineItem } from '../types';

/** 从 timeline 中提取动作+休息项及其序号 */
type PreviewItem = TimelineItem & { type: 'action' | 'rest' };
function extractItems(timeline: TimelineItem[]): { index: number; item: PreviewItem }[] {
  const result: { index: number; item: PreviewItem }[] = [];
  let idx = 0;
  for (const item of timeline) {
    if (item.type === 'action' || item.type === 'rest') {
      result.push({ index: idx, item });
      idx++;
    }
  }
  return result;
}

/** 将预览序号映射到 timeline 实际下标 */
function previewToTimelineIdx(timeline: TimelineItem[], previewIdx: number): number {
  let count = 0;
  for (let i = 0; i < timeline.length; i++) {
    if (timeline[i].type === 'action' || timeline[i].type === 'rest') {
      if (count === previewIdx) return i;
      count++;
    }
  }
  return -1;
}

/** 声道模式显示的标签 */
const PAN_LABELS: Record<string, string> = {
  '0': '🎧 双耳',
  '-1': '⬅ 左耳',
  '1': '➡ 右耳',
  'alternating': '🔀 交错',
};

const PAN_OPTIONS: { value: number | 'alternating'; label: string }[] = [
  { value: 0, label: '🎧 双耳' },
  { value: -1, label: '⬅ 左耳' },
  { value: 1, label: '➡ 右耳' },
  { value: 'alternating', label: '🔀 交错' },
];

export const Preview: React.FC = () => {
  const { compiled: _compiled, totalDuration, startPlaying, compilationDone, reset } = useAppStore();
  const compiled = _compiled!;
  const stats = compiled.stats;
  const prefs = loadPreferences();

  const [lockedActions, setLockedActions] = useState<Map<number, string>>(new Map());
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [panOverrides, setPanOverrides] = useState<Map<number, number | 'alternating'>>(new Map());

  const timelineItems = useMemo(() => extractItems(compiled.timeline), [compiled]);

  const handleStart = useCallback(() => {
    // 将 panOverrides 应用到 timeline 并写回 store
    const overrides = panOverrides;
    const hasOverrides = overrides.size > 0;
    if (hasOverrides) {
      const newTimeline = compiled.timeline.map((item, i) => {
        const previewIdx = (() => {
          let cnt = 0;
          for (let j = 0; j < i; j++) {
            if (compiled.timeline[j].type === 'action' || compiled.timeline[j].type === 'rest') cnt++;
          }
          return item.type === 'action' ? cnt : -1;
        })();
        if (item.type === 'action' && previewIdx >= 0 && overrides.has(previewIdx)) {
          return { ...item, pan: overrides.get(previewIdx)! };
        }
        return item;
      });
      compilationDone({ ...compiled, timeline: newTimeline });
    }
    startPlaying();
  }, [startPlaying, compiled, compilationDone, panOverrides]);

  const handleRecompile = useCallback(() => {
    // 重新编译，保留锁定
    const totalMs = totalDuration * 1000;
    const newSeq = compileSequence(totalMs, prefs, lockedActions);
    compilationDone(newSeq);
    setPanOverrides(new Map()); // 清空声道覆写（新 timeline 下标变了）
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

  const handleReplace = useCallback((actionIdx: number, newName: string) => {
    setLockedActions(prev => {
      const next = new Map(prev);
      next.set(actionIdx, newName);
      return next;
    });
    setExpandedIdx(null);
  }, []);

  const handlePanChange = useCallback((actionIdx: number, newPan: number | 'alternating') => {
    setPanOverrides(prev => {
      const next = new Map(prev);
      if (next.get(actionIdx) === newPan) {
        next.delete(actionIdx); // 点相同值 = 恢复默认
      } else {
        next.set(actionIdx, newPan);
      }
      return next;
    });
  }, []);

  // 可替换的动作池
  const allActionNames = [...new Set([
    ...timelineItems.filter(i => i.item.type === 'action').map(a => (a.item as TimelineItem & { type: 'action' }).name),
    '捏住并旋转', '提拉然后松手',
    '上下刮擦', '左右捏住然后松开',
    '指腹摩擦', '周围区域摩擦', '反复点按',
  ])];

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
        {timelineItems.map(({ index, item }) => {
          const act = item as TimelineItem & { type: 'action'; name: string; duration: number; pan: number | 'alternating' };
          const rst = item as TimelineItem & { type: 'rest'; duration: number };
          const isLocked = item.type === 'action' && lockedActions.get(index) === act.name;
          const isExpanded = expandedIdx === index;
          const currentPan = item.type === 'action'
            ? (panOverrides.has(index) ? panOverrides.get(index)! : (act.pan ?? 0))
            : 0;

          return (
            <div key={index} className={`edit-action-row ${item.type === 'rest' ? 'rest-row' : ''}`}>
              <div className="edit-action-main">
                {item.type === 'rest' ? (
                  <>
                    <span className="lock-btn" style={{ visibility: 'hidden' }}>🔓</span>
                    <span className="edit-action-name rest-name">休息</span>
                    <span className="edit-action-dur">{Math.round(rst.duration / 1000)}s</span>
                    <span className="edit-expand-btn" style={{ visibility: 'hidden' }}>▼</span>
                  </>
                ) : (
                  <>
                    <button
                      className={`lock-btn ${isLocked ? 'locked' : ''}`}
                      onClick={() => toggleLock(index, act.name)}
                      title={isLocked ? '已锁定（重新编排不变）' : '点击锁定此动作'}
                    >
                      {isLocked ? '🔒' : '🔓'}
                    </button>
                    <span className="edit-action-name">{act.name}</span>
                    <span className="edit-action-pan">{PAN_LABELS[String(currentPan)] ?? '🎧'}</span>
                    <span className="edit-action-dur">{Math.round(act.duration / 1000)}s</span>
                    <button
                      className="edit-expand-btn"
                      onClick={() => setExpandedIdx(isExpanded ? null : index)}
                    >
                      {isExpanded ? '▲' : '▼'}
                    </button>
                  </>
                )}
              </div>

              {isExpanded && item.type === 'action' && (
                <div className="edit-action-options">
                  <div className="replace-options">
                    <span className="replace-label">替换为：</span>
                    {allActionNames.filter(n => n !== act.name).slice(0, 6).map(name => (
                      <button
                        key={name}
                        className="replace-btn"
                        onClick={() => handleReplace(index, name)}
                      >
                        {name}
                      </button>
                    ))}
                  </div>
                  {/* 声道模式选择 */}
                  <div className="pan-options" style={{ marginTop: 8 }}>
                    <span className="replace-label">声道：</span>
                    {PAN_OPTIONS.map(opt => (
                      <button
                        key={String(opt.value)}
                        className={`replace-btn ${currentPan === opt.value ? 'active' : ''}`}
                        onClick={() => handlePanChange(index, opt.value)}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 操作按钮 */}
      <div className="preview-actions">
        <button className="btn-primary btn-start" onClick={handleStart}>
          开始
        </button>
        <button className="btn-secondary btn-recompile" onClick={handleRecompile}>
          重新编排（保留锁定）
        </button>
        <button className="btn-secondary btn-recompile" onClick={handleReset} style={{ flex: 'none', padding: '16px 16px', fontSize: 13 }}>
          放弃
        </button>
      </div>
    </div>
  );
};
