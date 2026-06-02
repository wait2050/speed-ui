// ============================================================
// Player — 沉浸式播放页：渐变背景 + 手势覆盖层 + 锁定 + 节拍脉冲
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

/** 安全调用 navigator.vibrate，桌面端静默降级 */
function triggerHaptic(pattern: number | number[]) {
  if ('vibrate' in navigator) {
    try { navigator.vibrate(pattern); } catch {}
  }
}

export const Player: React.FC = () => {
  const { compiled, reset, subjectiveClimaxTriggered, setSubjectiveClimax, playbackFinished, addExcitementPoint } = useAppStore();
  const engineRef = useRef<PlaybackEngine | null>(null);
  const compiledRef = useRef(compiled);
  compiledRef.current = compiled;

  // 屏幕常亮（播放期间）
  useWakeLock(true);

  // 显示状态
  const [ds, setDs] = useState<EngineDisplayState>({
    actionName: '准备开始...', actionRemainingMs: 0,
    totalElapsedMs: 0, phase: 'warmup', isPaused: false,
  });

  // 节拍脉冲
  const [beatPulse, setBeatPulse] = useState(0);
  const beatRafRef = useRef<number>(0);

  // 手势状态
  const [gestureZone, setGestureZone] = useState<'left' | 'right' | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTapTime = useRef(0);

  // 锁定
  const [isLocked, setIsLocked] = useState(false);

  // 涟漪效果
  const [ripples, setRipples] = useState<number[]>([]);

  // 启动
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

      // 节拍回调
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

    return () => {
      engine.destroy();
      engineRef.current = null;
      cancelAnimationFrame(beatRafRef.current);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 暂停
  useEffect(() => {
    const onVis = () => {
      const e = engineRef.current;
      if (!e) return;
      if (document.hidden) e.pause(); else e.resume();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  // 定期存进度
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

  // 操作
  const togglePause = useCallback(() => {
    const e = engineRef.current; if (!e) return;
    e.isPaused ? e.resume() : e.pause();
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

  // 盲控
  const [isExcited, setIsExcited] = useState(false);
  const [offsetX, setOffsetX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const touchStartRef = useRef(0);
  const exciteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const addRipple = useCallback(() => {
    const id = Date.now();
    setRipples(prev => [...prev, id]);
    setTimeout(() => setRipples(prev => prev.filter(r => r !== id)), 800);
  }, []);

  const handleExcitement = useCallback(() => {
    engineRef.current?.recordExcitement(ds.actionName);
    const point = engineRef.current?.getLastExcitementPoint();
    if (point) addExcitementPoint(point);
    setIsExcited(true);
    addRipple();
    triggerHaptic([20, 10, 20]);
    audioEngine.playChimeSound();
    if (exciteTimerRef.current) clearTimeout(exciteTimerRef.current);
    exciteTimerRef.current = setTimeout(() => setIsExcited(false), 800);
  }, [ds.actionName, addExcitementPoint, addRipple]);

  const handleClimaxOrAfterglow = useCallback(() => {
    if (ds.phase !== 'climax') {
      engineRef.current?.triggerSubjectiveClimax('捏住并旋转');
      setSubjectiveClimax(true);
      triggerHaptic([50, 30, 50, 30, 100]);
    } else {
      engineRef.current?.triggerReleaseAfterglow('提拉然后松手');
      setSubjectiveClimax(false);
    }
  }, [ds.phase, setSubjectiveClimax]);

  // 触屏手势
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartRef.current = e.touches[0].clientX;
    setIsDragging(true);
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging) return;
    const currentX = e.touches[0].clientX;
    const diffX = currentX - touchStartRef.current;
    const maxDrag = 80;
    const clampedDiff = Math.max(-maxDrag, Math.min(maxDrag, diffX));
    setOffsetX(clampedDiff);
  }, [isDragging]);

  const handleTouchEnd = useCallback(() => {
    if (!isDragging) return;
    setIsDragging(false);
    if (offsetX < -60) {
      handleExcitement();
    } else if (offsetX > 60 && ds.phase !== 'warmup') {
      handleClimaxOrAfterglow();
    }
    setOffsetX(0);
  }, [isDragging, ds.phase, offsetX, handleExcitement, handleClimaxOrAfterglow]);

  // 全屏手势覆盖层
  const handleGestureStart = useCallback((e: React.TouchEvent) => {
    const x = e.touches[0].clientX;
    const screenWidth = window.innerWidth;
    setGestureZone(x < screenWidth / 2 ? 'left' : 'right');

    longPressTimer.current = setTimeout(() => {
      if (ds.phase !== 'climax') {
        engineRef.current?.triggerSubjectiveClimax('捏住并旋转');
        setSubjectiveClimax(true);
        triggerHaptic([50, 30, 50, 30, 100]);
      }
    }, 1500);
  }, [ds.phase, setSubjectiveClimax]);

  const handleGestureEnd = useCallback(() => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);

    const now = Date.now();
    if (now - lastTapTime.current < 300) {
      handleExcitement();
      lastTapTime.current = 0;
    } else {
      lastTapTime.current = now;
    }

    setGestureZone(null);
  }, [handleExcitement]);

  // 键盘操作
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        engineRef.current?.recordExcitement(ds.actionName);
        const point = engineRef.current?.getLastExcitementPoint();
        if (point) addExcitementPoint(point);
        setIsExcited(true);
        addRipple();
        triggerHaptic([20, 10, 20]);
        if (exciteTimerRef.current) clearTimeout(exciteTimerRef.current);
        exciteTimerRef.current = setTimeout(() => setIsExcited(false), 800);
      } else if (e.key === 'ArrowRight' && ds.phase !== 'warmup') {
        if (ds.phase !== 'climax') {
          engineRef.current?.triggerSubjectiveClimax('捏住并旋转');
          setSubjectiveClimax(true);
          triggerHaptic([50, 30, 50, 30, 100]);
        } else {
          engineRef.current?.triggerReleaseAfterglow('提拉然后松手');
          setSubjectiveClimax(false);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (exciteTimerRef.current) clearTimeout(exciteTimerRef.current);
    };
  }, [ds.phase, ds.actionName, setSubjectiveClimax, addExcitementPoint, addRipple]);

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
      className={`page player-page ${subjectiveClimaxTriggered || ds.phase === 'climax' ? 'climax-active' : ''}`}
      data-phase={ds.phase}
    >
      {/* 涟漪效果 */}
      {ripples.map(id => (
        <div key={id} className="excited-ripple" />
      ))}

      {/* 全屏手势覆盖层 */}
      <div
        className="gesture-overlay"
        onTouchStart={handleGestureStart}
        onTouchEnd={handleGestureEnd}
      >
        <div className={`gesture-indicator left ${gestureZone === 'left' ? 'visible' : ''}`}>
          <div className="gesture-bar" />
        </div>
        <div className={`gesture-indicator right ${gestureZone === 'right' ? 'visible' : ''}`}>
          <div className="gesture-bar" />
        </div>
      </div>

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

      {/* 滑轨 */}
      <div className="subjective-slider">
        <div className="slider-track-glow" />
        <div className="slider-label slider-label-left">⚡ 极度兴奋 (左滑/←)</div>
        <div
          className="slider-handle"
          style={{ transform: `translateX(${offsetX}px)` }}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <div className="slider-handle-inner" />
        </div>
        <div className="slider-label slider-label-right">
          {ds.phase === 'climax' ? '✨ 释放余韵 (右滑/→)' : '🔥 开启冲刺 (右滑/→)'}
        </div>
      </div>

      {/* 锁定按钮 */}
      <button
        className={`lock-toggle ${isLocked ? 'locked' : ''}`}
        onClick={() => setIsLocked(!isLocked)}
      >
        {isLocked ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="11" width="18" height="11" rx="2"/>
            <path d="M7 11V7a5 5 0 0110 0v4"/>
          </svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="11" width="18" height="11" rx="2"/>
            <path d="M7 11V7a5 5 0 019.9-1"/>
          </svg>
        )}
      </button>

      <div className={`player-controls ${isLocked ? 'controls-locked' : ''}`}>
        {isLocked && <div className="controls-lock-overlay" />}
        <button className="btn-secondary btn-icon" onClick={togglePause}>
          {ds.isPaused ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z"/>
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M6 4h4v16H6zM14 4h4v16h-4z"/>
            </svg>
          )}
        </button>
        <button className="btn-secondary btn-icon btn-icon-sm" onClick={handleStop}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <rect x="6" y="6" width="12" height="12" rx="2"/>
          </svg>
        </button>
      </div>
    </div>
  );
};
