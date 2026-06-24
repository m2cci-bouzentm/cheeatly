import { app, desktopCapturer, systemPreferences } from 'electron';
import { withTimeout } from './logger';

export async function ensureMacMicrophoneAccess(
  context: string
): Promise<boolean> {
  if (process.platform !== 'darwin') return true;

  try {
    const currentStatus = systemPreferences.getMediaAccessStatus('microphone');
    console.log(
      `[Main] macOS microphone permission before ${context}: ${currentStatus}`
    );

    if (currentStatus === 'granted') {
      return true;
    }

    const granted = await systemPreferences.askForMediaAccess('microphone');
    console.log(
      `[Main] macOS microphone permission request during ${context}: ${granted ? 'granted' : 'denied'}`
    );
    return granted;
  } catch (error) {
    console.error(
      `[Main] Failed to check macOS microphone permission during ${context}:`,
      error
    );
    return false;
  }
}

// Electron cannot prompt for Screen Recording directly; denied must route to Settings.
type MacScreenCaptureStatus =
  | 'granted'
  | 'denied'
  | 'not-determined'
  | 'restricted';

type MacScreenCaptureCapability = {
  status: MacScreenCaptureStatus;
  capturable: boolean;
  effectiveDenied: boolean;
  sourceCount: number;
  message?: string;
  error?: string;
};

let latestSystemAudioPermissionWarning: string | null = null;

const MAC_PLATFORM = 'darwin';
const SCREEN_CAPTURE_GRANTED: MacScreenCaptureStatus = 'granted';
const SCREEN_CAPTURE_DENIED: MacScreenCaptureStatus = 'denied';
const SCREEN_CAPTURE_RESTRICTED: MacScreenCaptureStatus = 'restricted';
const SCREEN_CAPTURE_NOT_DETERMINED: MacScreenCaptureStatus = 'not-determined';
const DEV_TCC_BYPASS_MESSAGE =
  '[Main] Dev TCC bypass enabled (CHEATLY_DEV_BYPASS_SCREEN_TCC=1) — reporting screen capture as granted';
const SCREEN_RECORDING_RESTRICTED_REASON = 'mac-screen-recording-restricted';
const SCREEN_RECORDING_DENIED_REASON = 'screen-recording-denied';
const SCREEN_CAPTURE_PROBE_TIMEOUT_PREFIX = 'screen-capture-probe-timeout-';
const SCREEN_CAPTURE_PROBE_TIMEOUT_TOKEN = 'screen-capture-probe-timeout';
const SCREEN_CAPTURE_PROBE_TIMEOUT_SUFFIX = ' (probe timed out)';
const DEV_TCC_BYPASS_ENABLED_VALUE = '1';
const SCREEN_MEDIA_TYPE = 'screen';
const SCREEN_SOURCE_ID_PREFIX = 'screen:';
const SCREEN_CAPTURE_PERMISSION_ERROR_MESSAGE =
  '[Main] Failed to check screen recording permission:';

function rememberSystemAudioPermissionWarning(message: string): void {
  latestSystemAudioPermissionWarning = message;
}

function clearSystemAudioPermissionWarning(): void {
  latestSystemAudioPermissionWarning = null;
}

function logDeniedButCapturable(context: string): void {
  console.warn(
    `[Main] Screen Recording status is denied during ${context}, but capture probe succeeded; continuing without permission banner.`
  );
}

function logProbeTimedOut(context: string): void {
  console.warn(
    `[Main] Screen Recording capture probe timed out during ${context} — treating as denied.`
  );
}

function logProbeFailed(context: string, errorMessage: string): void {
  console.warn(
    `[Main] Screen Recording capture probe failed during ${context}: ${errorMessage}`
  );
}

// Opt-in only (CHEATLY_DEV_BYPASS_SCREEN_TCC=1): force-reports screen
// capture as 'granted' so unsigned dev builds skip TCC friction. Never the
// default — the normal dev path must expose real TCC failures, or we go
// diagnostically blind to the permission bugs users actually hit.
function isDevTccBypassEnabled(): boolean {
  return (
    !app.isPackaged &&
    process.env.CHEATLY_DEV_BYPASS_SCREEN_TCC === DEV_TCC_BYPASS_ENABLED_VALUE
  );
}

function getMacScreenCaptureStatus(): MacScreenCaptureStatus {
  if (process.platform !== MAC_PLATFORM) return SCREEN_CAPTURE_GRANTED;

  if (isDevTccBypassEnabled()) {
    console.log(DEV_TCC_BYPASS_MESSAGE);
    return SCREEN_CAPTURE_GRANTED;
  }

  try {
    return systemPreferences.getMediaAccessStatus(
      SCREEN_MEDIA_TYPE
    ) as MacScreenCaptureStatus;
  } catch (error) {
    console.error(SCREEN_CAPTURE_PERMISSION_ERROR_MESSAGE, error);
    return SCREEN_CAPTURE_NOT_DETERMINED;
  }
}

