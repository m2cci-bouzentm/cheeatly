// Renderer-only first-run flags can tolerate showing again after storage wipes.

const PERMS_TOASTER_KEY = 'cheatly_perms_shown_v1';

export function hasSeenPermsToaster(): boolean {
  try {
    return localStorage.getItem(PERMS_TOASTER_KEY) === '1';
  } catch {
    return false;
  }
}

export function markPermsToasterSeen(): void {
  try {
    localStorage.setItem(PERMS_TOASTER_KEY, '1');
  } catch {
    /* storage unavailable — toaster may show again next launch */
  }
}
