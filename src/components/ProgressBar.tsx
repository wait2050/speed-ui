// ============================================================
// ProgressBar — 阶段进度条，可点击跳转
// ============================================================
import React, { useMemo, useCallback } from 'react';
import type { PhaseSegment } from '../scheduler/segments';
import { formatProgress } from '../scheduler/segments';

interface Props {
  segments: PhaseSegment[];
  elapsedMs: number;
  totalMs: number;
  currentPhaseLabel: string;
  onSeek: (targetMs: number) => void;
}

export const ProgressBar: React.FC<Props> = ({
  segments,
  elapsedMs,
  totalMs,
  currentPhaseLabel,
  onSeek,
}) => {
  const progress = totalMs > 0 ? Math.min(100, (elapsedMs / totalMs) * 100) : 0;

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const targetMs = Math.round(ratio * totalMs);
      onSeek(targetMs);
    },
    [totalMs, onSeek]
  );

  return (
    <div className="progress-bar-container">
      <div className="progress-bar-track" onClick={handleClick}>
        {/* 阶段色块 */}
        {segments.map((seg, i) => {
          const left = totalMs > 0 ? (seg.startMs / totalMs) * 100 : 0;
          const width = totalMs > 0 ? ((seg.endMs - seg.startMs) / totalMs) * 100 : 0;
          return (
            <div
              key={i}
              className="progress-segment"
              style={{
                left: `${left}%`,
                width: `${Math.max(0.5, width)}%`,
                backgroundColor: seg.color,
              }}
              title={`${seg.label} ${formatProgress(seg.startMs)}–${formatProgress(seg.endMs)}`}
            />
          );
        })}

        {/* 播放头 */}
        <div
          className="progress-playhead"
          style={{ left: `${progress}%` }}
        />
      </div>

      {/* 时间标签 */}
      <div className="progress-labels">
        <span className="progress-elapsed">{formatProgress(elapsedMs)}</span>
        <span className="progress-phase-label">{currentPhaseLabel}</span>
        <span className="progress-total">{formatProgress(totalMs)}</span>
      </div>
    </div>
  );
};
