// ============================================================
// 序列编译器 · 主函数
// ============================================================
import type {
  CompiledSequence, TimelineItem, SoundType,
  Phase, UserPreferences, SpeedTier,
} from '../types';
import {
  WARMUP_ACTION_MIN, WARMUP_ACTION_MAX, WARMUP_REST,
  CORE_ACTION_MIN, CORE_ACTION_MAX, CORE_REST,
  SPRINT_ACTION_MAX, SPRINT_REST, MICRO_REST,
  CLIMAX_DURATION, AFTERGLOW_DURATION, COOLDOWN_DURATION,
  MIN_RECOMMENDED_DURATION, TOTAL_TOLERANCE,
  WARMUP_RATIO, CORE_RATIO, SPRINT_RATIO,
  WARMUP_VOLUME, CORE_VOLUME, SPRINT_VOLUME,
  CLIMAX_VOLUME, AFTERGLOW_VOLUME, COOLDOWN_VOLUME,
  WARMUP_BPM, SPRINT_START_BPM, SPRINT_ACCEL_BPM,
  SPRINT_PEAK_BPM, CLIMAX_BPM, AFTERGLOW_BPM,
  COOLDOWN_INTERVAL,
} from './rules';
import {
  weightedPick, pickTop, pickBasic, ALL_ACTIONS, ACTION_POOLS,
} from './pools';

