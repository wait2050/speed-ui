// ============================================================
// SequenceList — 编排序列预览
// ============================================================
import React from 'react';
import type { TimelineItem } from '../types';
import { formatMs } from '../utils/time';

interface Props {
  timeline: TimelineItem[];
}

const phaseLabels: Record<string, string> = {
  warmup: '热身',
  core: '核心',
  sprint_start: '冲刺·起冲',
  sprint_accel: '冲刺·加速',
  sprint_peak: '冲刺·顶峰',
  climax: '高潮冲刺',
  afterglow: '高潮后持续',
  cooldown: '收尾',
};

export const SequenceList: React.FC<Props> = ({ timeline }) => {
  return (
    <div className="sequence-list">
      {timeline.map((item, i) => {
        if (item.type === 'end') return null;
        if (item.type === 'transition') {
          return (
            <div key={i} className="seq-item seq-transition">
              <span className="seq-signal">
                {item.signal === 'single_ding' ? '🔔 阶段切换' :
                 item.signal === 'double_ding' ? '🔔🔔 进入冲刺' :
                 '🥁 高潮冲刺'}
              </span>
            </div>
          );
        }
        if (item.type === 'snap') {
          return (
            <div key={i} className="seq-item seq-snap">
              <span className="seq-label">👆 打响指</span>
              <span className="seq-phase" style={{ fontSize: 10, color: 'rgba(255,255,255,0.15)' }}>
                {phaseLabels[item.phase] ?? item.phase}
              </span>
            </div>
          );
        }
        const cls = item.type === 'action' ? 'seq-action' : 'seq-rest';
        const label = item.type === 'action' ? item.name : '休息';
        const dur = formatMs(item.duration);
        const phaseLabel = phaseLabels[item.phase] ?? item.phase;

        return (
          <div key={i} className={`seq-item ${cls}`}>
            <span className="seq-label">{label}</span>
            <span className="seq-meta">
              <span className="seq-phase">{phaseLabel}</span>
              <span className="seq-dur">{dur}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
};
