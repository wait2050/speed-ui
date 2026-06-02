// ============================================================
// useFullscreen — 播放时全屏
// ============================================================
import { useEffect } from 'react';

export function useFullscreen(active: boolean): void {
  useEffect(() => {
    if (!active) return;

    const el = document.documentElement;
    if (el.requestFullscreen && !document.fullscreenElement) {
      el.requestFullscreen().catch(() => {
        // 静默失败（可能需要用户手势）
      });
    }

    return () => {
      if (document.fullscreenElement && active) {
        document.exitFullscreen().catch(() => {});
      }
    };
  }, [active]);
}