// --- 主编译函数 ---
export function compileSequence(
  totalDurationMs: number,
  prefs: UserPreferences,
  lockedActions?: Map<number, string>,
  phaseConfig?: import('../types').PhaseConfig,
  enabledActions?: Set<string>,
  climaxMin?: number,    // 高潮冲刺时长（分钟），默认3
  afterglowMin?: number, // 余韵时长（分钟），默认1
  snapCounts?: Record<string, number>, // 每阶段打响指次数
): CompiledSequence {
  const timeline: TimelineItem[] = [];
  const enabled = phaseConfig?.enabled ?? new Set(['warmup','core','sprint','climax','afterglow','cooldown'] as const);
  const has = (p: string) => enabled.has(p as any);

  const climaxMs = (climaxMin ?? 3) * 60 * 1000;
  const afterglowMs = (afterglowMin ?? 1) * 60 * 1000;

  // 过滤动作池
  const filterPool = <T extends { name: string }>(pool: T[]): T[] =>
    enabledActions ? pool.filter(a => enabledActions.has(a.name)) : pool;
  const pickWarmupFiltered = () => {
    const pool = filterPool([...ACTION_POOLS.warmup]);
    return pool[Math.floor(Math.random() * pool.length)] || ACTION_POOLS.warmup[0];
  };
  const pickTopFiltered = () => {
    const pool = filterPool([...ACTION_POOLS.top]);
    return pool[Math.floor(Math.random() * pool.length)] || ACTION_POOLS.top[0];
  };
  const weightedPickFiltered = () => {
    const all = filterPool([...ALL_ACTIONS]);
    if (all.length === 0) return ALL_ACTIONS[0];
    // 重用原 weightedPick 逻辑
    return weightedPick(all);
  };

  // 1. 终局序列固定时长（根据开关+用户设定计算）
  let FINALE_DURATION = 0;
  if (has('climax')) FINALE_DURATION += climaxMs;
  if (has('afterglow')) FINALE_DURATION += afterglowMs;
  if (has('cooldown')) FINALE_DURATION += COOLDOWN_DURATION;

  // 2. 短周期模式：<10分钟，仅热身+核心+终局，不单独分配冲刺
  const isShortMode = totalDurationMs < MIN_RECOMMENDED_DURATION;

  // 3. 剩余时长（分配给非终局阶段）
  const remaining = totalDurationMs - FINALE_DURATION;
  if (remaining <= 0) {
    throw new Error(`总时长过短（至少需要 ${Math.ceil(FINALE_DURATION / 60000)} 分钟）`);
  }

  // 4. 比例分配（跳过禁用阶段）
  let warmupBudget = 0, coreBudget = 0, sprintBudget = 0;
  const enabledMain = [has('warmup'), has('core'), has('sprint')];
  const enabledCount = enabledMain.filter(Boolean).length;

  if (enabledCount === 0) {
    // 没有前置阶段，直接跳到终局（下方会处理）
  } else if (isShortMode) {
    if (has('warmup')) warmupBudget = remaining * (has('core') ? 0.30 : 1);
    if (has('core')) coreBudget = remaining * (has('warmup') ? 0.70 : 1);
  } else {
    const ratios = [WARMUP_RATIO, CORE_RATIO, SPRINT_RATIO];
    const enabledRatios = [has('warmup') ? ratios[0] : 0, has('core') ? ratios[1] : 0, has('sprint') ? ratios[2] : 0];
    const totalRatio = enabledRatios.reduce((a, b) => a + b, 0);
    if (totalRatio > 0) {
      warmupBudget = remaining * (enabledRatios[0] / totalRatio);
      coreBudget = remaining * (enabledRatios[1] / totalRatio);
      sprintBudget = remaining * (enabledRatios[2] / totalRatio);
    }
  }

  const phaseMap = new Map<Phase, SoundType>();
  phaseMap.set('warmup', prefs.customSounds.slow);
  phaseMap.set('core', prefs.customSounds.slow);
  phaseMap.set('sprint_start', prefs.customSounds.medium);
  phaseMap.set('sprint_accel', prefs.customSounds.fast);
  phaseMap.set('sprint_peak', prefs.customSounds.extreme);
  phaseMap.set('climax', prefs.customSounds.extreme);
  phaseMap.set('afterglow', prefs.customSounds.fast);
  phaseMap.set('cooldown', prefs.customSounds.cooldown);

  let warmupRounds = 0;
  let coreRounds = 0;
  let sprintRounds = 0;
  let actionIndex = 0; // 全局动作序号，用于 lockedActions

  // 根据 lockedActions 获取指定动作（未锁定时从池中随机）
  function pickForStage<T extends { name: string }>(poolFn: () => T, defaultAction?: T): T {
    const locked = lockedActions?.get(actionIndex);
    actionIndex++;
    if (locked) {
      const found = ALL_ACTIONS.find(a => a.name === locked) as T | undefined;
      if (found) return found;
    }
    return (defaultAction ?? poolFn()) as T;
  }

  // ---- 热身阶段 ----
  if (has('warmup') && warmupBudget > 0) {
    let filled = 0;
    while (filled < warmupBudget) {
      const action = pickForStage(pickWarmupFiltered);
      const bpm = prefs.customBpm.slow;
      const dur = randInRange(WARMUP_ACTION_MIN, WARMUP_ACTION_MAX);
      timeline.push(makeAction(action.name, dur, bpm, prefs.customSounds.slow, WARMUP_VOLUME, 'warmup'));
      filled += dur;

      if (filled + WARMUP_REST <= warmupBudget || filled < warmupBudget - 5000) {
        timeline.push({ type: 'rest', duration: WARMUP_REST, phase: 'warmup' });
        filled += WARMUP_REST;
      }
      warmupRounds++;
    }
  }

  // 阶段切换信号: 热身→核心（两者都启用时才插入）
  if (has('warmup') && has('core') && warmupBudget > 0 && coreBudget > 0) {
    timeline.push({ type: 'transition', signal: 'single_ding', phase: 'core' });
  }

  // ---- 核心阶段 ----
  if (has('core') && coreBudget > 0) {
    let filled = 0;
    while (filled < coreBudget) {
      // 从全部动作池加权抽取（优先锁定动作）
      const action = pickForStage(weightedPickFiltered, weightedPickFiltered());

      const dur = randInRange(CORE_ACTION_MIN, CORE_ACTION_MAX);
      // 核心阶段音色：慢速用woodblock，快速用heartbeat
      const sound: SoundType = action.speedTier === 'slow'
        ? (prefs.customSounds.slow)
        : (prefs.customSounds.fast);
      const bpm = action.speedTier === 'slow'
        ? prefs.customBpm.slow
        : prefs.customBpm.fast;

      timeline.push(makeAction(action.name, dur, bpm, sound, CORE_VOLUME, 'core'));
      filled += dur;

      if (filled + CORE_REST <= coreBudget || filled < coreBudget - 5000) {
        timeline.push({ type: 'rest', duration: CORE_REST, phase: 'core' });
        filled += CORE_REST;
      }
      coreRounds++;
    }
  }

  // ---- 冲刺阶段 ----
  if (has('sprint') && !isShortMode && sprintBudget > 0) {
    // 阶段切换: 核心→冲刺（核心启用且冲刺启用时才插入）
    if (has('core') && coreBudget > 0) {
      timeline.push({ type: 'transition', signal: 'double_ding', phase: 'sprint_start' });
    }

    const third = sprintBudget / 3;

    // 起冲段
    {
      let filled = 0;
      while (filled < third) {
        const action = pickForStage(pickTopFiltered, pickTopFiltered());
        // 为休息预留空间
        const maxDur = third - filled - SPRINT_REST;
        const dur = maxDur > 20000
          ? Math.min(randInRange(SPRINT_ACTION_MAX - 10000, SPRINT_ACTION_MAX), maxDur)
          : maxDur;
        if (dur < 10000) break;
        timeline.push(makeAction(action.name, dur, SPRINT_START_BPM, prefs.customSounds.medium, SPRINT_VOLUME, 'sprint_start'));
        filled += dur;
        timeline.push({ type: 'rest', duration: SPRINT_REST, phase: 'sprint_start' });
        filled += SPRINT_REST;
        sprintRounds++;
      }
    }

    // 加速段
    {
      let filled = 0;
      while (filled < third) {
        const action = pickForStage(pickTopFiltered, pickTopFiltered());
        const maxDur = third - filled - SPRINT_REST;
        const dur = maxDur > 20000
          ? Math.min(randInRange(SPRINT_ACTION_MAX - 10000, SPRINT_ACTION_MAX), maxDur)
          : maxDur;
        if (dur < 10000) break;
        timeline.push(makeAction(action.name, dur, SPRINT_ACCEL_BPM, prefs.customSounds.fast, SPRINT_VOLUME, 'sprint_accel'));
        filled += dur;
        timeline.push({ type: 'rest', duration: SPRINT_REST, phase: 'sprint_accel' });
        filled += SPRINT_REST;
        sprintRounds++;
      }
    }

    // 顶峰段（每60秒动作时间插入8秒微休息）
    {
      let filled = 0;
      let actionAccum = 0; // 累计动作时间，用于判断何时插入微休息
      while (filled < third) {
        const action = pickForStage(pickTopFiltered, pickTopFiltered());
        const remaining = third - filled;
        // 动作不超过60秒，且不超过剩余空间
        const maxDur = Math.min(SPRINT_ACTION_MAX, remaining - MICRO_REST);
        const dur = maxDur > 20000
          ? Math.min(randInRange(30000, maxDur), maxDur)
          : maxDur;
        if (dur < 10000) break;
        timeline.push(makeAction(action.name, dur, SPRINT_PEAK_BPM, prefs.customSounds.extreme, SPRINT_VOLUME, 'sprint_peak'));
        filled += dur;
        actionAccum += dur;

        // 累计动作时间超过60秒时插入8秒微休息
        if (actionAccum >= 60000) {
          actionAccum = 0;
          if (third - filled > MICRO_REST + 5000) {
            timeline.push({ type: 'rest', duration: MICRO_REST, phase: 'sprint_peak' });
            filled += MICRO_REST;
          }
        }
        sprintRounds++;
      }
    }

    // 顶峰→高潮：先休息15s，再给信号
    if (has('climax')) {
      timeline.push({ type: 'rest', duration: SPRINT_REST, phase: 'sprint_peak' });
      timeline.push({ type: 'transition', signal: 'heavy_beats', phase: 'climax' });
    }
  } else if (isShortMode && has('climax')) {
    // 短周期：核心→高潮
    timeline.push({ type: 'transition', signal: 'double_ding', phase: 'climax' });
  }

  // ---- 终局序列 ----
  // 高潮冲刺
  if (has('climax')) {
    const climaxAction = pickTopFiltered();
    timeline.push(makeAction(climaxAction.name, climaxMs, prefs.customBpm.extreme, prefs.customSounds.extreme, CLIMAX_VOLUME, 'climax'));
  }

  // 高潮后持续
  if (has('afterglow')) {
    const afterglowAction = pickTopFiltered();
    timeline.push(makeAction(afterglowAction.name, afterglowMs, prefs.customBpm.fast, prefs.customSounds.fast, AFTERGLOW_VOLUME, 'afterglow'));
  }

  // 收尾段（每3秒一个单音）
  if (has('cooldown')) {
    timeline.push(makeAction('收尾缓冲', COOLDOWN_DURATION, Math.round(60000 / COOLDOWN_INTERVAL), prefs.customSounds.cooldown, COOLDOWN_VOLUME, 'cooldown'));
  }

  // 结束标记
  timeline.push({ type: 'end' });

  // ---- 插入打响指（仅非热身阶段）----
  if (snapCounts) {
    insertSnaps(timeline, snapCounts);
  }

  // ---- 计算统计 ----
  const stats = computeStats(timeline, warmupRounds, coreRounds, sprintRounds);

  return { timeline, stats };
}

