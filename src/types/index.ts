// ============================================================
// 节奏按摩引导器 · 核心类型定义
// ============================================================

// --- 6种合成音色 ---
export type SoundType =
  | 'tick'        // 经典嗒音
  | 'woodblock'   // 木鱼
  | 'heartbeat'   // 心跳
  | 'waterdrop'   // 水滴
  | 'fingertap'   // 指尖敲击
  | 'bassdrum';   // 低音鼓点

// --- 阶段枚举 ---
export type Phase =
  | 'warmup'         // 热身阶段
  | 'core'           // 核心阶段
  | 'sprint_start'   // 冲刺·起冲段
  | 'sprint_accel'   // 冲刺·加速段
  | 'sprint_peak'    // 冲刺·顶峰段
  | 'climax'         // 高潮冲刺期
  | 'afterglow'      // 高潮后持续
  | 'cooldown'       // 收尾段
  | 'landing';       // 静默着陆

// --- 速度档位 ---
export type SpeedTier = 'slow' | 'medium' | 'fast' | 'extreme';

// --- 动作数据结构 ---
export interface ActionDef {
  name: string;
  intensity: 1 | 2 | 3;   // 1=最强(可直接高潮) 2=次强 3=基础
  speedTier: SpeedTier;
  baseDuration: number;     // 秒
  floatRange: number;       // ±秒
}

// --- 时间线原子项 ---
export type TimelineItem =
  | {
      type: 'action';
      name: string;
      duration: number;     // 毫秒
      bpm: number;
      sound: SoundType;
      volume: number;       // 0-1
      phase: Phase;
    }
  | {
      type: 'rest';
      duration: number;     // 毫秒
      phase: Phase;
    }
  | {
      type: 'transition';
      signal: 'single_ding' | 'double_ding' | 'heavy_beats';
      phase: Phase;
    }
  | {
      type: 'snap';
      phase: Phase;
    }
  | {
      type: 'end';
    };

// --- 编译统计 ---
export interface ExcitementPoint {
  elapsedMs: number;
  actionName: string;
  phase: Phase;
  bpm: number;
}

export interface SequenceStats {
  totalDuration: number;        // 毫秒
  totalActionDuration: number;
  totalRestDuration: number;
  rounds: number;
  warmupRounds: number;
  coreRounds: number;
  sprintRounds: number;
  excitementPoints?: ExcitementPoint[];
}

// --- 编译结果 ---
export interface CompiledSequence {
  timeline: TimelineItem[];
  stats: SequenceStats;
}

// --- 阶段选项（用户可开关） ---
export type PhaseOption = 'warmup' | 'core' | 'sprint' | 'climax' | 'afterglow' | 'cooldown';

export interface PhaseConfig {
  enabled: Set<PhaseOption>;
}

export const DEFAULT_PHASE_CONFIG: PhaseConfig = {
  enabled: new Set<PhaseOption>(['warmup', 'core', 'sprint', 'climax', 'afterglow', 'cooldown']),
};

// --- 用户偏好 ---
export interface UserPreferences {
  defaultDuration: number;       // 秒
  customBpm: Record<SpeedTier, number>;
  customSounds: {
    slow: SoundType;
    medium: SoundType;
    fast: SoundType;
    extreme: SoundType;
    cooldown: SoundType;
  };
}

// --- 历史记录 ---
export interface HistoryEntry {
  id: string;
  timestamp: number;
  totalDuration: number;
  stats: SequenceStats;
  rating?: number;          // 1-5
  sequence: CompiledSequence;
}

// --- 收藏编排 ---
export interface Favorite {
  id: string;
  label: string;
  timestamp: number;
  sequence: CompiledSequence;
}

// --- 播放进度（sessionStorage） ---
export interface PlaybackProgress {
  timeline: TimelineItem[];
  elapsed: number;          // 毫秒
  savedAt: number;          // Date.now()
}

// --- 应用状态 ---
export type AppStatus =
  | 'IDLE'
  | 'COMPILING'
  | 'READY'
  | 'PLAYING'
  | 'PAUSED'
  | 'FINISHED'
  | 'HISTORY_DETAIL';

// --- 状态机 State ---
export interface AppState {
  status: AppStatus;
  compiled: CompiledSequence | null;
  totalDuration: number;       // 用户设定的秒数
}

// --- 状态机 Action ---
export type AppAction =
  | { type: 'SET_DURATION'; payload: number }
  | { type: 'START_COMPILING' }
  | { type: 'COMPILATION_DONE'; payload: CompiledSequence }
  | { type: 'START_PLAYING' }
  | { type: 'PAUSE' }
  | { type: 'RESUME' }
  | { type: 'PLAYBACK_FINISHED' }
  | { type: 'RESET' };

// --- 默认偏好 ---
export const DEFAULT_PREFERENCES: UserPreferences = {
  defaultDuration: 20 * 60, // 20分钟
  customBpm: {
    slow: 60,
    medium: 105,
    fast: 120,
    extreme: 135,
  },
  customSounds: {
    slow: 'woodblock',
    medium: 'heartbeat',
    fast: 'heartbeat',
    extreme: 'bassdrum',
    cooldown: 'tick',
  },
};
