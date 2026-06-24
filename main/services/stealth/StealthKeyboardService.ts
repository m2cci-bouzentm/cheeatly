import { BrowserWindow, shell, systemPreferences } from 'electron';
import type {
  CapturedKey,
  OverlayBoundsInput,
} from '../audio/native/nativeModuleLoader';
import { isVerboseLogging } from '../../utils/logger';

// Main owns tap shutdown because renderer unmounts can strand native taps.
export class StealthKeyboardService {
  private static instance: StealthKeyboardService | null = null;

  private tap: any | null = null;
  private active = false;
  private nativeAvailable = false;
  private idleTimer: NodeJS.Timeout | null = null;
  // Captured keystrokes are sensitive; never fan them out to helper windows.
  private overlayWebContents: Electron.WebContents | null = null;
  private overlayBoundsProvider: (() => OverlayBoundsInput | null) | null =
    null;
  private auxWindowsCloser: (() => void) | null = null;
  // Closed listeners must not clear a newer overlay registration.
  private overlayRegistrationToken: number = 0;
  // Long enough for pauses, short enough to limit a stranded tap.
  private static readonly IDLE_TIMEOUT_MS = 10_000;

  private constructor() {
    this.tap = this.createTapInstance();
    this.nativeAvailable = this.tap !== null;
  }

  public static getInstance(): StealthKeyboardService {
    if (!StealthKeyboardService.instance) {
      StealthKeyboardService.instance = new StealthKeyboardService();
    }
    return StealthKeyboardService.instance;
  }

  public setOverlayBoundsSource(
    provider: (() => OverlayBoundsInput | null) | null
  ): void {
    this.overlayBoundsProvider = provider;
  }

  public setAuxWindowCloseHandler(closer: (() => void) | null): void {
    this.auxWindowsCloser = closer;
  }

  // Keep Rust's mouse-down classifier aligned with the live overlay bounds.
  public pushBoundsToTap(): void {
    if (!this.tap) return;
    const bounds = this.getOverlayBoundsForTap();
    if (StealthKeyboardService.boundsEqual(this.lastPushedBounds, bounds))
      return;
    this.lastPushedBounds = bounds;
    try {
      this.tap.updateOverlayBounds(bounds);
    } catch (e) {
      console.error('[StealthKeyboardService] updateOverlayBounds threw:', e);
    }
  }

  private lastPushedBounds: OverlayBoundsInput | null = null;
  private static boundsEqual(
    a: OverlayBoundsInput | null,
    b: OverlayBoundsInput | null
  ): boolean {
    if (a === b) return true;
    if (!a || !b) return false;
    return (
      a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height
    );
  }

  public setOverlayWindow(win: BrowserWindow | null): void {
    // Invalidate prior 'closed' handlers, including null registrations.
    const myToken = ++this.overlayRegistrationToken;
    if (!win) {
      this.overlayWebContents = null;
      return;
    }
    this.overlayWebContents = !win.isDestroyed() ? win.webContents : null;
    win.once('closed', () => {
      if (this.overlayRegistrationToken === myToken) {
        this.overlayWebContents = null;
      }
    });
  }

  public isAvailable(): boolean {
    return this.nativeAvailable;
  }

  public isPermissionGranted(): boolean {
    if (process.platform !== 'darwin') return false;
    // Electron avoids a native rebuild; native fallback covers older Electron.
    try {
      return systemPreferences.isTrustedAccessibilityClient(false);
    } catch {
      return this.callNativePermissionCheck();
    }
  }

  public requestPermission(): boolean {
    if (process.platform !== 'darwin') return false;
    try {
      return systemPreferences.isTrustedAccessibilityClient(true);
    } catch {
      return false;
    }
  }

  public openSettings(): void {
    if (process.platform !== 'darwin') return;
    // Deep link can fail on macOS versions; fall back to the parent pane.
    const tryOpen = (url: string): Promise<unknown> =>
      Promise.resolve(shell.openExternal(url));
    tryOpen(
      'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility'
    )
      .catch(() =>
        tryOpen('x-apple.systempreferences:com.apple.preference.security')
      )
      .catch((e: unknown) => {
        console.error(
          '[StealthKeyboardService] failed to open Accessibility settings:',
          e
        );
      });
  }

  public isActive(): boolean {
    return this.active;
  }

