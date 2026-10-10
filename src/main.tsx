import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
async function bootstrap(): Promise<void> {
  if (import.meta.env.VITE_E2E === 'true') {
    const { e2eDesktopAPI } = await import('./lib/desktop/e2eBridge');
    window.desktopAPI = e2eDesktopAPI;
  } else {
    const { installDesktopBridge } = await import('./lib/desktop/tauriBridge');
    installDesktopBridge();
  }

  // Apply before React renders so selectors do not flash.
  document.documentElement.setAttribute(
    'data-platform',
    window.desktopAPI.platform
  );
  document.documentElement.setAttribute('data-theme', 'dark');

  const { default: App } = await import('./App');
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}

void bootstrap();
