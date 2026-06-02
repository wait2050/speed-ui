// ============================================================
// App — 状态驱动页面路由 + 侧边栏
// ============================================================
import React, { useState, useCallback } from 'react';
import { useAppStore } from './state/store';
import { Home } from './pages/Home';
import { Preview } from './pages/Preview';
import { Player } from './pages/Player';
import { Landing } from './pages/Landing';
import { HistoryDetail } from './pages/HistoryDetail';
import { Sidebar } from './components/Sidebar';
import { loadProgress } from './storage';
import { audioEngine } from './audio/engine';
import type { CompiledSequence } from './types';
import './index.css';

const AppInner: React.FC = () => {
  const { status, compiled, compilationDone, startPlaying } = useAppStore();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // 检测未完成编排
  React.useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const saved = loadProgress();
        if (saved && status === 'IDLE') {
          const resume = window.confirm('检测到上次未完成的播放，是否继续？');
          if (resume) {
            audioEngine.init().then(() => {
              compilationDone({ timeline: saved.timeline, stats: { totalDuration: 0, totalActionDuration: 0, totalRestDuration: 0, rounds: 0, warmupRounds: 0, coreRounds: 0, sprintRounds: 0 } });
              startPlaying();
            }).catch(() => {});
          }
        }
      } catch { /* ignore */ }
    }, 500);
    return () => clearTimeout(timer);
  }, []); // eslint-disable-line

  // 从侧边栏加载编排
  const handleLoadSequence = useCallback((seq: CompiledSequence) => {
    compilationDone(seq);
  }, [compilationDone]);

  const showHamburger = status === 'IDLE' || status === 'READY' || status === 'FINISHED' || status === 'HISTORY_DETAIL';

  const page = (() => {
    switch (status) {
      case 'IDLE': return <Home />;
      case 'COMPILING':
        return (
          <div className="page loading-page">
            <div className="loading-spinner" />
            <p>正在生成编排...</p>
          </div>
        );
      case 'READY': return <Preview />;
      case 'PLAYING':
      case 'PAUSED': return <Player />;
      case 'FINISHED': return <Landing />;
      case 'HISTORY_DETAIL': return <HistoryDetail />;
      default: return <Home />;
    }
  })();

  return (
    <>
      {showHamburger && (
        <button className="btn-hamburger" onClick={() => setSidebarOpen(true)}>
          ☰
        </button>
      )}

      {page}

      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onLoadSequence={handleLoadSequence}
      />
    </>
  );
};

const App: React.FC = () => <AppInner />;

export default App;