// --- 打响指插入 ---

function insertSnaps(timeline: TimelineItem[], snapCounts: Record<string, number>): void {
  // 收集每个阶段中动作段的时间范围
  const phaseActions: Map<string, { startIdx: number; endIdx: number; startMs: number; endMs: number }[]> = new Map();

  let acc = 0;
  let phaseStartIdx = -1;
  let phaseStartMs = 0;
  let currentPhase = '';

  for (let i = 0; i < timeline.length; i++) {
    const item = timeline[i];
    if (item.type === 'end') break;

    if (item.type === 'action') {
      if (item.phase !== currentPhase) {
        // 保存上一个阶段
        if (currentPhase && phaseStartIdx >= 0) {
          const list = phaseActions.get(currentPhase) ?? [];
          list.push({ startIdx: phaseStartIdx, endIdx: i - 1, startMs: phaseStartMs, endMs: acc });
          phaseActions.set(currentPhase, list);
        }
        currentPhase = item.phase;
        phaseStartIdx = i;
        phaseStartMs = acc;
      }
    }

    if (item.type === 'action' || item.type === 'rest') {
      acc += item.duration;
    }
  }

  // 最后一个阶段
  if (currentPhase && phaseStartIdx >= 0) {
    const list = phaseActions.get(currentPhase) ?? [];
    list.push({ startIdx: phaseStartIdx, endIdx: timeline.length - 1, startMs: phaseStartMs, endMs: acc });
    phaseActions.set(currentPhase, list);
  }

  // 插入打响指
  const insertions: { idx: number; phase: string }[] = [];

  for (const [phase, count] of Object.entries(snapCounts)) {
    if (phase === 'warmup' || count <= 0) continue; // 热身不插入
    const segments = phaseActions.get(phase);
    if (!segments || segments.length === 0) continue;

    // 收集该阶段所有 action item 的索引和相对时间
    const actionItems: { idx: number; relMs: number }[] = [];
    for (const seg of segments) {
      let rel = seg.startMs;
      for (let i = seg.startIdx; i <= seg.endIdx; i++) {
        const item = timeline[i];
        if (item.type === 'action') {
          actionItems.push({ idx: i, relMs: rel });
        }
        if (item.type === 'action' || item.type === 'rest') {
          rel += item.duration;
        }
      }
    }

    if (actionItems.length === 0) continue;

    // 均匀随机选点（带抖动）
    const totalActionMs = segments.reduce((s, seg) => s + (seg.endMs - seg.startMs), 0);
    if (totalActionMs <= 0) continue;
    for (let n = 0; n < count; n++) {
      const t = (totalActionMs / (count + 1)) * (n + 1) + (Math.random() - 0.5) * (totalActionMs / (count + 1)) * 0.5;
      // 找到 t 落在哪个 action item 处
      let bestIdx = actionItems[actionItems.length - 1]?.idx;
      for (const ai of actionItems) {
        if (ai.relMs >= t) {
          bestIdx = ai.idx;
          break;
        }
      }
      if (bestIdx !== undefined) {
        insertions.push({ idx: bestIdx + 1, phase });
      }
    }
  }

  // 从后往前插入，避免索引错乱
  insertions.sort((a, b) => b.idx - a.idx);
  for (const ins of insertions) {
    timeline.splice(ins.idx, 0, { type: 'snap', phase: ins.phase as any });
  }
}

