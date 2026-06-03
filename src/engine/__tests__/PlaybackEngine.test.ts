// ============================================================
// PlaybackEngine — 单元测试（仅测试可导出的纯函数：mulberry32）
// ============================================================
import { describe, it, expect } from 'vitest';
import { mulberry32 } from '../PlaybackEngine';

describe('mulberry32', () => {
  it('should produce deterministic sequence for the same seed', () => {
    const a = mulberry32(123);
    const b = mulberry32(123);
    for (let i = 0; i < 100; i++) {
      expect(a()).toBe(b());
    }
  });

  it('should produce different sequences for different seeds', () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    let sameCount = 0;
    for (let i = 0; i < 100; i++) {
      if (a() === b()) sameCount++;
    }
    // 几乎不可能 100 个都相同
    expect(sameCount).toBeLessThan(5);
  });

  it('should produce values in [0, 1)', () => {
    const rng = mulberry32(42);
    for (let i = 0; i < 1000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('should not get stuck in a single value', () => {
    const rng = mulberry32(0);
    const values = new Set<number>();
    for (let i = 0; i < 100; i++) values.add(rng());
    // 100 次内应该出现很多不同的值
    expect(values.size).toBeGreaterThan(80);
  });
});
