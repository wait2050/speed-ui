// ============================================================
// 全局状态 — Zustand store（轻量，无 Provider 嵌套）
// ============================================================
import { create } from 'zustand';
import type { AppStatus, CompiledSequence, ExcitementPoint } from '../types';

interface AppStore {
  status: AppStatus;
  compiled: CompiledSequence | null;
  totalDuration: number;
  subjectiveClimaxTriggered: boolean;
  selectedHistoryId: string | null;
  excitementPoints: ExcitementPoint[];
  setDuration: (d: number) => void;
  startCompiling: () => void;
  compilationDone: (seq: CompiledSequence) => void;
  startPlaying: () => void;
  playbackFinished: () => void;
  reset: () => void;
  setSubjectiveClimax: (triggered: boolean) => void;
  showHistoryDetail: (id: string) => void;
  addExcitementPoint: (point: ExcitementPoint) => void;
}

export const useAppStore = create<AppStore>((set) => ({
  status: 'IDLE',
  compiled: null,
  totalDuration: 20 * 60,
  subjectiveClimaxTriggered: false,
  selectedHistoryId: null,
  excitementPoints: [],

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
}));
