function normalizeActionKey(actionKey: string): string {
  return actionKey
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

export function shouldDedupeOverlayAction({
  actionKey,
  lastActionKey,
  lastAtMs,
  nowMs,
  windowMs = 5000,
}: {
  actionKey: string;
  lastActionKey: string | null;
  lastAtMs: number | null;
  nowMs: number;
  windowMs?: number;
}): boolean {
  const norm = normalizeActionKey(actionKey);
  if (!norm) return false;
  if (lastActionKey == null || lastAtMs == null) return false;
  if (nowMs - lastAtMs > windowMs) return false;
  return normalizeActionKey(lastActionKey) === norm;
}

// Last-resort collapse for duplicate assistant messages.
export function collapseConsecutiveDuplicateAssistantMessages<
  T extends { role: string; parts: Array<{ type?: string; text?: string }> },
>(messages: T[], getText: (m: T) => string): T[] {
  if (messages.length === 0) return messages;
  const out = [messages[0]];
  for (let i = 1; i < messages.length; i++) {
    const prev = out[out.length - 1];
    const cur = messages[i];
    if (
      prev.role === 'assistant' &&
      cur.role === 'assistant' &&
      getText(prev) === getText(cur)
    ) {
      continue;
    }
    out.push(cur);
  }
  return out;
}
