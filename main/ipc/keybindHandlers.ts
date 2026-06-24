import { safeHandle } from './safeHandle';
import { KeybindService } from '../services/keybind/KeybindService';

export function registerKeybindHandlers(): void {
  const km = KeybindService.getInstance();

  safeHandle('keybinds:get-all', () => km.getAllKeybinds());

  safeHandle('keybinds:set', (_event, id: string, accelerator: string) => {
    console.log(`[KeybindService] Set ${id} -> ${accelerator}`);
    km.setKeybind(id, accelerator);
    return true;
  });

  safeHandle('keybinds:reset', () => {
    console.log('[KeybindService] Reset defaults');
    km.resetKeybinds();
    return km.getAllKeybinds();
  });
}