async function resolveMacScreenCaptureCapability(
  context: string
): Promise<MacScreenCaptureCapability> {
  const status = getMacScreenCaptureStatus();

  const isMac = process.platform === MAC_PLATFORM;
  // Mirror the opt-in bypass policy used by getMacScreenCaptureStatus().
  if (!isMac || isDevTccBypassEnabled()) {
    clearSystemAudioPermissionWarning();
    return { status, capturable: true, effectiveDenied: false, sourceCount: 0 };
  }

  if (isMac && status === SCREEN_CAPTURE_RESTRICTED) {
    const message = formatPermissionMessage(SCREEN_RECORDING_RESTRICTED_REASON);
    rememberSystemAudioPermissionWarning(message);
    return {
      status,
      capturable: false,
      effectiveDenied: true,
      sourceCount: 0,
      message,
    };
  }

  if (status !== SCREEN_CAPTURE_DENIED) {
    clearSystemAudioPermissionWarning();
    return { status, capturable: true, effectiveDenied: false, sourceCount: 0 };
  }

  try {
    const sources = await withTimeout(
      desktopCapturer.getSources({
        types: [SCREEN_MEDIA_TYPE],
        thumbnailSize: { width: 1, height: 1 },
      }),
      5000,
      SCREEN_CAPTURE_PROBE_TIMEOUT_PREFIX + context
    );
    const sourceCount = sources.filter((source) =>
      source.id.startsWith(SCREEN_SOURCE_ID_PREFIX)
    ).length;
    const capturable = sourceCount > 0;

    if (capturable) {
      clearSystemAudioPermissionWarning();
      logDeniedButCapturable(context);
    }
    if (!capturable) {
      rememberSystemAudioPermissionWarning(
        formatPermissionMessage(SCREEN_RECORDING_DENIED_REASON)
      );
    }

    return { status, capturable, effectiveDenied: !capturable, sourceCount };
  } catch (error: any) {
    if (error?.message?.includes(SCREEN_CAPTURE_PROBE_TIMEOUT_TOKEN)) {
      const message = formatPermissionMessage(SCREEN_RECORDING_DENIED_REASON);
      rememberSystemAudioPermissionWarning(
        message + SCREEN_CAPTURE_PROBE_TIMEOUT_SUFFIX
      );
      logProbeTimedOut(context);
      return {
        status,
        capturable: false,
        effectiveDenied: true,
        sourceCount: 0,
        message,
        error: error.message,
      };
    }
    const errorMessage = error instanceof Error ? error.message : String(error);
    const message = formatPermissionMessage(SCREEN_RECORDING_DENIED_REASON);
    rememberSystemAudioPermissionWarning(message);
    logProbeFailed(context, errorMessage);
    return {
      status,
      capturable: false,
      effectiveDenied: true,
      sourceCount: 0,
      message,
      error: errorMessage,
    };
  }
}

// `mac-*` variants must stay darwin-gated so Windows never gets TCC copy.
type PermissionReason =
  | 'screen-recording-denied'
  | 'mac-screen-recording-restricted'
  | 'mac-screen-recording-revoked-rebuild'
  | 'mic-denied'
  | 'mic-zero-fill'
  | 'mac-same-device-input-output'
  | 'system-audio-stuck';
export function formatPermissionMessage(
  reason: PermissionReason,
  extra?: { device?: string }
): string {
  const isMac = process.platform === 'darwin';
  switch (reason) {
    case 'screen-recording-denied':
      return isMac
        ? 'Screen Recording permission denied. Interviewer audio will not be captured. Enable in System Settings → Privacy & Security → Screen Recording, then restart the app.'
        : 'System audio capture is unavailable. Interviewer audio will not be captured. Check your audio device routing in Settings and restart the meeting.';
    case 'mac-screen-recording-restricted':
      if (!isMac) return formatPermissionMessage('system-audio-stuck');
      return 'Screen Recording is restricted by device policy. Interviewer audio will not be captured. Contact your administrator to allow screen capture for Cheatly.';
    case 'mac-screen-recording-revoked-rebuild':
      if (!isMac) return formatPermissionMessage('system-audio-stuck');
      return 'System audio is being captured but every sample is silent. This usually means macOS Screen Recording permission needs to be re-granted to this build of Cheatly. Open System Settings → Privacy & Security → Screen Recording, toggle Cheatly off and back on, then restart the app. (If you recently rebuilt or updated, the previous grant may not apply.)';
    case 'mic-denied':
      return isMac
        ? 'Microphone access denied. Please allow microphone access in System Settings → Privacy & Security → Microphone, then restart Cheatly.'
        : 'Microphone access denied. Please allow microphone access in Settings → Privacy → Microphone, then restart Cheatly.';
    case 'mic-zero-fill':
      return isMac
        ? 'Microphone is producing silent audio. Check that the device is unmuted and that macOS Microphone permission is granted to Cheatly in System Settings → Privacy & Security → Microphone.'
        : 'Microphone is producing silent audio. Check that the device is unmuted and that Cheatly has microphone access in Settings → Privacy → Microphone.';
    case 'mac-same-device-input-output':
      if (!isMac) return formatPermissionMessage('system-audio-stuck');
      return `Silent capture detected — input and output are the same device (${extra?.device ?? 'unknown'}). macOS cannot tap a device while it is also the active microphone. Switch input to built-in mic or output to built-in speakers.`;
    case 'system-audio-stuck':
      return 'No audio detected on system output for 8s. If your meeting app is using a different output device (Bluetooth headset, virtual cable, second monitor), switch it to your default output, or restart the meeting after switching.';
  }
}

export function getSystemAudioPermissionWarning(): string | null {
  return latestSystemAudioPermissionWarning;
}

export { isDevTccBypassEnabled, resolveMacScreenCaptureCapability };
