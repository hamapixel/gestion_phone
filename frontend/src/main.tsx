import React from 'react';
import ReactDOM from 'react-dom/client';
import AuthGate from './AuthGate';
import './styles.css';
import './premium.css';
import './native.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><AuthGate/></React.StrictMode>
);

if (typeof window !== 'undefined' && !window.__TAURI__ && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch(() => {
      // Browsers that block service workers may still use the app online.
    });
  });
}
