import { app, globalShortcut, Menu, BrowserWindow } from 'electron';
import path from 'path';
import fs from 'fs';

export interface KeybindConfig {
  id: string;
  label: string;
  accelerator: string;
  isGlobal: boolean;
  defaultAccelerator: string;
}

const DEFAULT_KEYBINDS: KeybindConfig[] = [
  {
    id: 'general:toggle-visibility',
    label: 'Toggle Visibility',
    accelerator: 'CommandOrControl+B',
    isGlobal: true,
    defaultAccelerator: 'CommandOrControl+B',
  },
  {
    id: 'general:process-screenshots',
    label: 'Process Screenshots',
    accelerator: 'CommandOrControl+Enter',
    isGlobal: true,
    defaultAccelerator: 'CommandOrControl+Enter',
  },
  {
    id: 'general:capture-and-process',
    label: 'Capture Screen & Ask AI (Global)',
    accelerator: 'CommandOrControl+Shift+Enter',
    isGlobal: true,
    defaultAccelerator: 'CommandOrControl+Shift+Enter',
  },
  {
    id: 'general:reset-cancel',
    label: 'Reset / Cancel',
    accelerator: 'CommandOrControl+R',
    isGlobal: true,
    defaultAccelerator: 'CommandOrControl+R',
  },
  {
    id: 'general:take-screenshot',
    label: 'Take Screenshot',
    accelerator: 'CommandOrControl+H',
    isGlobal: true,
    defaultAccelerator: 'CommandOrControl+H',
  },
  {
    id: 'chat:whatToAnswer',
    label: 'What to Answer',
    accelerator: 'CommandOrControl+1',
    isGlobal: true,
    defaultAccelerator: 'CommandOrControl+1',
  },
  {
    id: 'chat:clarify',
    label: 'Clarify',
    accelerator: 'CommandOrControl+2',
    isGlobal: true,
    defaultAccelerator: 'CommandOrControl+2',
  },
  {
    id: 'chat:dynamicAction4',
    label: 'Recap',
    accelerator: 'CommandOrControl+3',
    isGlobal: true,
    defaultAccelerator: 'CommandOrControl+3',
  },
  {
    id: 'chat:followUp',
    label: 'Follow Up',
    accelerator: 'CommandOrControl+4',
    isGlobal: true,
    defaultAccelerator: 'CommandOrControl+4',
  },
  // Global scroll shortcuts preserve stealth mode; horizontal uses Alt to avoid
  // hijacking macOS text-input line-start/end shortcuts system-wide.
  {
    id: 'chat:scrollUp',
    label: 'Scroll Up',
    accelerator: 'CommandOrControl+Up',
    isGlobal: true,
    defaultAccelerator: 'CommandOrControl+Up',
  },
  {
    id: 'chat:scrollDown',
    label: 'Scroll Down',
    accelerator: 'CommandOrControl+Down',
    isGlobal: true,
    defaultAccelerator: 'CommandOrControl+Down',
  },
  {
    id: 'chat:scrollLeft',
    label: 'Scroll Left (code block)',
    accelerator: 'CommandOrControl+Alt+Left',
    isGlobal: true,
    defaultAccelerator: 'CommandOrControl+Alt+Left',
  },
  {
    id: 'chat:scrollRight',
    label: 'Scroll Right (code block)',
    accelerator: 'CommandOrControl+Alt+Right',
    isGlobal: true,
    defaultAccelerator: 'CommandOrControl+Alt+Right',
  },
  // Bare Cmd+Space and Ctrl+Space are reserved by Spotlight/IME source switching.
  {
    id: 'chat:focusInput',
    label: 'Toggle Stealth Typing',
    accelerator: 'CommandOrControl+Shift+Space',
    isGlobal: true,
    defaultAccelerator: 'CommandOrControl+Shift+Space',
  },

  {
    id: 'window:move-up',
    label: 'Move Window Up',
    accelerator: 'CommandOrControl+Shift+Up',
    isGlobal: true,
    defaultAccelerator: 'CommandOrControl+Shift+Up',
  },
  {
    id: 'window:move-down',
    label: 'Move Window Down',
    accelerator: 'CommandOrControl+Shift+Down',
    isGlobal: true,
    defaultAccelerator: 'CommandOrControl+Shift+Down',
  },
  {
    id: 'window:move-left',
    label: 'Move Window Left',
    accelerator: 'CommandOrControl+Shift+Left',
    isGlobal: true,
    defaultAccelerator: 'CommandOrControl+Shift+Left',
  },
  {
    id: 'window:move-right',
    label: 'Move Window Right',
    accelerator: 'CommandOrControl+Shift+Right',
    isGlobal: true,
    defaultAccelerator: 'CommandOrControl+Shift+Right',
  },
];

