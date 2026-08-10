import { StrictMode, Component, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fortawesome/fontawesome-free/css/all.min.css';
import './index.css';
import App from './App.tsx';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorMsg: string;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, errorMsg: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, errorMsg: error?.message || 'Application encountered an unexpected error.' };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error('React Root ErrorBoundary caught exception:', error, errorInfo);
  }

  handleReload = () => {
    localStorage.clear();
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-center">
          <div className="max-w-md w-full bg-slate-900 border border-slate-800 p-8 rounded-2xl shadow-2xl space-y-4">
            <div className="w-14 h-14 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-full flex items-center justify-center mx-auto text-2xl">
              <i className="fa-solid fa-triangle-exclamation"></i>
            </div>
            <h1 className="text-xl font-bold text-white tracking-tight">Enterprise Portal</h1>
            <p className="text-sm text-slate-400">Application recovered from a session sync issue.</p>
            <div className="p-3 bg-slate-800/60 rounded-lg text-xs text-slate-300 font-mono text-left overflow-auto max-h-24">
              {this.state.errorMsg}
            </div>
            <button
              onClick={this.handleReload}
              className="w-full py-3 bg-primary hover:bg-primary/90 text-white font-bold rounded-xl shadow-lg transition active:scale-95 cursor-pointer text-sm"
            >
              <i className="fa-solid fa-rotate-right mr-2"></i> Reload & Reset Session
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// Global UX Improvement: Throughout the web app, when user focuses/clicks any numeric input or field containing default '0', auto-select all text
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

import { registerSW } from 'virtual:pwa-register';
import { perfTracker } from './utils/perfTracker';

// Register PWA service worker with auto-update capability
const updateSW = registerSW({
  onNeedRefresh() {
    console.log('New LK Smart ERP update available. Refreshing...');
    updateSW(true);
  },
  onOfflineReady() {
    console.log('LK Smart ERP is ready for offline operation.');
  },
});

console.time('⏱️ [PERF UI] React Root Mount');
perfTracker.incrementCall('React Mount');
perfTracker.reactMountTime = performance.now();

// Observe First Contentful Render (FCR)
if (typeof PerformanceObserver !== 'undefined') {
  try {
    const observer = new PerformanceObserver((entryList) => {
      for (const entry of entryList.getEntries()) {
        if (entry.name === 'first-contentful-paint') {
          console.log(`🎨 [PERF UI] First Contentful Render (FCR): ${entry.startTime.toFixed(2)} ms`);
        }
      }
    });
    observer.observe({ type: 'paint', buffered: true });
  } catch (e) {}
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
);
console.timeEnd('⏱️ [PERF UI] React Root Mount');

