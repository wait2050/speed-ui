// ============================================================
// Timer — 圆形倒计时
// ============================================================
import React from 'react';
import { formatMs } from '../utils/time';

interface Props {
  remainingMs: number;
  totalMs: number;
}

export const Timer: React.FC<Props> = ({ remainingMs, totalMs }) => {
  const progress = totalMs > 0 ? Math.max(0, remainingMs / totalMs) : 0;
  const circumference = 2 * Math.PI * 90;
  const offset = circumference * (1 - progress);

  return (
    <div className="timer">
      <svg viewBox="0 0 200 200" className="timer-ring">
        <circle
          cx="100" cy="100" r="90"
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth="6"
        />
        <circle
          cx="100" cy="100" r="90"
          fill="none"
          stroke="var(--accent, #e94560)"
          strokeWidth="6"
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
