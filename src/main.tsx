import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// 清除 fallback
const rootEl = document.getElementById('root');
if (rootEl) {
  const fb = document.getElementById('root-fallback');
  if (fb) fb.remove();
}

ReactDOM.createRoot(document.getElementById('root')!).render(<App />);
