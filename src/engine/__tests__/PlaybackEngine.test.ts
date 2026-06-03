// ============================================================
// PlaybackEngine — 单元测试（仅测试可导出的纯函数：mulberry32 / placeSnapIntoTrack）
// ============================================================
import { describe, it, expect } from 'vitest';
import { mulberry32, placeSnapIntoTrack } from '../PlaybackEngine';

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

describe('placeSnapIntoTrack', () => {
  it('should place snap samples at the correct offset', () => {
    const sr = 1000;
    const track = new Float32Array(5000);
    const snap = new Float32Array([1, 1, 1, 1, 1]);
    placeSnapIntoTrack(track, snap, 2.0, sr); // 在 2s 处
    // 前 2s 应为静音
    for (let i = 0; i < 2000; i++) expect(track[i]).toBe(0);
    // 2s-2.005s 应为 1
    for (let i = 2000; i < 2005; i++) expect(track[i]).toBe(1);
    // 之后应回到 0
    for (let i = 2005; i < 5000; i++) expect(track[i]).toBe(0);
  });

  it('should not crash for negative offset', () => {
    const track = new Float32Array(1000);
    const snap = new Float32Array([1]);
    placeSnapIntoTrack(track, snap, -1, 1000);
    // 全静音
    for (const v of track) expect(v).toBe(0);
  });

  it('should not crash for offset beyond buffer', () => {
    const track = new Float32Array(1000);
    const snap = new Float32Array([1]);
    placeSnapIntoTrack(track, snap, 5, 1000); // 5000 > 1000
    for (const v of track) expect(v).toBe(0);
  });

  it('should truncate snap that extends beyond buffer', () => {
    const sr = 1000;
    const track = new Float32Array(1000);
    const snap = new Float32Array(500).fill(0.5);
    placeSnapIntoTrack(track, snap, 0.9, sr); // offset 900, snap 500 → 超 1000
    for (let i = 900; i < 1000; i++) expect(track[i]).toBe(0.5);
    for (let i = 0; i < 900; i++) expect(track[i]).toBe(0);
  });

  it('should add (not overwrite) when called multiple times at the same offset', () => {
    const sr = 1000;
    const track = new Float32Array(100);
    const snap = new Float32Array([0.3, 0.3]);
    placeSnapIntoTrack(track, snap, 0, sr);
    placeSnapIntoTrack(track, snap, 0, sr);
    expect(track[0]).toBeCloseTo(0.6, 5);
    expect(track[1]).toBeCloseTo(0.6, 5);
  });
});
