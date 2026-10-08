// The main process clamps overlay windows to 90% screen height; cap chat scroll
// by remaining vertical budget so the footer never falls outside that clamp.

import { clamp } from './mathUtils.ts';

export interface WidthDerivedScrollMaxOpts {
  collapsedWidth?: number;
  expandedWidth?: number;
  minHeight?: number;
  maxHeight?: number;
}

export function widthDerivedScrollMax(
  width: number,
  opts: WidthDerivedScrollMaxOpts = {}
): number {
  const {
    collapsedWidth = 600,
    expandedWidth = 780,
    minHeight = 320,
    maxHeight = 560,
  } = opts;
  if (expandedWidth <= collapsedWidth) return maxHeight;
  const t = clamp(
    (width - collapsedWidth) / (expandedWidth - collapsedWidth),
    0,
    1
  );
  return minHeight + t * (maxHeight - minHeight);
}

export interface VerticalScrollCapParams {
  availHeight: number;
  chromeHeight: number;
  budgetRatio?: number;
  safetyMargin?: number;
  minScroll?: number;
}

export function verticalScrollCap(params: VerticalScrollCapParams): number {
  const {
    availHeight,
    chromeHeight,
    budgetRatio = 0.9,
    safetyMargin = 8,
    minScroll = 120,
  } = params;
  if (!Number.isFinite(availHeight) || availHeight <= 0) return Infinity;
  if (!Number.isFinite(chromeHeight) || chromeHeight < 0) return Infinity;
  const budget = Math.floor(availHeight * budgetRatio) - safetyMargin;
  return Math.max(budget - chromeHeight, minScroll);
}
