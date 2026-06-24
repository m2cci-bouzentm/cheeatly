import React, { useState, useEffect } from 'react';
import {
  clampOverlayOpacity,
  OVERLAY_OPACITY_DEFAULT,
  OVERLAY_OPACITY_MIN,
  getDefaultOverlayOpacity,
} from '../../lib/overlayAppearance';

export const useOverlayOpacitySettings = (isOpen: boolean) => {
  const [overlayOpacity, setOverlayOpacity] = useState<number>(() => {
    const stored = localStorage.getItem('cheatly_overlay_opacity');
    const parsed = stored ? parseFloat(stored) : NaN;
    const isUserSet =
      Number.isFinite(parsed) && parsed !== OVERLAY_OPACITY_DEFAULT;
    return isUserSet ? clampOverlayOpacity(parsed) : getDefaultOverlayOpacity();
  });

  const [isPreviewingOpacity, setIsPreviewingOpacity] = useState(false);
  const [previewOverlayOpacity, setPreviewOverlayOpacity] =
    useState(overlayOpacity);

  const latestOpacityRef = React.useRef(overlayOpacity);

  const handleOpacityChange = (val: number) => {
    // DOM-direct updates for 0-lag 60fps drag (bypasses React reconciliation)
    const percentText = `${Math.round(val * 100)}%`;
    document
      .querySelectorAll('.opacity-percent-label')
      .forEach((el) => (el.textContent = percentText));
    setPreviewOverlayOpacity(val);
    latestOpacityRef.current = val;

    window.electronAPI.setOverlayOpacity(val);
  };

  useEffect(() => {
    latestOpacityRef.current = overlayOpacity;
    setPreviewOverlayOpacity(overlayOpacity);
  }, [overlayOpacity]);

  // Close-during-drag: if the overlay closes while the user is still dragging,
  // restore all DOM state so nothing is left in a broken state.
  useEffect(() => {
    if (!isOpen && isPreviewingOpacity) {
      stopPreviewingOpacity();
    }
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const startPreviewingOpacity = () => {
    // Guard against rapid repeated calls (double pointerDown / touch events)
    if (isPreviewingOpacity) return;

    // Direct DOM mutation for sub-millisecond instant hide (bypassing slow React tree diffs)
    document.body.classList.add('disable-transitions');

    const backdrop = document.getElementById('settings-backdrop');
    const wrapper = document.getElementById('settings-panel-wrapper');
    const panel = document.getElementById('settings-panel');
    const card = document.getElementById('opacity-slider-card');
    const mockup = document.getElementById('settings-mockup-wrapper');
    const launcher = document.getElementById('launcher-container');

    if (backdrop) {
      backdrop.style.backgroundColor = 'transparent';
      backdrop.style.backdropFilter = 'none';
      backdrop.style.transition = 'none';
    }
    if (wrapper) {
      wrapper.style.backgroundColor = 'transparent';
      wrapper.style.border = 'none';
      wrapper.style.boxShadow = 'none';
    }
    if (panel) {
      panel.style.visibility = 'hidden';
    }
    if (launcher) {
      launcher.style.visibility = 'hidden';
    }

    if (card) {
      card.style.visibility = 'visible';
      card.style.position = 'relative';
      card.style.zIndex = '9999';
    }
    if (mockup) {
      mockup.style.opacity = '1';
    }

    setPreviewOverlayOpacity(latestOpacityRef.current);
    setIsPreviewingOpacity(true);
  };

  const stopPreviewingOpacity = () => {
    // Direct DOM restoration
    document.body.classList.remove('disable-transitions');
    const backdrop = document.getElementById('settings-backdrop');
    const wrapper = document.getElementById('settings-panel-wrapper');
    const panel = document.getElementById('settings-panel');
    const card = document.getElementById('opacity-slider-card');
    const mockup = document.getElementById('settings-mockup-wrapper');
    const launcher = document.getElementById('launcher-container');

    if (backdrop) {
      backdrop.style.backgroundColor = '';
      backdrop.style.backdropFilter = '';
      backdrop.style.transition = '';
    }
    if (wrapper) {
      wrapper.style.backgroundColor = '';
      wrapper.style.border = '';
      wrapper.style.boxShadow = '';
    }
    if (panel) {
      panel.style.visibility = '';
    }
    if (launcher) {
      launcher.style.visibility = '';
    }

    if (card) {
      card.style.visibility = '';
      card.style.position = '';
      card.style.zIndex = '';
    }
    if (mockup) {
      // Restore mockup to hidden (opacity 0) rather than leaving it visible
      mockup.style.opacity = '0';
    }

    setIsPreviewingOpacity(false);
    // Sync final dragged value back to React state (persists to localStorage + IPC via useEffect)
    setOverlayOpacity(latestOpacityRef.current);
    setPreviewOverlayOpacity(latestOpacityRef.current);
  };

  useEffect(() => {
    // Only persist to localStorage here. IPC is handled real-time in handleOpacityChange
    // to avoid a redundant extra call 150ms after every drag ends.
    const timeoutId = setTimeout(() => {
      localStorage.setItem('cheatly_overlay_opacity', String(overlayOpacity));
    }, 150);
    return () => clearTimeout(timeoutId);
  }, [overlayOpacity]);

  return {
    overlayOpacity,
    setOverlayOpacity,
    isPreviewingOpacity,
    setIsPreviewingOpacity,
    previewOverlayOpacity,
    setPreviewOverlayOpacity,
    latestOpacityRef,
    handleOpacityChange,
    startPreviewingOpacity,
    stopPreviewingOpacity,
  };
};
export { OVERLAY_OPACITY_MIN };
