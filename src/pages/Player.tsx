// ============================================================
// Player — 播放器：滑块 + 暂停/停止 + 兴奋打点/高潮冲刺
// ============================================================
import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { useAppStore, loadSnapCustomBuffer } from '../state/store';
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
  const { compiled, reset, subjectiveClimaxTriggered, setSubjectiveClimax, playbackFinished, addExcitementPoint, snapVolume, snapConfig } = useAppStore();
  const engineRef = useRef<PlaybackEngine | null>(null);
  const compiledRef = useRef(compiled);
  compiledRef.current = compiled;
  const snapConfigRef = useRef(snapConfig);
  snapConfigRef.current = snapConfig;

  useWakeLock(true);

  // ---- 显示状态 ----
  const [ds, setDs] = useState<EngineDisplayState>({
    actionName: '准备开始...', actionRemainingMs: 0,
    totalElapsedMs: 0, phase: 'warmup', isPaused: false,
  });

  // ---- 节拍脉冲 ----
  const [beatPulse, setBeatPulse] = useState(0);
  const beatRafRef = useRef<number>(0);

  // ---- SubjectiveSlider 滑块：左滑=兴奋打点，右滑=高潮/余韵 ----
  const [gestureIndicator, setGestureIndicator] = useState<{
    zone: 'left' | 'right';
    icon: string;
    label: string;
    triggered: boolean;
  } | null>(null);
  const [offsetX, setOffsetX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isExcited, setIsExcited] = useState(false);
  const touchStartX = useRef(0);
  const exciteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 手势标记（防滑动误触）
  const gestureHappened = useRef(false);

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

    engine.init().then(async () => {
      // 注入响指配置
      engine.setSnapConfig(snapConfigRef.current.counts);

      // 如果有自定义音源，先尝试解码
      if (snapConfigRef.current.sourceMode === 'custom') {
        const buf = loadSnapCustomBuffer();
        if (buf) {
          try {
            await engine.setSnapSourceFromArrayBuffer(buf);
          } catch (e) {
            console.warn('[Player] 自定义音源解码失败，使用默认', e);
          }
        }
      }

      engine.setSnapVolume(snapVolume / 100);
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
    }

    return () => {
      engine.destroy();
      engineRef.current = null;
      cancelAnimationFrame(beatRafRef.current);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- 监听外部音源切换事件（来自 Sidebar） ----
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as
        | { kind: 'custom'; arrayBuffer: ArrayBuffer; filename: string }
        | { kind: 'default' };
      const engine = engineRef.current;
      if (!engine) return;
      if (detail.kind === 'custom') {
        engine.setSnapSourceFromArrayBuffer(detail.arrayBuffer).catch(err => {
          console.warn('[Player] 自定义音源解码失败', err);
        });
      } else {
        engine.setSnapSource(null);
      }
    };
    window.addEventListener('rhythm:snapSource', handler);
    return () => window.removeEventListener('rhythm:snapSource', handler);
  }, []);

  // ---- 响指音量同步 ----
  useEffect(() => {
    engineRef.current?.setSnapVolume(snapVolume / 100);
  }, [snapVolume]);

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

  // ---- 核心操作 ----
  const togglePause = useCallback(() => {
    const e = engineRef.current; if (!e) return;
    if (e.isPaused) e.resume(); else e.pause();
    triggerHaptic([30, 50, 30]);
  }, []);

  const handleSeek = useCallback((ms: number) => {
    engineRef.current?.seek(ms);
  }, []);

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
  // SubjectiveSlider 拖拽：左滑兴奋打点，右滑高潮/余韵
  // ============================================================
  const handleSliderTouchStart = useCallback((e: React.TouchEvent) => {
    e.stopPropagation();
    touchStartX.current = e.touches[0].clientX;
    setIsDragging(true);
  }, []);

  const handleSliderTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging) return;
    const diffX = e.touches[0].clientX - touchStartX.current;
    setOffsetX(Math.max(-80, Math.min(80, diffX)));
  }, [isDragging]);

  const handleSliderTouchEnd = useCallback(() => {
    if (!isDragging) return;
    setIsDragging(false);
    gestureHappened.current = true;

    if (offsetX < -60) {
      // 左滑 → 兴奋打点（全阶段）
      recordExcitement();
      setIsExcited(true);
      triggerHaptic([20, 10, 20]);
      setGestureIndicator({ zone: 'left', icon: '⚡', label: '兴奋打点', triggered: true });
      if (exciteTimerRef.current) clearTimeout(exciteTimerRef.current);
      exciteTimerRef.current = setTimeout(() => setIsExcited(false), 800);
    } else if (offsetX > 60 && ds.phase !== 'warmup') {
      // 右滑 → 高潮/余韵（热身禁用）
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
    setTimeout(() => setGestureIndicator(null), 800);
    setOffsetX(0);
  }, [isDragging, ds.phase, offsetX, recordExcitement, setSubjectiveClimax]);

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
        setIsExcited(true);
        triggerHaptic([20, 10, 20]);
        setGestureIndicator({ zone: 'left', icon: '⚡', label: '兴奋打点', triggered: true });
        setTimeout(() => setGestureIndicator(null), 800);
        if (exciteTimerRef.current) clearTimeout(exciteTimerRef.current);
        exciteTimerRef.current = setTimeout(() => setIsExcited(false), 800);
      } else if (e.key === 'ArrowRight' && ds.phase !== 'warmup') {
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
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [ds.phase, recordExcitement, setSubjectiveClimax, togglePause]);

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
      className={`page player-page ${subjectiveClimaxTriggered || ds.phase === 'climax' ? 'climax-active' : ''} ${isExcited ? 'excited-flash' : ''}`}
      data-phase={ds.phase}
    >
      {/* 涟漪效果 */}
      {ripples.map(id => (
        <div key={id} className="excited-ripple" />
      ))}

      {/* 分屏手势指示器 */}
      {gestureIndicator && (
        <div className={`gesture-floating-indicator ${gestureIndicator.zone} ${gestureIndicator.triggered ? 'triggered' : ''}`}>
          <span className="gesture-floating-icon">{gestureIndicator.icon}</span>
          <span className="gesture-floating-label">{gestureIndicator.label}</span>
        </div>
      )}

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

      {/* SubjectiveSlider — 水平拖拽滑块 */}
      <div className="subjective-slider">
        <div className="slider-track-glow" />
        <div className="slider-label slider-label-left">⚡ 兴奋打点 (左滑/←)</div>
        <div
          className="slider-handle"
          style={{ transform: `translateX(${offsetX}px)` }}
          onTouchStart={handleSliderTouchStart}
          onTouchMove={handleSliderTouchMove}
          onTouchEnd={handleSliderTouchEnd}
        >
          <div className="slider-handle-inner" />
        </div>
        <div className="slider-label slider-label-right">
          {ds.phase === 'warmup'
            ? '🔒 热身中'
            : ds.phase === 'climax'
              ? '✨ 释放余韵 (右滑/→)'
              : '🔥 开启冲刺 (右滑/→)'}
        </div>
      </div>

      {/* 暂停 + 停止按钮 */}
      <div className="player-controls">
        <button className="btn btn-pause" onClick={togglePause}>
          {ds.isPaused ? '▶ 继续' : '⏸ 暂停'}
        </button>
        <button className="btn btn-stop" onClick={handleStop}>■ 停止</button>
      </div>

      {/* Onboarding 引导遮罩 */}
      {showOnboarding && (
        <div className="onboarding-overlay" onClick={handleOnboardingDoubleTap}>
          <div className="onboarding-content">
            <h2 className="onboarding-title">手势引导</h2>
            <div className="onboarding-gestures">
              <div className="onboarding-gesture left">
                <div className="onboarding-gesture-icon">👈</div>
                <div className="onboarding-gesture-desc">
                  <strong>滑块左滑</strong>
                  <span>兴奋打点 ⚡</span>
                </div>
              </div>
              <div className="onboarding-gesture right">
                <div className="onboarding-gesture-icon">👉</div>
                <div className="onboarding-gesture-desc">
                  <strong>滑块右滑</strong>
                  <span>冲刺 / 余韵 🔥</span>
                </div>
              </div>
            </div>
            <div className="onboarding-center">
              <div className="onboarding-gesture-icon" style={{ fontSize: 32 }}>👆</div>
              <div className="onboarding-gesture-desc">
                <strong>单击屏幕</strong>
                <span>唤醒 / 查看控制器</span>
              </div>
            </div>
            <p className="onboarding-hint">现在双击任意位置开始</p>
          </div>
        </div>
      )}
    </div>
  );
};
