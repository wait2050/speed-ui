// ============================================================
// App — 状态驱动页面路由 + 侧边栏 + 底部导航
// ============================================================
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useAppStore } from './state/store';
import { Home } from './pages/Home';
import { Preview } from './pages/Preview';
import { Player } from './pages/Player';
import { Landing } from './pages/Landing';
import { HistoryDetail } from './pages/HistoryDetail';
import { HistoryStats } from './pages/HistoryStats';
import { Settings } from './pages/Settings';
import { Sidebar } from './components/Sidebar';
import type { CompiledSequence } from './types';
import './index.css';

const AppInner: React.FC = () => {
  const { status, compilationDone } = useAppStore();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'home' | 'history' | 'settings'>('home');

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

  // 从侧边栏/历史/收藏加载编排
  const handleLoadSequence = useCallback((seq: CompiledSequence) => {
    compilationDone(seq);
  }, [compilationDone]);

  const showHamburger = status === 'IDLE' || status === 'READY' || status === 'FINISHED' || status === 'HISTORY_DETAIL';
  const showBottomNav = status === 'IDLE';

  const page = (() => {
    switch (status) {
      case 'IDLE':
        if (activeTab === 'history') return <HistoryStats />;
        if (activeTab === 'settings') return <Settings />;
        return <Home />;
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
      default:
        return <Home />;
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

      <div style={{ paddingBottom: showBottomNav ? '72px' : '0' }}>
        {page}
      </div>

      {showBottomNav && (
        <div className="bottom-nav-bar glass-card" style={{
          position: 'fixed',
          bottom: '12px',
          left: '50%',
          transform: 'translateX(-50%)',
          width: 'calc(100% - 24px)',
          maxWidth: '480px',
          height: '60px',
          display: 'flex',
          justifyContent: 'space-around',
          alignItems: 'center',
          borderRadius: '16px',
          padding: '0 8px',
          zIndex: 90,
          boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.37)',
          border: '1px solid rgba(255, 255, 255, 0.08)'
        }}>
          {([
            ['home', '⚙️', '编排配置'],
            ['history', '📊', '历史统计'],
            ['settings', '🔧', '全局设置']
          ] as const).map(([tab, icon, label]) => {
            const isActive = activeTab === tab;
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'none',
                  border: 'none',
                  color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
                  cursor: 'pointer',
                  padding: '6px 12px',
                  borderRadius: '12px',
                  transition: 'all 0.2s ease',
                  flex: 1,
                  transform: isActive ? 'scale(1.05)' : 'scale(1)'
                }}
              >
                <span style={{ fontSize: '18px', marginBottom: '2px' }}>{icon}</span>
                <span style={{ fontSize: '10px', fontWeight: isActive ? 600 : 400 }}>{label}</span>
              </button>
            );
          })}
        </div>
      )}

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
