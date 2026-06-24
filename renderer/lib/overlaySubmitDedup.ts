function normalizeSubmitText(text: string): string {
  return text
    .trim()
    .replace(/\s+/g, ' ');
}

export function shouldDedupeManualSubmit({
  text,
  lastText,
  lastAtMs,
  nowMs,
  windowMs = 5000,
}: {
  text: string;
  lastText: string | null;
  lastAtMs: number | null;
  nowMs: number;
  windowMs?: number;
}): boolean {
  const norm = normalizeSubmitText(text);
  if (!norm) return false;
  if (lastText == null || lastAtMs == null) return false;
  if (nowMs - lastAtMs > windowMs) return false;
  return normalizeSubmitText(lastText) === norm;
}
