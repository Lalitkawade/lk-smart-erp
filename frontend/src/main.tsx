import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';

// Global UX Improvement: Throughout the web app, when user focuses/clicks any numeric input or field containing default '0', auto-select all text so typing immediately replaces it with clean entry without leading zeroes.
window.addEventListener('focusin', (e) => {
  const target = e.target as HTMLInputElement;
  if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
    if (target.type === 'number' || target.getAttribute('inputmode') === 'numeric') {
      const val = target.value.trim();
      if (val === '0' || val === '0.00' || val === '0.0') {
        setTimeout(() => target.select(), 0);
      }
    }
  }
}, true);

window.addEventListener('click', (e) => {
  const target = e.target as HTMLInputElement;
  if (target && target.tagName === 'INPUT') {
    if (target.type === 'number' || target.getAttribute('inputmode') === 'numeric') {
      const val = target.value.trim();
      if (val === '0' || val === '0.00' || val === '0.0') {
        setTimeout(() => target.select(), 0);
      }
    }
  }
}, true);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

// Register Service Worker for Offline PWA Support
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((reg) => console.log('PWA Service Worker registered:', reg.scope))
      .catch((err) => console.error('PWA Service Worker registration failed:', err));
  });
}
