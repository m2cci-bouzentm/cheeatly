import { useState, useEffect, useCallback } from 'react';
import { acceleratorToKeys, keysToAccelerator } from '../utils/keyboardUtils';
import { isMac } from '../utils/platformUtils';

interface ShortcutConfig {
  whatToAnswer: string[];
  autoAnswerMode: string[];
  clarify: string[];
  followUp: string[];
  dynamicAction4: string[];
  recap: string[];
  scrollUp: string[];
  scrollDown: string[];
  scrollLeft: string[];
  scrollRight: string[];
  focusInput: string[];
  moveWindowUp: string[];
  moveWindowDown: string[];
  moveWindowLeft: string[];
  moveWindowRight: string[];
  toggleVisibility: string[];
  processScreenshots: string[];
  captureAndProcess: string[];
  resetCancel: string[];
  takeScreenshot: string[];
}

const BACKEND_TO_FRONTEND_SHORTCUT: Record<string, string> = {
  'app:toggle-global-overlay': 'toggleGlobalOverlay',
  'chat:whatToAnswer': 'whatToAnswer',
  'chat:followUp': 'followUp',
  'chat:followup': 'followUp',
  'chat:clarify': 'clarify',
  'chat:dynamicAction4': 'dynamicAction4',
  'chat:recap': 'recap',
  'chat:scrollUp': 'scrollUp',
  'chat:scrollDown': 'scrollDown',
  'chat:scrollLeft': 'scrollLeft',
  'chat:scrollRight': 'scrollRight',
  'chat:focusInput': 'focusInput',
  'chat:auto-answer-mode': 'autoAnswerMode',
  'window:move-up': 'moveWindowUp',
  'window:move-down': 'moveWindowDown',
  'window:move-left': 'moveWindowLeft',
  'window:move-right': 'moveWindowRight',
  'general:toggle-visibility': 'toggleVisibility',
  'general:process-screenshots': 'processScreenshots',
  'general:capture-and-process': 'captureAndProcess',
  'general:reset-cancel': 'resetCancel',
  'general:take-screenshot': 'takeScreenshot',
};

const FRONTEND_TO_BACKEND_SHORTCUT: Record<keyof ShortcutConfig, string> = {
  whatToAnswer: 'chat:whatToAnswer',
  autoAnswerMode: 'chat:auto-answer-mode',
  clarify: 'chat:clarify',
  followUp: 'chat:followUp',
  dynamicAction4: 'chat:dynamicAction4',
  recap: 'chat:recap',
  scrollUp: 'chat:scrollUp',
  scrollDown: 'chat:scrollDown',
  scrollLeft: 'chat:scrollLeft',
  scrollRight: 'chat:scrollRight',
  focusInput: 'chat:focusInput',
  moveWindowUp: 'window:move-up',
  moveWindowDown: 'window:move-down',
  moveWindowLeft: 'window:move-left',
  moveWindowRight: 'window:move-right',
  toggleVisibility: 'general:toggle-visibility',
  processScreenshots: 'general:process-screenshots',
  captureAndProcess: 'general:capture-and-process',
  resetCancel: 'general:reset-cancel',
  takeScreenshot: 'general:take-screenshot',
};

const ARROW_KEY_LABELS: Record<string, string> = {
  '↑': 'arrowup',
  '↓': 'arrowdown',
  '←': 'arrowleft',
  '→': 'arrowright',
};

function buildDefaultShortcuts(): ShortcutConfig {
  const mod = isMac ? '⌘' : 'Ctrl';
  const shift = isMac ? '⇧' : 'Shift';
  return {
    whatToAnswer: [mod, '1'],
    autoAnswerMode: [mod, 'f'],
    clarify: [mod, '2'],
    dynamicAction4: [mod, '3'],
    followUp: [mod, '4'],
    recap: [],
    scrollUp: [mod, '↑'],
    scrollDown: [mod, '↓'],
    scrollLeft: [mod, isMac ? '⌥' : 'Alt', '←'],
    scrollRight: [mod, isMac ? '⌥' : 'Alt', '→'],
    focusInput: [mod, shift, 'Space'],
    moveWindowUp: [mod, shift, '↑'],
    moveWindowDown: [mod, shift, '↓'],
    moveWindowLeft: [mod, shift, '←'],
    moveWindowRight: [mod, shift, '→'],
    toggleVisibility: [mod, 'B'],
    processScreenshots: [mod, 'Enter'],
    captureAndProcess: [mod, shift, 'Enter'],
    resetCancel: [mod, 'R'],
    takeScreenshot: [mod, 'H'],
  };
}

