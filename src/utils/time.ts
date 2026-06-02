// ============================================================
// 时间格式化工具
// ============================================================

export function formatMs(ms: number): string {
  const totalSec = Math.max(0, Math.round(ms / 1000));
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

export function formatSec(sec: number): string {
  return formatMs(sec * 1000);
}

export function bpmToInterval(bpm: number): number {
  return 60000 / bpm;
}