export class KeybindService {
  private static instance: KeybindService;
  private keybinds: Map<string, KeybindConfig> = new Map();
  private filePath: string;
  private windowHelper: any; // Type avoided for circular dep, passed in init
  private onUpdateCallbacks: (() => void)[] = [];
  private onShortcutTriggeredCallbacks: ((actionId: string) => void)[] = [];
  private activeMode: 'launcher' | 'overlay' = 'launcher';
  private healthCheckTimer: NodeJS.Timeout | null = null;
  // Poll often enough to recover one cycle after sleep, wake, or workspace switch.
  private static readonly HEALTH_CHECK_INTERVAL_MS = 10_000;

  public setMode(mode: 'launcher' | 'overlay') {
    if (this.activeMode === mode) return;
    this.activeMode = mode;
    console.log(
      `[KeybindService] Mode changed to: ${mode}. Refreshing global shortcuts.`
    );
    this.registerGlobalShortcuts();
  }

  private shouldRegister(actionId: string): boolean {
    if (this.activeMode === 'overlay') return true;

    if (actionId === 'general:toggle-visibility') return true;
    if (actionId.startsWith('window:move-')) return true;

    // Screenshot and screen-analyze shortcuts must remain global in launcher mode.
    if (actionId === 'general:take-screenshot') return true;
    if (actionId === 'general:capture-and-process') return true;

    return false;
  }

  private normalizeAccelerator(acc: string): string {
    if (!acc) return '';
    // Persisted accelerators should compare independent of modifier order/case.
    const parts = acc.split('+').map((p) => p.trim().toLowerCase());
    parts.sort();
    return parts.join('+');
  }

  private findAcceleratorConflict(
    ownerId: string,
    accelerator: string
  ): string | null {
    if (!accelerator || accelerator.trim() === '') return null;
    const normalizedNew = this.normalizeAccelerator(accelerator);
    let conflictId: string | null = null;
    this.keybinds.forEach((kb, existingId) => {
      if (
        existingId !== ownerId &&
        this.normalizeAccelerator(kb.accelerator) === normalizedNew
      ) {
        conflictId = existingId;
      }
    });
    return conflictId;
  }

  private constructor() {
    this.filePath = path.join(app.getPath('userData'), 'keybinds.json');
    this.load();
  }

  public onUpdate(callback: () => void) {
    this.onUpdateCallbacks.push(callback);
  }

  public onShortcutTriggered(callback: (actionId: string) => void) {
    this.onShortcutTriggeredCallbacks.push(callback);
  }

  public static getInstance(): KeybindService {
    if (!KeybindService.instance) {
      KeybindService.instance = new KeybindService();
    }
    return KeybindService.instance;
  }

  public setShortcutTargetWindow(windowHelper: any) {
    this.windowHelper = windowHelper;
  }

  private load() {
    DEFAULT_KEYBINDS.forEach((kb) => this.keybinds.set(kb.id, { ...kb }));

    try {
      if (!fs.existsSync(this.filePath)) return;
      const data = JSON.parse(fs.readFileSync(this.filePath, 'utf-8'));

      // Saved user customizations must survive action ID renames.
      const ID_MIGRATIONS: Record<string, string> = {
        'chat:recap': 'chat:dynamicAction4',
        'chat:followup': 'chat:followUp', // casing fix — persisted keybinds.json may have old casing
      };
      for (const fileKb of data) {
        if (ID_MIGRATIONS[fileKb.id]) {
          fileKb.id = ID_MIGRATIONS[fileKb.id];
        }
      }

      let hadConflicts = false;
      for (const fileKb of data) {
        if (!this.keybinds.has(fileKb.id)) continue;
        const current = this.keybinds.get(fileKb.id)!;

        const conflictId = this.findAcceleratorConflict(
          fileKb.id,
          fileKb.accelerator
        );
        if (conflictId) {
          const conflictKb = this.keybinds.get(conflictId)!;
          conflictKb.accelerator = '';
          this.keybinds.set(conflictId, conflictKb);
          hadConflicts = true;
        }

        current.accelerator = fileKb.accelerator;
        this.keybinds.set(fileKb.id, current);
      }

      if (hadConflicts) {
        this.save();
      }
    } catch (error) {
      console.error('[KeybindService] Failed to load keybinds:', error);
    }
  }

