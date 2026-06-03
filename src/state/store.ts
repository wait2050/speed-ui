// ============================================================
// 全局状态 — Zustand store（轻量，无 Provider 嵌套）
// ============================================================
import { create } from 'zustand';
import type { AppStatus, CompiledSequence, ExcitementPoint, Phase } from '../types';

export type SnapSourceMode = 'default' | 'custom';

export interface SnapConfig {
  counts: Record<Phase, number>;
  sourceMode: SnapSourceMode;
  customFilename?: string;  // 仅显示用途
}

export const DEFAULT_SNAP_COUNTS: Record<Phase, number> = {
  warmup: 0,
  core: 2,
  sprint_start: 1,
  sprint_accel: 1,
  sprint_peak: 1,
  climax: 2,
  afterglow: 1,
  cooldown: 0,
  landing: 0,
};

const SNAP_VOL_KEY = 'rhythm_snap_volume';
const SNAP_CFG_KEY = 'rhythm_snap_config';
const SNAP_B64_KEY = 'rhythm_snap_custom_b64_v1';

function loadSnapVol(): number {
  try { const v = localStorage.getItem(SNAP_VOL_KEY); return v !== null ? parseFloat(v) : 80; } catch { return 80; }
}

function loadSnapConfig(): SnapConfig {
  try {
    const raw = localStorage.getItem(SNAP_CFG_KEY);
    if (raw) return JSON.parse(raw) as SnapConfig;
  } catch { /* ignore */ }
  return {
    counts: { ...DEFAULT_SNAP_COUNTS },
    sourceMode: 'default',
  };
}

function saveSnapConfig(cfg: SnapConfig): void {
  try { localStorage.setItem(SNAP_CFG_KEY, JSON.stringify(cfg)); } catch { /* ignore */ }
}

interface AppStore {
  status: AppStatus;
  compiled: CompiledSequence | null;
  totalDuration: number;
  subjectiveClimaxTriggered: boolean;
  selectedHistoryId: string | null;
  excitementPoints: ExcitementPoint[];
  snapVolume: number;
  snapConfig: SnapConfig;
  setDuration: (d: number) => void;
  startCompiling: () => void;
  compilationDone: (seq: CompiledSequence) => void;
  startPlaying: () => void;
  playbackFinished: () => void;
  reset: () => void;
  setSubjectiveClimax: (triggered: boolean) => void;
  showHistoryDetail: (id: string) => void;
  addExcitementPoint: (point: ExcitementPoint) => void;
  setSnapVolume: (v: number) => void;
  setSnapCounts: (counts: Record<Phase, number>) => void;
  setSnapCustomUploaded: (filename: string) => void;
  resetSnapToDefault: () => void;
}

export const useAppStore = create<AppStore>((set) => ({
  status: 'IDLE',
  compiled: null,
  totalDuration: 20 * 60,
  subjectiveClimaxTriggered: false,
  selectedHistoryId: null,
  excitementPoints: [],
  snapVolume: loadSnapVol(),
  snapConfig: loadSnapConfig(),

  setDuration: (d) => set({ totalDuration: d }),
  startCompiling: () => set({ status: 'COMPILING' }),
  compilationDone: (seq) => set({ status: 'READY', compiled: seq, excitementPoints: [] }),
  startPlaying: () => set({ status: 'PLAYING' }),
  playbackFinished: () => set({ status: 'FINISHED' }),
  reset: () => set({ status: 'IDLE', compiled: null, totalDuration: 20 * 60, selectedHistoryId: null, subjectiveClimaxTriggered: false, excitementPoints: [] }),
  setSubjectiveClimax: (triggered) => set({ subjectiveClimaxTriggered: triggered }),
  showHistoryDetail: (id) => set({ status: 'HISTORY_DETAIL', selectedHistoryId: id }),
  addExcitementPoint: (point) => set((state) => ({
    excitementPoints: [...state.excitementPoints, point],
  })),
  setSnapVolume: (v) => {
    try { localStorage.setItem(SNAP_VOL_KEY, String(v)); } catch {}
    set({ snapVolume: v });
  },
  setSnapCounts: (counts) => {
    set((state) => {
      const next: SnapConfig = { ...state.snapConfig, counts: { ...counts } };
      saveSnapConfig(next);
      return { snapConfig: next };
    });
  },
  setSnapCustomUploaded: (filename) => {
    set((state) => {
      const next: SnapConfig = { ...state.snapConfig, sourceMode: 'custom', customFilename: filename };
      saveSnapConfig(next);
      return { snapConfig: next };
    });
  },
  resetSnapToDefault: () => {
    try { localStorage.removeItem(SNAP_B64_KEY); } catch { /* ignore */ }
    set((state) => {
      const next: SnapConfig = { counts: state.snapConfig.counts, sourceMode: 'default' };
      saveSnapConfig(next);
      return { snapConfig: next };
    });
  },
}));

// ---- 音源持久化辅助（base64 → localStorage ≤ 5MB） ----
const MAX_SNAP_BYTES = 5 * 1024 * 1024;

export async function uploadSnapFileToStorage(file: File): Promise<{ filename: string; arrayBuffer: ArrayBuffer }> {
  if (file.size > MAX_SNAP_BYTES) {
    throw new Error('文件过大，请限制 5MB 以内');
  }
  if (!file.type.startsWith('audio/')) {
    throw new Error('请上传音频文件');
  }
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)) as number[]);
  }
  const b64 = btoa(binary);
  try {
    localStorage.setItem(SNAP_B64_KEY, b64);
  } catch (e) {
    throw new Error('存储空间不足，请清理浏览器存储或使用更小的文件');
  }
  return { filename: file.name, arrayBuffer: buf };
}

export function loadSnapCustomBuffer(): ArrayBuffer | null {
  try {
    const b64 = localStorage.getItem(SNAP_B64_KEY);
    if (!b64) return null;
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
  } catch {
    return null;
  }
}
