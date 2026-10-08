import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { installDesktopBridge } from './lib/desktop/tauriBridge';

installDesktopBridge();

// Apply before React renders so selectors do not flash.
document.documentElement.setAttribute(
  'data-platform',
  window.desktopAPI.platform
);
document.documentElement.setAttribute('data-theme', 'dark');

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
