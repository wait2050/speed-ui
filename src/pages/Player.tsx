// ============================================================
// Player — 极简播放页：引擎驱动 UI，零闭包问题
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
import type { Phase } from '../types';

const PHASE_LABELS: Record<Phase, string> = {
  warmup: '热身', core: '核心',
  sprint_start: '起冲', sprint_accel: '加速', sprint_peak: '顶峰',
  climax: '冲刺', afterglow: '余韵', cooldown: '收尾', landing: '着陆',
};

export const Player: React.FC = () => {
  const { compiled, reset, subjectiveClimaxTriggered, setSubjectiveClimax, playbackFinished, addExcitementPoint } = useAppStore();
  const engineRef = useRef<PlaybackEngine | null>(null);
  const compiledRef = useRef(compiled); // 用 ref 避免 compiled 变更触发 useEffect 重建
  compiledRef.current = compiled;

  // 显示状态（引擎单向推送）
  const [ds, setDs] = useState<EngineDisplayState>({
    actionName: '准备开始...', actionRemainingMs: 0,
    totalElapsedMs: 0, phase: 'warmup', isPaused: false,
  });

  // 启动 — 只在组件首次挂载时运行，不因 compiled 引用变化重建
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
      engine.start(c.timeline);
    });

    return () => { engine.destroy(); engineRef.current = null; };
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

  // 操作（直接调引擎，零闭包依赖）
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

  // 双向自适应盲控控制器状态和事件
  const [isExcited, setIsExcited] = useState(false);
  const [offsetX, setOffsetX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const touchStartRef = useRef(0);
  const exciteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleExcitement = useCallback(() => {
    engineRef.current?.recordExcitement(ds.actionName);
    // 实时推送打点到 Zustand store
    const point = engineRef.current?.getLastExcitementPoint();
    if (point) addExcitementPoint(point);
    setIsExcited(true);
    if (exciteTimerRef.current) clearTimeout(exciteTimerRef.current);
    exciteTimerRef.current = setTimeout(() => {
      setIsExcited(false);
    }, 800);
  }, [ds.actionName, addExcitementPoint]);

  const handleClimaxOrAfterglow = useCallback(() => {
    if (ds.phase !== 'climax') {
      engineRef.current?.triggerSubjectiveClimax('捏住并旋转');
      setSubjectiveClimax(true);
    } else {
      engineRef.current?.triggerReleaseAfterglow('提拉然后松手');
      setSubjectiveClimax(false);
    }
  }, [ds.phase, setSubjectiveClimax]);

  // 触屏手势绑定 — 左滑(兴奋打点)全阶段可用，右滑(冲刺)仅在热身后
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
      // 左滑：兴奋打点（所有阶段均可）
      handleExcitement();
    } else if (offsetX > 60 && ds.phase !== 'warmup') {
      // 右滑：冲刺/释放（热身期间禁用）
      handleClimaxOrAfterglow();
    }
    setOffsetX(0);
  }, [isDragging, ds.phase, offsetX, handleExcitement, handleClimaxOrAfterglow]);

  // 键盘操作绑定 — ArrowLeft(打点)全阶段可用，ArrowRight(冲刺)热身禁用
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        engineRef.current?.recordExcitement(ds.actionName);
        const point = engineRef.current?.getLastExcitementPoint();
        if (point) addExcitementPoint(point);
        setIsExcited(true);
        if (exciteTimerRef.current) clearTimeout(exciteTimerRef.current);
        exciteTimerRef.current = setTimeout(() => setIsExcited(false), 800);
      } else if (e.key === 'ArrowRight' && ds.phase !== 'warmup') {
        if (ds.phase !== 'climax') {
          engineRef.current?.triggerSubjectiveClimax('捏住并旋转');
          setSubjectiveClimax(true);
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
  }, [ds.phase, ds.actionName, setSubjectiveClimax, addExcitementPoint]);

  const segments: PhaseSegment[] = useMemo(
    () => compiled ? computePhaseSegments(compiled.timeline) : [],
    [compiled]
  );
  const totalMs = compiled?.stats?.totalDuration || 0;

  if (!compiled) {
    return <div className="page player-page"><p style={{ color: '#8888aa' }}>加载失败</p></div>;
  }

  return (
    <div className={`page player-page ${subjectiveClimaxTriggered || ds.phase === 'climax' ? 'climax-active' : ''} ${isExcited ? 'excited-flash' : ''}`}>
      <ProgressBar
        segments={segments}
        elapsedMs={ds.totalElapsedMs}
        totalMs={totalMs}
        currentPhaseLabel={PHASE_LABELS[ds.phase] ?? ds.phase}
        onSeek={handleSeek}
      />
      <div className="player-phase">{PHASE_LABELS[ds.phase] ?? ds.phase}</div>
      <div className="player-action-name">{ds.actionName}</div>
      <Timer remainingMs={ds.actionRemainingMs} totalMs={ds.actionRemainingMs || 60000} />

      {/* 凹槽滑块卡圈 SubjectiveSlider 双向自适应盲控控制器 */}
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

      <div className="player-controls">
        <button className="btn btn-pause" onClick={togglePause}>
          {ds.isPaused ? '▶ 继续' : '⏸ 暂停'}
        </button>
        <button className="btn btn-stop" onClick={handleStop}>■ 停止</button>
      </div>
    </div>
  );
};
