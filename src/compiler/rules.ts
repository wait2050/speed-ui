// ============================================================
// 约束规则常量
// ============================================================

// --- 通用约束 ---
export const ACTION_MIN = 30 * 1000;
export const ACTION_MAX = 90 * 1000;
export const REST_MIN = 10 * 1000;
export const REST_MAX = 20 * 1000;

// --- 热身阶段 ---
export const WARMUP_ACTION_MIN = 30 * 1000;
export const WARMUP_ACTION_MAX = 40 * 1000;
export const WARMUP_REST = 20 * 1000;

// --- 核心阶段 ---
export const CORE_ACTION_MIN = 35 * 1000;
export const CORE_ACTION_MAX = 90 * 1000;
export const CORE_REST = 15 * 1000;

// --- 冲刺阶段 ---
export const SPRINT_ACTION_MAX = 60 * 1000;
export const SPRINT_REST = 15 * 1000;
export const MICRO_REST = 8 * 1000;

// --- 终局序列 ---
export const CLIMAX_DURATION = 3 * 60 * 1000;   // 3分钟
export const AFTERGLOW_DURATION = 1 * 60 * 1000; // 1分钟
export const COOLDOWN_DURATION = 15 * 1000;       // 15秒

// --- 阈值 ---
export const MIN_RECOMMENDED_DURATION = 10 * 60 * 1000; // 10分钟
export const TOTAL_TOLERANCE = 5 * 1000;                  // ±5秒误差

// --- 阶段比例 ---
export const WARMUP_RATIO = 0.20;
export const CORE_RATIO = 0.60;
export const SPRINT_RATIO = 0.20;

// --- 音量 ---
export const WARMUP_VOLUME = 0.8;
export const CORE_VOLUME = 1.0;
export const SPRINT_VOLUME = 1.0;
export const CLIMAX_VOLUME = 1.0;
export const AFTERGLOW_VOLUME = 1.0;
export const COOLDOWN_VOLUME = 0.7;

// --- BPM ---
export const WARMUP_BPM = 60;
export const CORE_BPM_SLOW = 60;
export const CORE_BPM_FAST = 120;
export const SPRINT_START_BPM = 105;
export const SPRINT_ACCEL_BPM = 120;
export const SPRINT_PEAK_BPM = 135;
export const CLIMAX_BPM = 135;
export const AFTERGLOW_BPM = 120;
export const COOLDOWN_INTERVAL = 3 * 1000;  // 每3秒一个单音

// --- 最后10秒 BPM+2 ---
export const BPM_BOOST_DURATION = 10 * 1000;
export const BPM_BOOST_AMOUNT = 2;
