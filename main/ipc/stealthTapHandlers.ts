import { getSystemAudioPermissionWarning } from '../utils/permissions';
import { StealthKeyboardService } from '../services/stealth/StealthKeyboardService';
import { safeHandle } from './safeHandle';

// Stealth keyboard tap (macOS CGEventTap) + permission-warning channels.
// Non-darwin platforms get inert stubs so the renderer never special-cases.
export function registerStealthTapHandlers(): void {
  safeHandle('get-system-audio-permission-warning', () =>
    getSystemAudioPermissionWarning()
  );

  if (process.platform !== 'darwin') {
    safeHandle('stealth-tap:available', () => false);
    safeHandle('stealth-tap:open-settings', () => {});
    safeHandle('stealth-tap:stop', () => {});
    safeHandle('stealth-tap:start', () => false);
    safeHandle('stealth-tap:should-auto-engage', () => true);
    safeHandle('stealth-tap:refresh-ime', () => true);
    return;
  }

  const stealth = StealthKeyboardService.getInstance();
  safeHandle('stealth-tap:available', () => stealth.isAvailable());
  safeHandle('stealth-tap:open-settings', () => {
    stealth.openSettings();
  });
  safeHandle('stealth-tap:stop', () => {
    stealth.stop();
  });
  safeHandle('stealth-tap:start', () => stealth.start());
  safeHandle('stealth-tap:should-auto-engage', () => true);
  safeHandle('stealth-tap:refresh-ime', () => true);
}
