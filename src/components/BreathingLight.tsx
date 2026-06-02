// ============================================================
// BreathingLight — 三层 SVG 羽化呼吸灯动画（静默着陆页）
// ============================================================
import React from 'react';

export const BreathingLight: React.FC = () => {
  return (
    <div className="breathing-container">
      <svg width="240" height="240" viewBox="0 0 240 240" className="breathing-svg">
        <defs>
          <filter id="blur-sm">
            <feGaussianBlur stdDeviation="20" />
          </filter>
          <filter id="blur-md">
            <feGaussianBlur stdDeviation="40" />
          </filter>
          <filter id="blur-lg">
            <feGaussianBlur stdDeviation="80" />
          </filter>

          <radialGradient id="breathGrad1">
            <stop offset="0%" stopColor="#7c3aed" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#7c3aed" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="breathGrad2">
            <stop offset="0%" stopColor="#ec4899" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#ec4899" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="breathGrad3">
            <stop offset="0%" stopColor="#ff6b35" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#ff6b35" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* 大模糊层 - 最外层漫射光 */}
        <circle cx="120" cy="120" r="80" fill="url(#breathGrad3)"
          filter="url(#blur-lg)" className="breath-layer breath-slow" />

        {/* 中模糊层 */}
        <circle cx="120" cy="120" r="60" fill="url(#breathGrad2)"
          filter="url(#blur-md)" className="breath-layer breath-medium" />

        {/* 小模糊层 - 核心光点 */}
        <circle cx="120" cy="120" r="40" fill="url(#breathGrad1)"
          filter="url(#blur-sm)" className="breath-layer breath-fast" />
      </svg>

      <p className="breathing-text">静默着陆中...</p>
      <p className="breathing-sub">呼吸放松，可随时结束</p>
    </div>
  );
};
