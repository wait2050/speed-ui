// ============================================================
// BreathingLight — 呼吸灯动画（静默着陆页）
// ============================================================
import React from 'react';

interface Props {
  onEnd?: () => void;
}

export const BreathingLight: React.FC<Props> = ({ onEnd }) => {
  return (
    <div className="breathing-container">
      <div className="breathing-circle" />
      <p className="breathing-text">静默着陆中...</p>
      <p className="breathing-sub">呼吸放松，可随时结束</p>
    </div>
  );
};
