// ============================================================
// 防误触工具
// ============================================================

/** 阻止所有触摸事件 */
export function preventTouch(e: TouchEvent): void {
  e.preventDefault();
}

/** 为元素绑定防误触 */
export function lockTouch(el: HTMLElement): () => void {
  el.style.touchAction = 'none';
  el.addEventListener('touchstart', preventTouch, { passive: false });
  el.addEventListener('touchmove', preventTouch, { passive: false });

  // 返回解绑函数
  return () => {
    el.style.touchAction = '';
    el.removeEventListener('touchstart', preventTouch);
    el.removeEventListener('touchmove', preventTouch);
  };
}
