// ============================================================
// Timer — 圆形倒计时 + 渐变发光 + 节拍脉冲
// ============================================================
import React from 'react';
import { formatMs } from '../utils/time';

interface Props {
  remainingMs: number;
  totalMs: number;
  beatPulse?: number;
}

export const Timer: React.FC<Props> = ({ remainingMs, totalMs, beatPulse = 0 }) => {
  const progress = totalMs > 0 ? Math.max(0, remainingMs / totalMs) : 0;
  const circumference = 2 * Math.PI * 90;
  const offset = circumference * (1 - progress);

  const scale = 1 + beatPulse * 0.05;
  const glowBlur = 6 + beatPulse * 20;
  const glowOpacity = 0.3 + beatPulse * 0.5;

  return (
    <div className="timer" style={{
      transform: `scale(${scale})`,
      transition: beatPulse > 0.5 ? 'none' : 'transform 0.3s ease-out'
    }}>
      <svg viewBox="0 0 200 200" className="timer-ring">
        {/* SVG 渐变 + 滤镜定义 */}
        <defs>
          <linearGradient id="timerGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="var(--accent-start)" />
            <stop offset="100%" stopColor="var(--accent-end)" />
          </linearGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation={glowBlur} result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* 外圈发光 */}
        <circle cx="100" cy="100" r="92" fill="none"
          stroke={`rgba(168, 85, 247, ${glowOpacity})`}
          strokeWidth="2"
          filter="url(#glow)"
        />

        {/* 轨道 */}
        <circle cx="100" cy="100" r="90" fill="none"
          stroke="rgba(255,255,255,0.06)" strokeWidth="6" />

        {/* 进度弧 */}
        <circle cx="100" cy="100" r="90" fill="none"
          stroke="url(#timerGradient)" strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform="rotate(-90 100 100)"
          style={{ transition: 'stroke-dashoffset 0.3s linear' }}
        />
      </svg>
      <div className="timer-text">{formatMs(remainingMs)}</div>
    </div>
  );
};
