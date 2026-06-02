// ============================================================
// 从时间线计算阶段边界（供进度条使用）
// ============================================================
import type { TimelineItem, Phase } from '../types';

export interface PhaseSegment {
  phase: Phase;
  label: string;
  startMs: number;
  endMs: number;
  color: string;
}

const PHASE_COLORS: Record<Phase, string> = {
  warmup: '#4fc3f7',
  core: '#81c784',
  sprint_start: '#ffb74d',
  sprint_accel: '#ff8a65',
  sprint_peak: '#e57373',
  climax: '#e94560',
  afterglow: '#ce93d8',
  cooldown: '#90a4ae',
  landing: '#78909c',
};

const PHASE_LABELS: Record<Phase, string> = {
  warmup: '热身',
  core: '核心',
  sprint_start: '起冲',
  sprint_accel: '加速',
  sprint_peak: '顶峰',
  climax: '冲刺',
  afterglow: '余韵',
  cooldown: '收尾',
  landing: '着陆',
};

export function computePhaseSegments(timeline: TimelineItem[]): PhaseSegment[] {
  const segments: PhaseSegment[] = [];
  let accumulatedMs = 0;
  let currentPhase: Phase | null = null;
  let segmentStart = 0;

  for (const item of timeline) {
    if (item.type === 'end') break;
    if (item.type === 'transition') continue;

    const dur = item.type === 'action' || item.type === 'rest' ? item.duration : 0;
    const phase = item.phase;

    if (currentPhase !== phase) {
      // 结束上一个段
      if (currentPhase !== null) {
        segments.push({
          phase: currentPhase,
          label: PHASE_LABELS[currentPhase] ?? currentPhase,
          startMs: segmentStart,
          endMs: accumulatedMs,
          color: PHASE_COLORS[currentPhase] ?? '#666',
        });
      }
      currentPhase = phase;
      segmentStart = accumulatedMs;
    }
    accumulatedMs += dur;
  }

  // 最后一个段
  if (currentPhase !== null && accumulatedMs > segmentStart) {
    segments.push({
      phase: currentPhase,
      label: PHASE_LABELS[currentPhase] ?? currentPhase,
      startMs: segmentStart,
      endMs: accumulatedMs,
      color: PHASE_COLORS[currentPhase] ?? '#666',
    });
  }

  return segments;
}

/** 格式化毫秒为 m:ss */
export function formatProgress(ms: number): string {
  const totalSec = Math.max(0, Math.round(ms / 1000));
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}