// --- 辅助函数 ---

function makeAction(
  name: string,
  durationMs: number,
  bpm: number,
  sound: SoundType,
  volume: number,
  phase: Phase,
): TimelineItem {
  return {
    type: 'action',
    name,
    duration: durationMs,
    bpm,
    sound,
    volume,
    phase,
  };
}

function randInRange(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function computeStats(
  timeline: TimelineItem[],
  warmupRounds: number,
  coreRounds: number,
  sprintRounds: number,
) {
  let totalActionDuration = 0;
  let totalRestDuration = 0;
  let rounds = 0;

  for (const item of timeline) {
    if (item.type === 'action') {
      totalActionDuration += item.duration;
      rounds++;
    } else if (item.type === 'rest') {
      totalRestDuration += item.duration;
    }
  }

  return {
    totalDuration: totalActionDuration + totalRestDuration,
    totalActionDuration,
    totalRestDuration,
    rounds,
    warmupRounds,
    coreRounds,
    sprintRounds,
  };
}

// --- 验证函数 ---
export function validateSequence(seq: CompiledSequence, targetMs: number): string[] {
  const errors: string[] = [];
  const { timeline, stats } = seq;

  // 总时长误差
  const diff = Math.abs(stats.totalDuration - targetMs);
  if (diff > TOTAL_TOLERANCE) {
    errors.push(`总时长误差 ${diff}ms 超出容差 ${TOTAL_TOLERANCE}ms`);
  }

  // 动作-休息交替规则（高潮冲刺和余韵除外）
  let prevType: 'action' | 'rest' | null = null;
  let inClimaxOrAfter = false;

  for (const item of timeline) {
    if (item.type === 'end' || item.type === 'transition') {
      if (item.type === 'transition') prevType = null;
      continue;
    }

    // 跟踪是否在终局连续区
    if (item.type === 'action' && (item.phase === 'climax' || item.phase === 'afterglow')) {
      inClimaxOrAfter = true;
    } else if (item.type === 'action' && item.phase !== 'climax' && item.phase !== 'afterglow') {
      inClimaxOrAfter = false;
    }

    if (item.type === 'action') {
      if (prevType === 'action' && !inClimaxOrAfter && item.phase !== 'cooldown') {
        errors.push(`动作 ${item.name} 前未插入休息`);
      }
      // 动作时长范围
      if (item.phase === 'climax') {
        if (item.duration < CLIMAX_DURATION - TOTAL_TOLERANCE) {
          errors.push(`高潮冲刺时长 ${item.duration}ms 不足 3 分钟`);
        }
      } else if (item.phase !== 'afterglow') {
        if (item.duration < 30000 || item.duration > 90000) {
          errors.push(`动作 ${item.name} 时长 ${item.duration}ms 超出 30~90秒范围`);
        }
      }
      prevType = 'action';
    } else if (item.type === 'rest') {
      // 微休息是例外：可短至8秒
      const isMicroRest = item.duration <= MICRO_REST + 1000;
      if (!isMicroRest && (item.duration < 10000 || item.duration > 20000)) {
        errors.push(`休息时长 ${item.duration}ms 超出 10~20秒范围`);
      }
      prevType = 'rest';
    }
  }

  return errors;
}
