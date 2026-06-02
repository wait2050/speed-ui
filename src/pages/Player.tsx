// ============================================================
// Player — 沉浸播放器 · 三态系统 · 分屏手势 · 触觉反馈
// The Sanctuary — Breathing Space v3.0
// ============================================================
import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { useAppStore } from '../state/store';
import { Timer } from '../components/Timer';
import { ProgressBar } from '../components/ProgressBar';
import { PlaybackEngine } from '../engine/PlaybackEngine';
import type { EngineDisplayState } from '../engine/PlaybackEngine';
import { computePhaseSegments } from '../scheduler/segments';
import type { PhaseSegment } from '../scheduler/segments';
import { saveProgress, clearProgress } from '../storage';
import { audioEngine } from '../audio/engine';
import { useWakeLock } from '../hooks/useWakeLock';
import type { Phase } from '../types';

const PHASE_LABELS: Record<Phase, string> = {
  warmup: '热身', core: '核心',
  sprint_start: '起冲', sprint_accel: '加速', sprint_peak: '顶峰',
  climax: '冲刺', afterglow: '余韵', cooldown: '收尾', landing: '着陆',
};

type PlayerUIState = 'sleep' | 'wake';

/** 安全调用 navigator.vibrate，桌面端静默降级 */
function triggerHaptic(pattern: number | number[]) {
  if ('vibrate' in navigator) {
    try { navigator.vibrate(pattern); } catch {}
  }
}

// ============================================================
// Onboarding 首次引导检测
// ============================================================
const ONBOARDING_KEY = 'rhythm_player_onboarded_v4';
function hasCompletedOnboarding(): boolean {
  try { return localStorage.getItem(ONBOARDING_KEY) === '1'; } catch { return false; }
}
function markOnboardingComplete(): void {
  try { localStorage.setItem(ONBOARDING_KEY, '1'); } catch {}
}

