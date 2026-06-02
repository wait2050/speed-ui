// ============================================================
// App — 状态驱动页面路由 + 侧边栏
// ============================================================
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useAppStore } from './state/store';
import { Home } from './pages/Home';
import { Preview } from './pages/Preview';
import { Player } from './pages/Player';
import { Landing } from './pages/Landing';
import { HistoryDetail } from './pages/HistoryDetail';
import { Sidebar } from './components/Sidebar';
import type { CompiledSequence } from './types';
import './index.css';

const AppInner: React.FC = () => {
  const { status, compilationDone } = useAppStore();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // 页面转场遮罩
  const [transitioning, setTransitioning] = useState(false);
  const prevStatus = useRef(status);

  useEffect(() => {
    if (prevStatus.current !== status) {
      setTransitioning(true);
      const timer = setTimeout(() => setTransitioning(false), 300);
      prevStatus.current = status;
      return () => clearTimeout(timer);
    }
  }, [status]);

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
      {/* 转场遮罩 */}
      <div className={`page-transition-overlay ${transitioning ? 'active' : ''}`} />

      {showHamburger && (
        <button className="btn-hamburger" onClick={() => setSidebarOpen(true)}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="3" y1="6" x2="21" y2="6"/>
            <line x1="3" y1="12" x2="17" y2="12"/>
            <line x1="3" y1="18" x2="13" y2="18"/>
          </svg>
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
