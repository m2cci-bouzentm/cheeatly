export function resolveCgEventTapAvailable(platform: string): boolean {
  return platform === 'darwin';
}

export function shouldBlockFocus({
  stealthAutoEngageOk,
  isCgEventTapAvailable,
  stealthTapActive,
}: {
  stealthAutoEngageOk: boolean;
  isCgEventTapAvailable: boolean;
  stealthTapActive: boolean;
}): boolean {
  if (!stealthAutoEngageOk) return false;
  if (!isCgEventTapAvailable) return false;
  if (!stealthTapActive) return false;
  return true;
}

export function shouldFireStealthTapStart({
  stealthTapActive,
  stealthAutoEngageOk,
  isStealthEngageTarget,
}: {
  stealthTapActive: boolean;
  stealthAutoEngageOk: boolean;
  isStealthEngageTarget: boolean;
}): boolean {
  if (stealthTapActive) return false;
  if (!stealthAutoEngageOk) return false;
  if (!isStealthEngageTarget) return false;
  return true;
}
