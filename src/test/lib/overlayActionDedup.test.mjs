import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  collapseConsecutiveDuplicateAssistantMessages,
  shouldDedupeOverlayAction,
} from '../../lib/overlayActionDedup.ts';

describe('overlayActionDedup', () => {
  test('shouldDedupeOverlayAction returns false with no prior action', () => {
    assert.equal(
      shouldDedupeOverlayAction({
        actionKey: 'clarify',
        lastActionKey: null,
        lastAtMs: null,
        nowMs: 10000,
      }),
      false
    );
  });

  test('shouldDedupeOverlayAction returns true for same action inside window', () => {
    assert.equal(
      shouldDedupeOverlayAction({
        actionKey: 'clarify',
        lastActionKey: 'clarify',
        lastAtMs: 5000,
        nowMs: 7000,
        windowMs: 5000,
      }),
      true
    );
  });

  test('shouldDedupeOverlayAction normalizes action casing and whitespace', () => {
    assert.equal(
      shouldDedupeOverlayAction({
        actionKey: '  Clarify  ',
        lastActionKey: 'clarify',
        lastAtMs: 5000,
        nowMs: 7000,
      }),
      true
    );
  });

  test('shouldDedupeOverlayAction returns false for different actions', () => {
    assert.equal(
      shouldDedupeOverlayAction({
        actionKey: 'clarify',
        lastActionKey: 'brainstorm',
        lastAtMs: 9000,
        nowMs: 10000,
      }),
      false
    );
  });

  test('shouldDedupeOverlayAction returns false after window expires', () => {
    assert.equal(
      shouldDedupeOverlayAction({
        actionKey: 'clarify',
        lastActionKey: 'clarify',
        lastAtMs: 1000,
        nowMs: 7000,
        windowMs: 5000,
      }),
      false
    );
  });

  test('collapseConsecutiveDuplicateAssistantMessages removes adjacent duplicates', () => {
    const input = [
      {
        id: '1',
        role: 'assistant',
        parts: [{ type: 'text', text: 'Same clarify?' }],
      },
      {
        id: '2',
        role: 'assistant',
        parts: [{ type: 'text', text: 'Same clarify?' }],
      },
      { id: '3', role: 'user', parts: [{ type: 'text', text: 'hello' }] },
      {
        id: '4',
        role: 'assistant',
        parts: [{ type: 'text', text: 'Same clarify?' }],
      },
    ];
    const out = collapseConsecutiveDuplicateAssistantMessages(
      input,
      (message) => message.parts[0]?.text ?? ''
    );
    assert.equal(out.length, 3);
    assert.equal(out[0].id, '1');
    assert.equal(out[1].id, '3');
    assert.equal(out[2].id, '4');
  });

  test('collapseConsecutiveDuplicateAssistantMessages keeps non-adjacent answers', () => {
    const duplicateText =
      'You should mention your leadership on the migration project.';
    const input = [
      {
        id: 'w1',
        role: 'assistant',
        parts: [{ type: 'text', text: duplicateText }],
      },
      { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'What?' }] },
      {
        id: 'c1',
        role: 'assistant',
        parts: [{ type: 'text', text: 'Let me help with that.' }],
      },
      {
        id: 'w2',
        role: 'assistant',
        parts: [{ type: 'text', text: duplicateText }],
      },
    ];
    const out = collapseConsecutiveDuplicateAssistantMessages(
      input,
      (message) => message.parts[0]?.text ?? ''
    );
    assert.equal(out.length, 4);
    assert.deepEqual(
      out
        .filter((message) => message.parts[0]?.text === duplicateText)
        .map((message) => message.id),
      ['w1', 'w2']
    );
  });
});
