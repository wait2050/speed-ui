// ============================================================
// 本地存储操作 — 所有键名前缀 rmg_
// ============================================================
import type {
  UserPreferences, HistoryEntry, Favorite,
  CompiledSequence, PlaybackProgress,
} from '../types';
import { DEFAULT_PREFERENCES } from '../types';

const PREFIX = 'rmg_';
const K_PREFS = `${PREFIX}preferences`;
const K_HISTORY = `${PREFIX}history`;
const K_FAVORITES = `${PREFIX}favorites`;
const K_PROGRESS = `${PREFIX}progress`;

// --- 偏好 ---
export function savePreferences(prefs: UserPreferences): void {
  localStorage.setItem(K_PREFS, JSON.stringify(prefs));
}

export function loadPreferences(): UserPreferences {
  try {
    const raw = localStorage.getItem(K_PREFS);
    if (raw) return JSON.parse(raw) as UserPreferences;
  } catch { /* ignore */ }
  return { ...DEFAULT_PREFERENCES };
}

// --- 历史 ---
export function saveHistory(entry: HistoryEntry): void {
  const history = loadHistory();
  history.unshift(entry);
  // 只保留最近20条
  if (history.length > 20) history.length = 20;
  localStorage.setItem(K_HISTORY, JSON.stringify(history));
}

export function loadHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(K_HISTORY);
    if (raw) return JSON.parse(raw) as HistoryEntry[];
  } catch { /* ignore */ }
  return [];
}

// --- 收藏 ---
export function saveFavorite(seq: CompiledSequence, label: string): void {
  const favs = loadFavorites();
  favs.push({
    id: `fav_${Date.now()}`,
    label,
    timestamp: Date.now(),
    sequence: seq,
  });
  localStorage.setItem(K_FAVORITES, JSON.stringify(favs));
}

export function loadFavorites(): Favorite[] {
  try {
    const raw = localStorage.getItem(K_FAVORITES);
    if (raw) return JSON.parse(raw) as Favorite[];
  } catch { /* ignore */ }
  return [];
}

export function removeFavorite(id: string): void {
  const favs = loadFavorites().filter(f => f.id !== id);
  localStorage.setItem(K_FAVORITES, JSON.stringify(favs));
}

// --- 播放进度（sessionStorage） ---
export function saveProgress(timeline: unknown[], elapsed: number): void {
  const progress: PlaybackProgress = {
    timeline: timeline as PlaybackProgress['timeline'],
    elapsed,
    savedAt: Date.now(),
  };
  sessionStorage.setItem(K_PROGRESS, JSON.stringify(progress));
}

export function loadProgress(): PlaybackProgress | null {
  try {
    const raw = sessionStorage.getItem(K_PROGRESS);
    if (!raw) return null;
    const progress = JSON.parse(raw) as PlaybackProgress;
    // 2小时内有效
    if (Date.now() - progress.savedAt > 2 * 60 * 60 * 1000) {
      sessionStorage.removeItem(K_PROGRESS);
      return null;
    }
    return progress;
  } catch {
    return null;
  }
}

export function clearProgress(): void {
  sessionStorage.removeItem(K_PROGRESS);
}

// --- 使用统计 ---
export interface UsageStats {
  totalSessions: number;
  totalDurationMs: number;
  topActions: { name: string; count: number }[];
  averageRating: number;
}

export function loadStats(): UsageStats | null {
  const history = loadHistory();
  if (history.length === 0) return null;

  let totalDurationMs = 0;
  let totalRating = 0;
  let ratedCount = 0;
  const actionCounts = new Map<string, number>();

  for (const entry of history) {
    totalDurationMs += entry.totalDuration * 1000;
    if (entry.rating) {
      totalRating += entry.rating;
      ratedCount++;
    }
    // Count actions
    const seen = new Set<string>();
    for (const item of entry.sequence.timeline) {
      if (item.type === 'action' && !seen.has(item.name)) {
        seen.add(item.name);
        actionCounts.set(item.name, (actionCounts.get(item.name) ?? 0) + 1);
      }
    }
  }

  const topActions = [...actionCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name, count]) => ({ name, count }));

  return {
    totalSessions: history.length,
    totalDurationMs,
    topActions,
    averageRating: ratedCount > 0 ? Math.round((totalRating / ratedCount) * 10) / 10 : 0,
  };
}