export const useShortcuts = () => {
  const [shortcuts, setShortcuts] = useState<ShortcutConfig>(
    buildDefaultShortcuts
  );

  const mapBackendToFrontend = useCallback((backendKeybinds: any[]) => {
    setShortcuts((prev) => {
      const newShortcuts: any = { ...prev };

      backendKeybinds.forEach((kb) => {
        const keys = acceleratorToKeys(kb.accelerator);
        const frontendId = BACKEND_TO_FRONTEND_SHORTCUT[kb.id];

        if (frontendId) newShortcuts[frontendId] = keys;
      });

      return newShortcuts;
    });
  }, []);

  useEffect(() => {
    const fetchKeybinds = async () => {
      try {
        const keybinds = await window.electronAPI.getKeybinds();
        mapBackendToFrontend(keybinds);
      } catch (error) {
        console.error('Failed to fetch keybinds:', error);
      }
    };

    fetchKeybinds();

    const unsubscribe = window.electronAPI.onKeybindsUpdate((keybinds) => {
      mapBackendToFrontend(keybinds);
    });

    return unsubscribe;
  }, [mapBackendToFrontend]);

  const updateShortcut = useCallback(
    async (actionId: keyof ShortcutConfig, keys: string[]) => {
      setShortcuts((prev) => ({ ...prev, [actionId]: keys }));

      const accelerator = keysToAccelerator(keys);
      const backendId = FRONTEND_TO_BACKEND_SHORTCUT[actionId];

      if (backendId) {
        try {
          await window.electronAPI.setKeybind(backendId, accelerator);
        } catch (error) {
          console.error(`Failed to set keybind for ${actionId}:`, error);
        }
      }
    },
    []
  );

  const resetShortcuts = useCallback(async () => {
    try {
      const defaults = await window.electronAPI.resetKeybinds();
      mapBackendToFrontend(defaults);
    } catch (error) {
      console.error('Failed to reset keybinds:', error);
    }
  }, [mapBackendToFrontend]);

  const isShortcutPressed = useCallback(
    (
      event: KeyboardEvent | React.KeyboardEvent,
      actionId: keyof ShortcutConfig
    ): boolean => {
      const keys = shortcuts[actionId];
      if (!keys || keys.length === 0) return false;

      // Electron accelerators collapse CommandOrControl differently by platform.
      const isCommandOrControl = (k: string) =>
        ['⌘', 'Command', 'Meta', 'CommandOrControl'].includes(k);
      const isCtrl = (k: string) => ['⌃', 'Control', 'Ctrl'].includes(k);

      const hasCommandOrControl = keys.some(isCommandOrControl);
      const hasCtrlOnly = !hasCommandOrControl && keys.some(isCtrl);
      const hasAlt = keys.some((k) => ['⌥', 'Alt', 'Option'].includes(k));
      const hasShift = keys.some((k) => ['⇧', 'Shift'].includes(k));

      if (isMac && event.metaKey !== hasCommandOrControl) return false;
      if (isMac && event.ctrlKey !== hasCtrlOnly) return false;
      const needsCtrl = hasCommandOrControl || hasCtrlOnly;
      if (!isMac && event.ctrlKey !== needsCtrl) return false;
      if (!isMac && event.metaKey) return false;
      if (event.altKey !== hasAlt) return false;
      if (event.shiftKey !== hasShift) return false;

      const mainKey = keys.find(
        (k) =>
          ![
            '⌘',
            'Command',
            'Meta',
            '⇧',
            'Shift',
            '⌥',
            'Alt',
            'Option',
            '⌃',
            'Control',
            'Ctrl',
          ].includes(k)
      );

      if (!mainKey) return false;

      const eventKey = event.key.toLowerCase();
      const configKey = ARROW_KEY_LABELS[mainKey] ?? mainKey.toLowerCase();

      if (configKey === 'space') {
        return event.code === 'Space';
      }

      return eventKey === configKey;
    },
    [shortcuts]
  );

  return {
    shortcuts,
    updateShortcut,
    resetShortcuts,
    isShortcutPressed,
  };
};
