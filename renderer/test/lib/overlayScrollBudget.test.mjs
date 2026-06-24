import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  widthDerivedScrollMax,
  verticalScrollCap,
} from '../../lib/overlayScrollBudget.ts';

describe('overlayScrollBudget', () => {
  describe('widthDerivedScrollMax', () => {
    test('collapsed width → minHeight (320)', () => {
      assert.equal(widthDerivedScrollMax(600), 320);
    });
    test('expanded width → maxHeight (560)', () => {
      assert.equal(widthDerivedScrollMax(780), 560);
    });
    test('midpoint interpolates linearly', () => {
      assert.equal(widthDerivedScrollMax(690), 440);
    });
    test('clamps below collapsed and above expanded', () => {
      assert.equal(widthDerivedScrollMax(400), 320);
      assert.equal(widthDerivedScrollMax(900), 560);
    });
  });

  describe('verticalScrollCap', () => {
    test('returns Infinity when availHeight is unknown (SSR / not measured)', () => {
      assert.equal(
        verticalScrollCap({ availHeight: 0, chromeHeight: 200 }),
        Infinity
      );
      assert.equal(
        verticalScrollCap({ availHeight: NaN, chromeHeight: 200 }),
        Infinity
      );
    });

    test('budget = floor(availHeight*0.9) - safetyMargin - chrome', () => {
      // 900*0.9 = 810; -8 margin = 802; -300 chrome = 502
      assert.equal(
        verticalScrollCap({ availHeight: 900, chromeHeight: 300 }),
        502
      );
    });

    test('never collapses below minScroll on a very short display', () => {
      // 500*0.9=450; -8=442; chrome 400 → 42, floored to minScroll 120
      assert.equal(
        verticalScrollCap({
          availHeight: 500,
          chromeHeight: 400,
          minScroll: 120,
        }),
        120
      );
    });
  });

  test('scroll height uses smaller width and vertical budgets', () => {
    const widthBound = widthDerivedScrollMax(780);
    const verticalBound = verticalScrollCap({
      availHeight: 900,
      chromeHeight: 360,
    });
    const got = Math.min(widthBound, verticalBound);
    assert.equal(got, 442);
  });
});
