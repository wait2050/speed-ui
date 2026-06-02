// ============================================================
// Landing — 静默着陆页：呼吸灯 + 评分
// ============================================================
import React, { useState, useCallback, useEffect } from 'react';
import { useAppStore } from '../state/store';
import { BreathingLight } from '../components/BreathingLight';
import { saveHistory, saveFavorite, loadPreferences } from '../storage';
import { buildExportData, downloadExport } from '../storage/export';
import type { HistoryEntry } from '../types';

export const Landing: React.FC = () => {
  const { compiled, totalDuration, reset, excitementPoints } = useAppStore();
  const [rating, setRating] = useState<number | null>(null);
  const [showFavorite, setShowFavorite] = useState(false);
  const [favLabel, setFavLabel] = useState('');
  const [ended, setEnded] = useState(false);
  const [phase, setPhase] = useState<'breathing' | 'rating' | 'done'>('breathing');

  // 30秒后自动进入评分
  useEffect(() => {
    const timer = setTimeout(() => {
      setPhase('rating');
    }, 30000);

    return () => clearTimeout(timer);
  }, []);

  const handleEndEarly = useCallback(() => {
    setPhase('rating');
  }, []);

  const handleRate = useCallback((r: number) => {
    setRating(r);

    if (compiled) {
      // 合入独立存储的兴奋打点数据
      const mergedStats = {
        ...compiled.stats,
        excitementPoints: excitementPoints.length > 0 ? excitementPoints : compiled.stats.excitementPoints,
      };
      const mergedCompiled = { ...compiled, stats: mergedStats };

      const entry: HistoryEntry = {
        id: `h_${Date.now()}`,
        timestamp: Date.now(),
        totalDuration: totalDuration,
        stats: mergedStats,
        rating: r,
        sequence: mergedCompiled,
      };
      saveHistory(entry);
    }

    setShowFavorite(true);
  }, [compiled, totalDuration, excitementPoints]);

  const handleFavorite = useCallback(() => {
    if (compiled && favLabel.trim()) {
      saveFavorite(compiled, favLabel.trim());
    }
    setPhase('done');
  }, [compiled, favLabel]);

  const handleSkipFavorite = useCallback(() => {
    setPhase('done');
  }, []);

  const handleReset = useCallback(() => {
    reset();
  }, [reset]);

  return (
    <div className="page landing-page">
      {phase === 'breathing' && (
        <div className="breathing-section">
          <BreathingLight />
          <button className="btn btn-end-early" onClick={handleEndEarly}>
            提前结束
          </button>
        </div>
      )}

      {phase === 'rating' && (
        <div className="rating-section">
          <h2>体验如何？</h2>
          <div className="stars">
            {[1, 2, 3, 4, 5].map(i => (
              <button
                key={i}
                className={`star ${rating !== null && i <= rating ? 'active' : ''}`}
                onClick={() => handleRate(i)}
                disabled={rating !== null}
              >
                {i <= (rating ?? 0) ? '★' : '☆'}
              </button>
            ))}
          </div>

          {showFavorite && (
            <div className="favorite-section">
              <p>是否收藏此编排？</p>
              <input
                type="text"
                className="fav-input"
                placeholder="输入标签（可选）"
                value={favLabel}
                onChange={e => setFavLabel(e.target.value)}
                autoFocus
              />
              <div className="fav-buttons">
                <button className="btn btn-save" onClick={handleFavorite}>
                  收藏
                </button>
                <button className="btn btn-skip" onClick={handleSkipFavorite}>
                  跳过
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {phase === 'done' && (
        <>
          <button className="btn btn-home" onClick={handleReset}>
            返回首页
          </button>
          <button
            className="btn btn-save"
            style={{ marginTop: 8 }}
            onClick={() => {
              if (!compiled) return;
              const data = buildExportData(
                totalDuration,
                ['warmup','core','sprint','climax','afterglow','cooldown'],
                [],
                3, 1,
                compiled,
              );
              downloadExport(data);
            }}
          >
            💾 导出编排
          </button>
        </>
      )}
    </div>
  );
};