// ============================================================
// 组件
// ============================================================
export const Player: React.FC = () => {
  const { compiled, reset, subjectiveClimaxTriggered, setSubjectiveClimax, playbackFinished, addExcitementPoint } = useAppStore();
  const engineRef = useRef<PlaybackEngine | null>(null);
  const compiledRef = useRef(compiled);
  compiledRef.current = compiled;

  useWakeLock(true);

  // ---- 显示状态 ----
  const [ds, setDs] = useState<EngineDisplayState>({
    actionName: '准备开始...', actionRemainingMs: 0,
    totalElapsedMs: 0, phase: 'warmup', isPaused: false,
  });

  // ---- 节拍脉冲 ----
  const [beatPulse, setBeatPulse] = useState(0);
  const beatRafRef = useRef<number>(0);

  // ---- 三态 UI（初始唤醒态，3 秒无操作后褪入息屏） ----
  const [uiState, setUiState] = useState<PlayerUIState>('wake');
  const wakeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [controlsOpacity, setControlsOpacity] = useState(0.5);

  // ---- 分屏手势：左=兴奋打点，右=高潮/余韵 ----
  const [gestureIndicator, setGestureIndicator] = useState<{
    zone: 'left' | 'right';
    icon: string;
    label: string;
    triggered: boolean;
  } | null>(null);
  const gestureStartY = useRef(0);
  const gestureActiveZone = useRef<'left' | 'right' | null>(null);
  const gestureTriggered = useRef(false); // 每次手势只触发一次

  // ---- 双击检测 ----
  const lastTapTime = useRef(0);
  const [showDoubleTapRipple, setShowDoubleTapRipple] = useState(false);

  // ---- 涟漪效果 ----
  const [ripples, setRipples] = useState<number[]>([]);

  // ---- Onboarding ----
  const [showOnboarding, setShowOnboarding] = useState(false);

  // ---- 启动引擎 ----
  useEffect(() => {
    const c = compiledRef.current;
    if (!c?.timeline?.length) {
      reset();
      return;
    }

    const engine = new PlaybackEngine();
    engineRef.current = engine;

    engine.init().then(() => {
      engine.setOnUpdate(setDs);
      engine.setOnFinished(playbackFinished);

      engine.setOnBeat(() => {
        setBeatPulse(1);
        const start = performance.now();
        const decay = (now: number) => {
          const elapsed = now - start;
          const value = Math.max(0, 1 - elapsed / 400);
          setBeatPulse(value);
          if (value > 0) beatRafRef.current = requestAnimationFrame(decay);
        };
        beatRafRef.current = requestAnimationFrame(decay);
      });

      engine.start(c.timeline);
    });

    // 检查是否需要新手引导
    if (!hasCompletedOnboarding()) {
      setShowOnboarding(true);
    } else {
      // 已过引导期：初始唤醒态，3 秒后自动褪入息屏
      wakeTimerRef.current = setTimeout(() => {
        setUiState('sleep');
        setControlsOpacity(0);
      }, 3000);
    }

    return () => {
      engine.destroy();
      engineRef.current = null;
      cancelAnimationFrame(beatRafRef.current);
      if (wakeTimerRef.current) clearTimeout(wakeTimerRef.current);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- 页面可见性 ----
  useEffect(() => {
    const onVis = () => {
      const e = engineRef.current;
      if (!e) return;
      if (document.hidden) e.pause(); else e.resume();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  // ---- 定期存进度 ----
  useEffect(() => {
    if (!compiled) return;
    const iv = setInterval(() => {
      const e = engineRef.current;
      if (e?.isRunning && !e.isPaused) {
        saveProgress(compiled.timeline, e.elapsed);
      }
    }, 5000);
    return () => clearInterval(iv);
  }, [compiled]);

  // ---- 唤醒自动褪去 ----
  const wakeUp = useCallback(() => {
    setUiState('wake');
    setControlsOpacity(0.5);
    if (wakeTimerRef.current) clearTimeout(wakeTimerRef.current);
    wakeTimerRef.current = setTimeout(() => {
      setUiState('sleep');
      setControlsOpacity(0);
    }, 3000);
  }, []);

  // 唤醒态下任何交互重置计时器
  const resetWakeTimer = useCallback(() => {
    if (uiState === 'wake') {
      if (wakeTimerRef.current) clearTimeout(wakeTimerRef.current);
      wakeTimerRef.current = setTimeout(() => {
        setUiState('sleep');
        setControlsOpacity(0);
      }, 3000);
    }
  }, [uiState]);

  // ---- 核心操作 ----
  const togglePause = useCallback(() => {
    const e = engineRef.current; if (!e) return;
    const wasPaused = e.isPaused;
    if (wasPaused) e.resume(); else e.pause();
    triggerHaptic([30, 50, 30]);
    // 双击水波纹
    setShowDoubleTapRipple(true);
    setTimeout(() => setShowDoubleTapRipple(false), 600);
    wakeUp();
  }, [wakeUp]);

  const handleSeek = useCallback((ms: number) => {
    engineRef.current?.seek(ms);
    resetWakeTimer();
  }, [resetWakeTimer]);

  const handleStop = useCallback(() => {
    engineRef.current?.destroy();
    reset();
    clearProgress();
    setSubjectiveClimax(false);
  }, [reset, setSubjectiveClimax]);

  // ---- 涟漪 ----
  const addRipple = useCallback(() => {
    const id = Date.now();
    setRipples(prev => [...prev, id]);
    setTimeout(() => setRipples(prev => prev.filter(r => r !== id)), 800);
  }, []);

  // ---- 记录兴奋点 ----
  const recordExcitement = useCallback(() => {
    engineRef.current?.recordExcitement(ds.actionName);
    const point = engineRef.current?.getLastExcitementPoint();
    if (point) addExcitementPoint(point);
    addRipple();
    audioEngine.playChimeSound();
  }, [ds.actionName, addExcitementPoint, addRipple]);

  // ============================================================
  // 分屏手势：左=兴奋打点，右=高潮/余韵（滑动≥30px触发）
  // ============================================================
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    const screenWidth = window.innerWidth;
    gestureActiveZone.current = touch.clientX < screenWidth / 2 ? 'left' : 'right';
    gestureStartY.current = touch.clientY;
    gestureTriggered.current = false;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const zone = gestureActiveZone.current;
    if (!zone || gestureTriggered.current) return;
    const touch = e.touches[0];
    const deltaY = Math.abs(touch.clientY - gestureStartY.current);
    if (deltaY < 30) return; // 阈值：滑动超过 30px 才触发

    gestureTriggered.current = true;

    if (zone === 'left') {
      // 左侧滑动 → 记录兴奋点
      recordExcitement();
      triggerHaptic([20, 10, 20]);
      setGestureIndicator({ zone: 'left', icon: '⚡', label: '兴奋打点', triggered: true });
    } else {
      // 右侧滑动 → 高潮/余韵
      if (ds.phase !== 'climax') {
        engineRef.current?.triggerSubjectiveClimax('捏住并旋转');
        setSubjectiveClimax(true);
        triggerHaptic([50, 30, 50, 30, 100]);
        setGestureIndicator({ zone: 'right', icon: '🔥', label: '冲刺', triggered: true });
      } else {
        engineRef.current?.triggerReleaseAfterglow('提拉然后松手');
        setSubjectiveClimax(false);
        triggerHaptic([30, 50, 30]);
        setGestureIndicator({ zone: 'right', icon: '✨', label: '余韵', triggered: true });
      }
    }

    resetWakeTimer();
  }, [ds.phase, recordExcitement, setSubjectiveClimax, resetWakeTimer]);

  // ---- 手势检测标记（防止滑动误触发单击） ----
  const gestureHappened = useRef(false);

  const handleTouchEnd = useCallback(() => {
    if (gestureActiveZone.current && gestureTriggered.current) {
      gestureHappened.current = true;
    }
    gestureActiveZone.current = null;
    gestureTriggered.current = false;
    // 延迟清除指示器
    setTimeout(() => setGestureIndicator(null), 800);
  }, []);

  // ---- 单击唤醒 / 双击暂停 ----
  const handleTap = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    // 如果刚发生了滑动手势，忽略此次单击
    if (gestureHappened.current) {
      gestureHappened.current = false;
      return;
    }
    const now = Date.now();
    if (now - lastTapTime.current < 350) {
      // 双击 → 播放/暂停
      togglePause();
      lastTapTime.current = 0;
    } else {
      // 单击 → 唤醒
      lastTapTime.current = now;
      wakeUp();
    }
  }, [togglePause, wakeUp]);

  // ---- Onboarding 处理 ----
  const handleOnboardingDoubleTap = useCallback(() => {
    markOnboardingComplete();
    setShowOnboarding(false);
    // 同时执行播放/暂停
    togglePause();
  }, [togglePause]);

  // ---- 键盘操作 ----
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === ' ') {
        e.preventDefault();
        togglePause();
      } else if (e.key === 'ArrowLeft') {
        recordExcitement();
        triggerHaptic([20, 10, 20]);
        setGestureIndicator({ zone: 'left', icon: '⚡', label: '兴奋打点', triggered: true });
        setTimeout(() => setGestureIndicator(null), 800);
      } else if (e.key === 'ArrowRight') {
        if (ds.phase !== 'climax') {
          engineRef.current?.triggerSubjectiveClimax('捏住并旋转');
          setSubjectiveClimax(true);
          triggerHaptic([50, 30, 50, 30, 100]);
          setGestureIndicator({ zone: 'right', icon: '🔥', label: '冲刺', triggered: true });
        } else {
          engineRef.current?.triggerReleaseAfterglow('提拉然后松手');
          setSubjectiveClimax(false);
          triggerHaptic([30, 50, 30]);
          setGestureIndicator({ zone: 'right', icon: '✨', label: '余韵', triggered: true });
        }
        setTimeout(() => setGestureIndicator(null), 800);
      }
      wakeUp();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [ds.phase, recordExcitement, setSubjectiveClimax, togglePause, wakeUp]);

  const segments: PhaseSegment[] = useMemo(
    () => compiled ? computePhaseSegments(compiled.timeline) : [],
    [compiled]
  );
  const totalMs = compiled?.stats?.totalDuration || 0;

  if (!compiled) {
    return <div className="page player-page"><p style={{ color: 'var(--text-secondary)' }}>加载失败</p></div>;
  }

  return (
    <div
      className={`page player-page ${subjectiveClimaxTriggered || ds.phase === 'climax' ? 'climax-active' : ''} ${uiState}`}
      data-phase={ds.phase}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onClick={handleTap}
    >
      {/* 息屏态边缘微光刻度线 */}
      <div className={`sleep-edge-glow ${uiState === 'sleep' ? 'visible' : ''}`} />

      {/* 涟漪效果 */}
      {ripples.map(id => (
        <div key={id} className="excited-ripple" />
      ))}

      {/* 双击水波纹 */}
      {showDoubleTapRipple && <div className="doubletap-ripple" />}

      {/* 分屏手势指示器 */}
      {gestureIndicator && (
        <div className={`gesture-floating-indicator ${gestureIndicator.zone} ${gestureIndicator.triggered ? 'triggered' : ''}`}>
          <span className="gesture-floating-icon">{gestureIndicator.icon}</span>
          <span className="gesture-floating-label">{gestureIndicator.label}</span>
        </div>
      )}

      {/* 控制层 — 50% 透明度唤醒态 */}
      <div className="player-controls-layer" style={{ opacity: controlsOpacity, pointerEvents: uiState === 'sleep' ? 'none' : 'auto' }}>
        <ProgressBar
          segments={segments}
          elapsedMs={ds.totalElapsedMs}
          totalMs={totalMs}
          currentPhaseLabel={PHASE_LABELS[ds.phase] ?? ds.phase}
          onSeek={handleSeek}
        />
        <div className="player-phase">{PHASE_LABELS[ds.phase] ?? ds.phase}</div>
        <div className="player-action-name">{ds.actionName}</div>
        <Timer remainingMs={ds.actionRemainingMs} totalMs={ds.actionRemainingMs || 60000} beatPulse={beatPulse} />

        <button className="btn-secondary btn-icon btn-stop-inline" onClick={handleStop}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <rect x="6" y="6" width="12" height="12" rx="2"/>
          </svg>
        </button>
      </div>

      {/* Onboarding 引导遮罩 */}
      {showOnboarding && (
        <div className="onboarding-overlay" onClick={handleOnboardingDoubleTap}>
          <div className="onboarding-content">
            <h2 className="onboarding-title">手势引导</h2>
            <div className="onboarding-gestures">
              <div className="onboarding-gesture left">
                <div className="onboarding-gesture-icon">👆</div>
                <div className="onboarding-gesture-desc">
                  <strong>左侧滑动</strong>
                  <span>兴奋打点 ⚡</span>
                </div>
                <div className="onboarding-arrow up-down">
                  <svg width="24" height="48" viewBox="0 0 24 48">
                    <line x1="12" y1="4" x2="12" y2="44" stroke="white" strokeWidth="1.5" strokeDasharray="4 3" opacity="0.6"/>
                    <polygon points="12,0 6,8 18,8" fill="white" opacity="0.8"/>
                    <polygon points="12,48 6,40 18,40" fill="white" opacity="0.8"/>
                  </svg>
                </div>
              </div>
              <div className="onboarding-gesture right">
                <div className="onboarding-gesture-icon">👆</div>
                <div className="onboarding-gesture-desc">
                  <strong>右侧滑动</strong>
                  <span>冲刺 / 余韵 🔥</span>
                </div>
                <div className="onboarding-arrow up-down">
                  <svg width="24" height="48" viewBox="0 0 24 48">
                    <line x1="12" y1="4" x2="12" y2="44" stroke="white" strokeWidth="1.5" strokeDasharray="4 3" opacity="0.6"/>
                    <polygon points="12,0 6,8 18,8" fill="white" opacity="0.8"/>
                    <polygon points="12,48 6,40 18,40" fill="white" opacity="0.8"/>
                  </svg>
                </div>
              </div>
            </div>
            <div className="onboarding-center">
              <div className="onboarding-gesture-icon" style={{ fontSize: 32 }}>👆👆</div>
              <div className="onboarding-gesture-desc">
                <strong>双击中央</strong>
                <span>播放 / 暂停 ⏯️</span>
              </div>
            </div>
            <p className="onboarding-hint">现在双击任意位置开始</p>
          </div>
        </div>
      )}
    </div>
  );
};
