// ============================================================
// HistoryDetail — 历史详情全屏页：快感热力图 + AI 迭代指令
// ============================================================
import React, { useState, useMemo, useCallback } from 'react';
import { useAppStore } from '../state/store';
import { loadHistory } from '../storage';
import type { HistoryEntry, ExcitementPoint, Phase } from '../types';

const PHASE_LABELS: Record<Phase, string> = {
  warmup: '热身', core: '核心',
  sprint_start: '起冲', sprint_accel: '加速', sprint_peak: '顶峰',
  climax: '冲刺', afterglow: '余韵', cooldown: '收尾', landing: '着陆',
};

const PHASE_COLORS: Record<Phase, string> = {
  warmup: '#4fc3f7',
  core: '#7c4dff',
  sprint_start: '#e040fb',
  sprint_accel: '#ff4081',
  sprint_peak: '#ff1744',
  climax: '#ff6e40',
  afterglow: '#ffab40',
  cooldown: '#69f0ae',
  landing: '#b0bec5',
};

function formatMs(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

export const HistoryDetail: React.FC = () => {
  const { selectedHistoryId, reset } = useAppStore();
  const [tooltip, setTooltip] = useState<{ point: ExcitementPoint; x: number } | null>(null);
  const [copied, setCopied] = useState(false);

  const entry: HistoryEntry | null = useMemo(() => {
    if (!selectedHistoryId) return null;
    const all = loadHistory();
    return all.find((h) => h.id === selectedHistoryId) ?? null;
  }, [selectedHistoryId]);

  const excitementPoints = entry?.stats?.excitementPoints ?? [];
  const totalDurationMs = ((entry?.totalDuration ?? 0) * 1000) || (entry?.stats?.totalDuration ?? 1);

  const handlePointClick = useCallback((point: ExcitementPoint, e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).parentElement?.getBoundingClientRect();
    const x = rect ? e.clientX - rect.left : e.clientX;
    setTooltip((prev) => (prev?.point === point ? null : { point, x }));
  }, []);

  const handleBack = useCallback(() => {
    reset();
  }, [reset]);

  const handleLoadSequence = useCallback(() => {
    if (!entry) return;
    const { compilationDone } = useAppStore.getState();
    compilationDone(entry.sequence);
  }, [entry]);

  // 生成 AI 迭代指令
  const aiPrompt = useMemo(() => {
    if (!entry) return '';
    const durMin = Math.round((entry.totalDuration || 0) / 60);
    const pointsList = excitementPoints
      .map((p, i) => {
        const time = formatMs(p.elapsedMs);
        const phaseLabel = PHASE_LABELS[p.phase] ?? p.phase;
        return `${i + 1}. 在第 ${time} (${phaseLabel} - BPM ${p.bpm})，我对动作「${p.actionName}」感到极度兴奋。`;
      })
      .join('\n');

    return `你是一位资深的生理感官调频专家。这是我在《节奏按摩引导器 V3.0》中完成的一轮体验编排反馈：

---
【本次总体编排时间】：${durMin}分钟
【总轮次】：${entry.stats.rounds} 轮（热身 ${entry.stats.warmupRounds} + 核心 ${entry.stats.coreRounds} + 冲刺 ${entry.stats.sprintRounds}）
【我的极度兴奋打点反馈】：
${pointsList || '（本次无打点记录）'}
---

请根据敏感度唤醒循环与快感最强动作优先级规则，为我逆向定制迭代一版下一轮的黄金体验序列。
要求：
1. 缩短非兴奋动作在核心阶段的比例，将我极爽的动作比例上调 50% 出现；
2. 针对高 BPM 的冲刺加速段延长动作 15 秒；
3. 输出一份最适合我今日体验升级的定制化编排参数推荐。`;
  }, [entry, excitementPoints]);

  const handleCopyPrompt = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(aiPrompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // fallback
      const ta = document.createElement('textarea');
      ta.value = aiPrompt;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  }, [aiPrompt]);

  if (!entry) {
    return (
      <div className="page history-detail-page">
        <p style={{ color: '#8888aa' }}>未找到该历史记录</p>
        <button className="btn btn-back" onClick={handleBack}>返回首页</button>
      </div>
    );
  }

  return (
    <div className="page history-detail-page">
      {/* 头部信息 */}
      <div className="hd-header">
        <h2 className="hd-title">体验复盘</h2>
        <div className="hd-meta">
          <span>{new Date(entry.timestamp).toLocaleString('zh-CN')}</span>
          <span>·</span>
          <span>{Math.round(entry.totalDuration / 60)} 分钟</span>
          <span>·</span>
          <span>{entry.stats.rounds} 轮</span>
          {entry.rating && (
            <>
              <span>·</span>
              <span className="hd-rating">{'★'.repeat(entry.rating)}{'☆'.repeat(5 - entry.rating)}</span>
            </>
          )}
        </div>
      </div>

      {/* 阶段分布条 */}
      <div className="hd-phase-bar-section">
        <h3 className="hd-section-title">阶段分布</h3>
        <div className="hd-phase-bar">
          {entry.sequence.timeline
            .filter((item) => item.type === 'action' || item.type === 'rest')
            .map((item, i) => {
              const dur = (item.type === 'action' || item.type === 'rest') ? item.duration : 0;
              const pct = (dur / totalDurationMs) * 100;
              const phase = item.type === 'action' ? item.phase : (item.type === 'rest' ? item.phase : 'warmup');
              return (
                <div
                  key={i}
                  className="hd-phase-segment"
                  style={{
                    width: `${pct}%`,
                    backgroundColor: PHASE_COLORS[phase],
                    opacity: item.type === 'rest' ? 0.3 : 0.8,
                  }}
                  title={item.type === 'action' ? `${item.name} (${PHASE_LABELS[item.phase]})` : `休息 (${PHASE_LABELS[item.phase]})`}
                />
              );
            })}
        </div>
        <div className="hd-phase-legend">
          {(['warmup', 'core', 'sprint_start', 'climax', 'afterglow', 'cooldown'] as Phase[]).map((p) => (
            <div key={p} className="hd-legend-item">
              <span className="hd-legend-dot" style={{ backgroundColor: PHASE_COLORS[p] }} />
              <span>{PHASE_LABELS[p]}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 快感热力图 */}
      <div className="hd-heatmap-section">
        <h3 className="hd-section-title">
          快感热力图
          <span className="hd-point-count">
            {excitementPoints.length > 0 ? `${excitementPoints.length} 个极爽打点` : '暂无打点'}
          </span>
        </h3>
        <div className="hd-heatmap-container">
          {/* 渐变背景条 */}
          <div className="hd-heatmap-bar">
            <div className="hd-heatmap-gradient" />
            {/* 打点粒子 */}
            {excitementPoints.map((point, i) => {
              const pct = (point.elapsedMs / totalDurationMs) * 100;
              return (
                <div
                  key={i}
                  className="hd-particle"
                  style={{ left: `${pct}%` }}
                  onClick={(e) => handlePointClick(point, e)}
                >
                  <div className="hd-particle-glow" style={{ backgroundColor: PHASE_COLORS[point.phase] }} />
                  <div className="hd-particle-core" />
                </div>
              );
            })}
          </div>
          {/* 时间刻度 */}
          <div className="hd-heatmap-ticks">
            <span>00:00</span>
            <span>{formatMs(totalDurationMs * 0.25)}</span>
            <span>{formatMs(totalDurationMs * 0.5)}</span>
            <span>{formatMs(totalDurationMs * 0.75)}</span>
            <span>{formatMs(totalDurationMs)}</span>
          </div>
          {/* 悬浮气泡 */}
          {tooltip && (
            <div
              className="hd-tooltip"
              style={{ left: `${tooltip.x}px` }}
            >
              <div className="hd-tooltip-time">{formatMs(tooltip.point.elapsedMs)}</div>
              <div className="hd-tooltip-action">{tooltip.point.actionName}</div>
              <div className="hd-tooltip-meta">
                {PHASE_LABELS[tooltip.point.phase]} · BPM {tooltip.point.bpm}
              </div>
              <div className="hd-tooltip-badge">极爽 ⚡</div>
            </div>
          )}
        </div>
      </div>

      {/* 打点明细列表 */}
      {excitementPoints.length > 0 && (
        <div className="hd-points-list-section">
          <h3 className="hd-section-title">打点明细</h3>
          <div className="hd-points-list">
            {excitementPoints.map((point, i) => (
              <div key={i} className="hd-point-item">
                <div className="hd-point-index" style={{ backgroundColor: PHASE_COLORS[point.phase] }}>
                  {i + 1}
                </div>
                <div className="hd-point-info">
                  <span className="hd-point-name">{point.actionName}</span>
                  <span className="hd-point-detail">
                    {formatMs(point.elapsedMs)} · {PHASE_LABELS[point.phase]} · BPM {point.bpm}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* AI 迭代指令 */}
      <div className="hd-ai-section">
        <h3 className="hd-section-title">🤖 AI 优化指令</h3>
        <p className="hd-ai-desc">
          一键复制以下指令发送给 AI，获取基于本次体验数据定制的下一代编排方案。
        </p>
        <div className="hd-ai-prompt-box">
          <pre className="hd-ai-prompt-text">{aiPrompt}</pre>
        </div>
        <button
          className={`btn hd-copy-btn ${copied ? 'copied' : ''}`}
          onClick={handleCopyPrompt}
        >
          {copied ? '✅ 已复制到剪贴板' : '📋 复制 AI 迭代指令'}
        </button>
      </div>

      {/* 底部操作 */}
      <div className="hd-actions">
        <button className="btn btn-back" onClick={handleBack}>
          ◀ 返回首页
        </button>
        <button className="btn btn-load" onClick={handleLoadSequence}>
          🚀 加载此编排
        </button>
      </div>
    </div>
  );
};