  private save() {
    try {
      const data = Array.from(this.keybinds.values()).map((kb) => ({
        id: kb.id,
        accelerator: kb.accelerator,
      }));
      const tmpPath = this.filePath + '.tmp';
      fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2));
      fs.renameSync(tmpPath, this.filePath);
    } catch (error) {
      console.error('[KeybindService] Failed to save keybinds:', error);
    }
  }

  public getKeybind(id: string): string | undefined {
    return this.keybinds.get(id)?.accelerator;
  }

  public getAllKeybinds(): KeybindConfig[] {
    return Array.from(this.keybinds.values());
  }

  public setKeybind(id: string, accelerator: string) {
    if (!this.keybinds.has(id)) return;

    const currentKb = this.keybinds.get(id)!;
    const oldAccelerator = currentKb.accelerator;

    // Rebinding to an occupied accelerator swaps instead of silently dropping one action.
    const swappedId = this.findAcceleratorConflict(id, accelerator);
    if (swappedId) {
      const conflictKb = this.keybinds.get(swappedId)!;
      conflictKb.accelerator = oldAccelerator;
      this.keybinds.set(swappedId, conflictKb);
    }

    currentKb.accelerator = accelerator;
    this.keybinds.set(id, currentKb);

    this.save();
    this.registerGlobalShortcuts(); // Re-register if it was a global one
    this.broadcastUpdate();
  }

  public resetKeybinds() {
    this.keybinds.clear();
    DEFAULT_KEYBINDS.forEach((kb) => this.keybinds.set(kb.id, { ...kb }));
    this.save();
    this.registerGlobalShortcuts();
    this.broadcastUpdate();
  }

  public registerGlobalShortcuts() {
    globalShortcut.unregisterAll();

    this.keybinds.forEach((kb) => {
      if (!kb.isGlobal || !kb.accelerator || kb.accelerator.trim() === '')
        return;
      if (!this.shouldRegister(kb.id)) return;

      const acc = kb.accelerator.trim();
      try {
        globalShortcut.register(acc, () => {
          this.onShortcutTriggeredCallbacks.forEach((cb) => cb(kb.id));
        });
        if (globalShortcut.isRegistered(acc)) {
          console.log(
            `[KeybindService] Registered global shortcut: ${acc} -> ${kb.id}`
          );
          return;
        }
        console.warn(
          `[KeybindService] Failed to register global shortcut (likely in use by OS): ${acc}`
        );
        // Surface OS shortcut conflicts in the UI.
        BrowserWindow.getAllWindows().forEach((win) => {
          if (!win.isDestroyed()) {
            win.webContents.send('keybinds:registration-failed', {
              id: kb.id,
              accelerator: acc,
            });
          }
        });
      } catch (e) {
        console.error(
          `[KeybindService] Exception while registering global shortcut ${acc}:`,
          e
        );
      }
    });

    this.updateMenu();

    this.startHealthCheck();
  }

  public revalidateShortcuts(): void {
    let lost = 0;
    let recovered = 0;

    this.keybinds.forEach((kb) => {
      if (!kb.isGlobal || !kb.accelerator || kb.accelerator.trim() === '')
        return;
      if (!this.shouldRegister(kb.id)) return;

      const acc = kb.accelerator.trim();
      if (globalShortcut.isRegistered(acc)) return;

      lost++;
      try {
        globalShortcut.register(acc, () => {
          this.onShortcutTriggeredCallbacks.forEach((cb) => cb(kb.id));
        });
        if (globalShortcut.isRegistered(acc)) {
          recovered++;
          console.warn(
            `[KeybindService] Recovered lost shortcut: ${acc} -> ${kb.id}`
          );
          return;
        }
        console.error(
          `[KeybindService] Could not recover shortcut ${acc} -> ${kb.id} (OS conflict?)`
        );
      } catch (e) {
        console.error(
          `[KeybindService] Exception re-registering shortcut ${acc}:`,
          e
        );
      }
    });

    if (lost > 0) {
      console.warn(
        `[KeybindService] Health check: ${lost} shortcut(s) were dropped by OS, ${recovered} recovered.`
      );
    }
  }

  private startHealthCheck(): void {
    this.stopHealthCheck();
    this.healthCheckTimer = setInterval(() => {
      this.revalidateShortcuts();
    }, KeybindService.HEALTH_CHECK_INTERVAL_MS);
    // Do not keep Electron alive solely for shortcut health checks.
    if (this.healthCheckTimer.unref) this.healthCheckTimer.unref();
  }

  private stopHealthCheck(): void {
    if (!this.healthCheckTimer) return;
    clearInterval(this.healthCheckTimer);
    this.healthCheckTimer = null;
  }

  public updateMenu() {
    // Windows/Linux still need menu roles for DevTools shortcuts.
    if (process.platform !== 'darwin') {
      const template: any[] = [
        {
          label: 'View',
          submenu: [
            { role: 'reload' },
            { role: 'forceReload' },
            { role: 'toggleDevTools' },
            { type: 'separator' },
            { role: 'resetZoom' },
            { role: 'zoomIn' },
            { role: 'zoomOut' },
            { type: 'separator' },
            { role: 'togglefullscreen' },
          ],
        },
      ];
      const menu = Menu.buildFromTemplate(template);
      Menu.setApplicationMenu(menu);
      return;
    }

    const toggleKb = this.keybinds.get('general:toggle-visibility');
    const toggleAccelerator = toggleKb
      ? toggleKb.accelerator
      : 'CommandOrControl+B';

    const template: any[] = [
      {
        label: app.name,
        submenu: [
          { role: 'about' },
          { type: 'separator' },
          { role: 'services' },
          { type: 'separator' },
          { role: 'hide', accelerator: 'CommandOrControl+Option+H' },
          {
            role: 'hideOthers',
            accelerator: 'CommandOrControl+Option+Shift+H',
          },
          { role: 'unhide' },
          { type: 'separator' },
          { role: 'quit' },
        ],
      },
      {
        role: 'editMenu',
      },
      {
        label: 'View',
        submenu: [
          {
            label: 'Toggle Visibility',
            accelerator: toggleAccelerator || undefined,
            click: () => {
              this.windowHelper?.toggleMainWindow();
            },
          },
          { type: 'separator' },
          {
            label: 'Move Window Up',
            accelerator: this.getKeybind('window:move-up') || undefined,
            click: () => this.windowHelper?.moveWindowUp(),
          },
          {
            label: 'Move Window Down',
            accelerator: this.getKeybind('window:move-down') || undefined,
            click: () => this.windowHelper?.moveWindowDown(),
          },
          {
            label: 'Move Window Left',
            accelerator: this.getKeybind('window:move-left') || undefined,
            click: () => this.windowHelper?.moveWindowLeft(),
          },
          {
            label: 'Move Window Right',
            accelerator: this.getKeybind('window:move-right') || undefined,
            click: () => this.windowHelper?.moveWindowRight(),
          },
          { type: 'separator' },
          { role: 'reload' },
          { role: 'forceReload' },
          { role: 'toggleDevTools' },
          { type: 'separator' },
          { role: 'resetZoom' },
          { role: 'zoomIn' },
          { role: 'zoomOut' },
          { type: 'separator' },
          { role: 'togglefullscreen' },
        ],
      },
      {
        role: 'windowMenu',
      },
      {
        role: 'help',
        submenu: [
          {
            label: 'Learn More',
            click: async () => {
              const { shell } = require('electron');
              await shell.openExternal('https://electronjs.org');
            },
          },
        ],
      },
    ];

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
    console.log('[KeybindService] Application menu updated');
  }

  private broadcastUpdate() {
    this.onUpdateCallbacks.forEach((cb) => cb());

    const windows = BrowserWindow.getAllWindows();
    const allKeybinds = this.getAllKeybinds();
    windows.forEach((win) => {
      if (!win.isDestroyed()) {
        win.webContents.send('keybinds:update', allKeybinds);
      }
    });
  }

}