  public start(): boolean {
    if (!this.tap) return false;
    if (this.active) return true;

    // Captured callbacks can fire during tap.start(); publish active first.
    this.active = true;
    this.broadcastState({ active: true });
    let ok = false;
    try {
      const overlayBounds = this.getOverlayBoundsForTap();
      ok = this.tap.start((err: Error | null, ev: CapturedKey) => {
        if (err) {
          console.error('[StealthKeyboardService] tap callback error:', err);
          return;
        }
        // napi-rs can send undefined during tsfn shutdown.
        if (!ev) return;
        this.handleCapturedKey(ev);
      }, overlayBounds);
    } catch (e) {
      this.active = false;
      this.broadcastState({ active: false });
      console.error('[StealthKeyboardService] tap.start threw:', e);
      return false;
    }

    if (!ok) {
      this.active = false;
      this.broadcastState({ active: false, reason: 'permission' });
      return false;
    }

    // Nonactivating aux panels can miss blur and keep dead inputs visible.
    this.hideAuxWindowsForStealth();

    this.armIdleTimer();
    return true;
  }

  private hideAuxWindowsForStealth(): void {
    try {
      this.auxWindowsCloser?.();
    } catch (e) {
      console.error(
        '[StealthKeyboardService] hideAuxWindowsForStealth failed:',
        e
      );
    }
  }

  public stop(): void {
    this.clearIdleTimer();
    if (!this.tap) return;
    if (!this.active) return;
    this.tap.stop();
    this.active = false;
    this.broadcastState({ active: false });
  }

  private armIdleTimer(): void {
    // Late captured events after stop() must not create zombie timers.
    if (!this.active) return;
    this.clearIdleTimer();
    this.idleTimer = setTimeout(() => {
      if (this.active) this.stop();
    }, StealthKeyboardService.IDLE_TIMEOUT_MS);
  }

  private clearIdleTimer(): void {
    if (!this.idleTimer) return;
    clearTimeout(this.idleTimer);
    this.idleTimer = null;
  }

  public toggle(): boolean {
    if (this.active) {
      this.stop();
      return false;
    }
    return this.start();
  }

  private createTapInstance(): any | null {
    if (process.platform !== 'darwin') return null;
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { loadNativeModule } = require('./audio/native/nativeModuleLoader');
      const native = loadNativeModule();
      if (!native) return null;
      const Ctor = native.StealthKeyboardTap;
      const shouldWarnMissingCtor =
        typeof Ctor !== 'function' && isVerboseLogging();
      if (shouldWarnMissingCtor) {
        console.warn(
          '[StealthKeyboardService] StealthKeyboardTap constructor missing from native binary — rebuild with `npm run build:native` for stealth typing'
        );
      }
      if (typeof Ctor !== 'function') {
        return null;
      }
      return new Ctor();
    } catch (e) {
      // Load failures are build/dist issues, not user-correctable permissions.
      console.error(
        '[StealthKeyboardService] failed to instantiate native tap:',
        e
      );
      return null;
    }
  }

  private callNativePermissionCheck(): boolean {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { loadNativeModule } = require('./audio/native/nativeModuleLoader');
      const native = loadNativeModule();
      return typeof native?.isAccessibilityGranted === 'function'
        ? native.isAccessibilityGranted()
        : false;
    } catch {
      return false;
    }
  }

  private getOverlayBoundsForTap(): OverlayBoundsInput | null {
    const bounds = this.overlayBoundsProvider?.() ?? null;
    if (!bounds || bounds.width <= 0 || bounds.height <= 0) return null;
    return bounds;
  }

  private handleCapturedKey(ev: CapturedKey): void {
    if (ev.isOutsideMouseDown) {
      this.stop();
      return;
    }

    // Renderer must see Esc before the inactive-state broadcast.
    if (ev.isKeyDown && ev.keyCode === 53) {
      this.sendKeyToOverlay(ev);
      this.stop();
      return;
    }
    if (!this.active) return;
    this.armIdleTimer();
    this.sendKeyToOverlay(ev);
  }

  private sendKeyToOverlay(ev: CapturedKey): void {
    if (this.overlayWebContents && !this.overlayWebContents.isDestroyed()) {
      this.overlayWebContents.send('stealth-key-captured', ev);
    }
  }

  private broadcastState(state: { active: boolean; reason?: string }): void {
    this.broadcast('stealth-tap-state', state);
  }

  private broadcast(channel: string, payload: unknown): void {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send(channel, payload);
      }
    }
  }
}
