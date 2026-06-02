// ============================================================
// Footer — 页面底部静谧介绍
// ============================================================
import React from 'react';

export const Footer: React.FC = () => {
  return (
    <footer className="app-footer">
      <div className="footer-divider" />
      <p className="footer-desc">
        这是一款基于生理节奏模型的智能节拍引导工具。
        设定时长后，系统自动编排动作序列并按序播放节拍音与语音提示，
        全程无需触碰屏幕。
      </p>
      <div className="footer-features">
        <span>6 种合成音色</span>
        <span>·</span>
        <span>4 档速度自定义</span>
        <span>·</span>
        <span>动作语音引导</span>
        <span>·</span>
        <span>本地数据存储</span>
      </div>
      <p className="footer-note">
        页面包含：时长设定 · 编排预览 · 全自动播放 · 静默着陆
        <br />v3 · 进度条版
      </p>
    </footer>
  );
};
