/// <reference types="vite/client" />

import type { DesktopAPI } from './types/desktop';

declare global {
  interface Window {
    desktopAPI: DesktopAPI;
  }
}

export {};
