import type { AudioService } from './AudioService';
import { SystemAudioCapture } from './native/SystemAudioCapture';
import { MicrophoneCapture } from './native/MicrophoneCapture';
import { AudioDevices } from './native/AudioDevices';
import { loadNativeModule } from './native/nativeModuleLoader';
import {
  resolveMacScreenCaptureCapability,
  formatPermissionMessage,
} from '../../utils/permissions';

// Renderer needs requested-vs-actual devices when saved hardware falls back silently.
export function broadcastDeviceSelectionImpl(
  this: AudioService,
  payload: {
    kind: 'input' | 'output';
    requested: string | null;
    actual: string | null;
    fellBack: boolean;
    reason?: string;
  }
): void {
  console.log(`[Main] device-selection-applied:`, payload);
  this.sendToSettingsSurfaces('device-selection-applied', payload);
}

// Persisted "default" must behave like no preference for watchers, comparisons, and recovery.
export function normalizeDeviceIdImpl(
  this: AudioService,
  id: string | null | undefined
): string | undefined {
  if (!id) return undefined;
  const trimmed = id.trim();
  if (!trimmed) return undefined;
  if (trimmed.toLowerCase() === 'default') return undefined;
  return trimmed;
}

// Input and output IDs use different naming schemes, so compare friendly names too.
export function detectSameInputOutputDeviceImpl(
  this: AudioService
): string | undefined {
  return this.checkSameInputOutputDevice(
    this._lastRequestedInputDeviceId,
    this._lastRequestedOutputDeviceId
  );
}

// reconfigureAudio must check the incoming request before mutating cached IDs.
export function checkSameInputOutputDeviceImpl(
  this: AudioService,
  inputId?: string,
  outputId?: string
): string | undefined {
  if (!inputId || !outputId) return undefined;

  // One Bluetooth device can appear with both CoreAudio suffixes.
  const stripSuffix = (s: string) => s.replace(/:(input|output)$/i, '');
  const inputBase = stripSuffix(inputId).toLowerCase();
  const outputBase = stripSuffix(outputId).toLowerCase();
  if (inputBase === outputBase) {
    return stripSuffix(inputId);
  }

  try {
    const outputName = this.getEffectiveOutputDeviceName(outputId);
    if (outputName && outputName.toLowerCase() === inputId.toLowerCase()) {
      return outputName;
    }
  } catch {}
  return undefined;
}

// HFP checks need the friendly current route without pinning persisted Default to a concrete ID.
export function getEffectiveOutputDeviceNameImpl(
  this: AudioService,
  outputDeviceId?: string
): string {
  const stripSuffix = (s: string) => s.replace(/:(input|output)$/i, '');

  try {
    const outputs = AudioDevices.getOutputDevices();
    const resolveOutputName = (id?: string): string => {
      if (!id) return '';
      const outputBase = stripSuffix(id).toLowerCase();
      return (
        outputs.find((d) => stripSuffix(d.id).toLowerCase() === outputBase)
          ?.name ?? ''
      );
    };

    const explicitName = resolveOutputName(outputDeviceId);
    if (explicitName) return explicitName;

    const NativeModule: any = loadNativeModule();
    if (
      NativeModule &&
      typeof NativeModule.getDefaultOutputDeviceId === 'function'
    ) {
      const defaultOutputId =
        NativeModule.getDefaultOutputDeviceId() || undefined;
      return resolveOutputName(defaultOutputId);
    }
    return '';
  } catch {
    return '';
  }
}

// Built-in mics avoid Bluetooth aggregate conflicts that can silence system audio capture.
export function pickFallbackInputDeviceImpl(
  this: AudioService,
  conflictingName: string
): { id: string; name: string } | undefined {
  try {
    const inputs = AudioDevices.getInputDevices();
    if (!inputs?.length) return undefined;

    const stripSuffix = (s: string) => s.replace(/:(input|output)$/i, '');
    const conflictBase = stripSuffix(conflictingName).toLowerCase();
    const isConflicting = (d: { id: string; name: string }) =>
      stripSuffix(d.id).toLowerCase() === conflictBase ||
      d.name.toLowerCase() === conflictBase;
    // Apple varies built-in mic names across hardware.
    const isBuiltIn = (d: { id: string; name: string }) =>
      /macbook|built[- ]?in|imac|mac\s+studio|mac\s+mini/i.test(d.name);

    return (
      inputs.find((d) => !isConflicting(d) && isBuiltIn(d)) ??
      inputs.find((d) => !isConflicting(d))
    );
  } catch {
    return undefined;
  }
}

// Mirrors Rust normalization so input/output views of one device compare equal.
export function normalizeDeviceNameImpl(
  this: AudioService,
  name: string
): string {
  return name
    .replace(/:(input|output)$/i, '')
    .replace(/[–—−]/g, '-')
    .trim()
    .toLowerCase();
}

// cpal/CoreAudio do not expose transport type; HFP avoidance is name-based.
export function isBluetoothInputNameImpl(
  this: AudioService,
  name: string
): boolean {
  const n = this.normalizeDeviceName(name);
  if (!n) return false;
  if (n.includes('hands-free') || n.includes('handsfree') || n.includes('(hfp'))
    return true;
  const families = [
    'airpods',
    'beats',
    'bose',
    'sony wh',
    'sony wf',
    'wh-1000',
    'wf-1000',
    'jabra',
    'galaxy buds',
    'pixel buds',
    'soundcore',
    'jbl',
    'sennheiser',
    'momentum',
    'oneplus',
    'one plus',
    'buds',
    'earbuds',
    'earbud',
    'tws',
    'bluetooth',
  ];
  return families.some((f) => n.includes(f));
}

export function findBuiltInInputDeviceImpl(
  this: AudioService
): { id: string; name: string } | undefined {
  try {
    const builtIn = AudioDevices.getInputDevices().find((d) =>
      /macbook|built[- ]?in|imac|mac\s+studio|mac\s+mini|internal/i.test(d.name)
    );
    return builtIn ? { id: builtIn.id, name: builtIn.name } : undefined;
  } catch {
    return undefined;
  }
}

function resolveSameDeviceInputConflict(
  service: AudioService,
  wantedInput: string | undefined,
  wantedOutput: string | undefined
) {
  if (!wantedInput || !wantedOutput)
    return { wantedInput, micAutoSwitched: false };

  const conflict = service.checkSameInputOutputDevice(
    wantedInput,
    wantedOutput
  );
  if (!conflict) return { wantedInput, micAutoSwitched: false };

  const fallback = service.pickFallbackInputDevice(conflict);
  if (!fallback) {
    console.warn(
      `[Main] I/O conflict detected (${conflict}) but no alternate input available — system audio will likely be silent.`
    );
    return { wantedInput, micAutoSwitched: false };
  }

  console.warn(
    `[Main] I/O conflict detected (${conflict} on both sides). Auto-switching mic to "${fallback.name}".`
  );
  service.appBroadcast('audio-input-auto-switched', {
    from: conflict,
    to: fallback.name,
    reason: 'same-device-conflict',
  });
  return {
    wantedInput: service.normalizeDeviceId(fallback.id),
    micAutoSwitched: true,
  };
}

function avoidBluetoothHfpInput(
  service: AudioService,
  wantedInput: string | undefined,
  wantedOutput: string | undefined,
  micAutoSwitched: boolean
) {
  if (micAutoSwitched) return { wantedInput, micAutoSwitched };

  try {
    const inputs = AudioDevices.getInputDevices();
    const explicitName = wantedInput
      ? (inputs.find((d) => d.id === wantedInput)?.name ?? '')
      : '';
    const inputIsExplicitBt =
      !!explicitName && service.isBluetoothInputName(explicitName);
    const outputName = service.getEffectiveOutputDeviceName(wantedOutput);
    const outputIsBt = !!outputName && service.isBluetoothInputName(outputName);
    const outputResolutionUnknown = !!wantedOutput && !outputName;
    const inputIsDefault = !wantedInput;
    const willBeHfp =
      inputIsExplicitBt ||
      (inputIsDefault && (outputIsBt || outputResolutionUnknown));
    if (!willBeHfp) return { wantedInput, micAutoSwitched };

    const fromLabel = inputIsExplicitBt
      ? explicitName
      : outputName || 'Bluetooth mic';
    const builtIn = service.findBuiltInInputDevice();
    const autoSwitchInput =
      builtIn &&
      service.normalizeDeviceName(builtIn.name) !==
        service.normalizeDeviceName(fromLabel)
        ? builtIn
        : undefined;
    if (!autoSwitchInput && !builtIn)
      console.warn(
        `[Main] Bluetooth mic ("${fromLabel}") will run in HFP — no built-in mic available to switch to.`
      );
    if (!autoSwitchInput) {
      return { wantedInput, micAutoSwitched };
    }

    console.warn(
      `[Main] Bluetooth mic ("${fromLabel}") would force HFP (low quality). Auto-switching mic to "${autoSwitchInput.name}" to keep it in A2DP.`
    );
    service.appBroadcast('audio-input-auto-switched', {
      from: fromLabel,
      to: autoSwitchInput.name,
      reason: 'bluetooth-hfp-avoided',
    });
    return {
      wantedInput: service.normalizeDeviceId(autoSwitchInput.id),
      micAutoSwitched: true,
    };
  } catch (e) {
    console.warn('[Main] HFP avoidance check failed (non-fatal):', e);
    return { wantedInput, micAutoSwitched };
  }
}

export async function reconfigureAudioImpl(
  this: AudioService,
  inputDeviceId?: string | null,
  outputDeviceId?: string | null
): Promise<void> {
  console.log(
    `[Main] Reconfiguring Audio: Input=${inputDeviceId}, Output=${outputDeviceId}`
  );

  // Recreating unchanged captures costs 50-200ms and can contend with native devices.
  let wantedInput = this.normalizeDeviceId(inputDeviceId);
  const wantedOutput = this.normalizeDeviceId(outputDeviceId);

  // Same hardware for mic+output can zero system audio; resolve before skip-if-unchanged.
  const sameDeviceResolution = resolveSameDeviceInputConflict(
    this,
    wantedInput,
    wantedOutput
  );
  wantedInput = sameDeviceResolution.wantedInput;
  let micAutoSwitched = sameDeviceResolution.micAutoSwitched;

  // Bluetooth mics force HFP call mode; default mic must be inferred from output route.
  const hfpAvoidance = avoidBluetoothHfpInput(
    this,
    wantedInput,
    wantedOutput,
    micAutoSwitched
  );
  wantedInput = hfpAvoidance.wantedInput;
  micAutoSwitched = hfpAvoidance.micAutoSwitched;

  if (
    this.systemAudioCapture &&
    this.microphoneCapture &&
    this._lastRequestedInputDeviceId === wantedInput &&
    this._lastRequestedOutputDeviceId === wantedOutput
  ) {
    console.log('[Main] Audio reconfigure skipped — device IDs unchanged.');
    return;
  }

  // Recovery must recreate the possibly fallback-overridden selection.
  this._lastRequestedInputDeviceId = wantedInput;
  this._lastRequestedOutputDeviceId = wantedOutput;
  this._micRecoveryAttempts = 0;

  if (this.systemAudioCapture) {
    // destroy() removes listeners; stop()+null can leak callbacks into the next meeting.
    const oldSystemAudioCapture = this.systemAudioCapture;
    this.systemAudioCapture = null;
    await oldSystemAudioCapture.destroy();
  }

  const screenCapability =
    await resolveMacScreenCaptureCapability('audio reconfigure');
  if (screenCapability.effectiveDenied) {
    const message =
      screenCapability.message ??
      formatPermissionMessage('screen-recording-denied');
    console.warn(
      '[Main] Skipping SystemAudioCapture reconfigure — Screen Recording permission denied. Meeting will run mic-only.'
    );
    this.sendSystemAudioPermissionDenied(message);
    this.broadcastDeviceSelection({
      kind: 'output',
      requested: wantedOutput || null,
      actual: null,
      fellBack: true,
      reason: 'screen-recording-permission-denied',
    });
  }
  if (!screenCapability.effectiveDenied) {
    try {
      console.log('[Main] Initializing SystemAudioCapture...');
      this.systemAudioCapture = new SystemAudioCapture(wantedOutput);
      this._sysSttRateApplied = false;
      this.wireSystemCapture(this.systemAudioCapture, '(Reconfigured)');
      console.log('[Main] SystemAudioCapture initialized.');
      this.broadcastDeviceSelection({
        kind: 'output',
        requested: wantedOutput || null,
        actual: wantedOutput || 'default',
        fellBack: false,
      });
    } catch (err) {
      console.warn(
        '[Main] Failed to initialize SystemAudioCapture with preferred ID. Falling back to default.',
        err
      );
      try {
        this.systemAudioCapture = new SystemAudioCapture();
        this._sysSttRateApplied = false;
        this.wireSystemCapture(this.systemAudioCapture, '(Default)');
        this.broadcastDeviceSelection({
          kind: 'output',
          requested: wantedOutput || null,
          actual: 'default',
          fellBack: true,
          reason: (err as Error)?.message || 'unknown',
        });
      } catch (err2) {
        console.error(
          '[Main] Failed to initialize SystemAudioCapture (Default):',
          err2
        );
        this.broadcastDeviceSelection({
          kind: 'output',
          requested: wantedOutput || null,
          actual: null,
          fellBack: true,
          reason: `Both preferred and default failed: ${(err2 as Error)?.message || 'unknown'}`,
        });
      }
    }
  }

  if (this.microphoneCapture) {
    const oldMicrophoneCapture = this.microphoneCapture;
    this.microphoneCapture = null;
    await oldMicrophoneCapture.destroy();
  }

  try {
    console.log('[Main] Initializing MicrophoneCapture...');
    this.microphoneCapture = new MicrophoneCapture(wantedInput);
    this._micSttRateApplied = false;
    this.wireMicCapture(this.microphoneCapture, '(Reconfigured)');
    console.log('[Main] MicrophoneCapture initialized.');
    this.broadcastDeviceSelection({
      kind: 'input',
      requested: wantedInput || null,
      actual: wantedInput || 'default',
      fellBack: false,
    });
  } catch (err) {
    console.warn(
      '[Main] Failed to initialize MicrophoneCapture with preferred ID. Falling back to default.',
      err
    );
    try {
      this.microphoneCapture = new MicrophoneCapture();
      this._micSttRateApplied = false;
      this.wireMicCapture(this.microphoneCapture, '(Default)');
      this.broadcastDeviceSelection({
        kind: 'input',
        requested: wantedInput || null,
        actual: 'default',
        fellBack: true,
        reason: (err as Error)?.message || 'unknown',
      });
    } catch (err2) {
      // Preferred and default can point at the same failing Bluetooth-HFP mic.
      console.warn(
        '[Main] Default mic also failed. Enumerating remaining input devices to try each.',
        err2
      );
      const tried = new Set<string>(
        [wantedInput ?? '', 'default'].filter(Boolean)
      );
      const candidates = AudioDevices.getInputDevices()
        .map((d) => d.id)
        .filter((id) => id && !tried.has(id));
      let success = false;
      let lastErr: unknown = err2;
      for (const candidateId of candidates) {
        try {
          console.log(`[Main] Trying mic fallback candidate: ${candidateId}`);
          this.microphoneCapture = new MicrophoneCapture(candidateId);
          this._micSttRateApplied = false;
          this.wireMicCapture(
            this.microphoneCapture,
            `(Fallback:${candidateId})`
          );
          this.broadcastDeviceSelection({
            kind: 'input',
            requested: wantedInput || null,
            actual: candidateId,
            fellBack: true,
            reason: `Preferred and default failed; using ${candidateId}.`,
          });
          success = true;
          break;
        } catch (errN) {
          lastErr = errN;
          console.warn(
            `[Main] Fallback candidate ${candidateId} failed:`,
            errN
          );
        }
      }
      if (!success) {
        console.error(
          '[Main] All input devices failed to initialize.',
          lastErr
        );
        this.microphoneCapture = null;
        this.broadcastDeviceSelection({
          kind: 'input',
          requested: wantedInput || null,
          actual: null,
          fellBack: true,
          reason: `All ${candidates.length + 2} input devices failed: ${(lastErr as Error)?.message || 'unknown'}`,
        });
        this.sendAudioCaptureFailed({
          channel: 'mic',
          message:
            'No working microphone could be initialized. Disconnect and reconnect your audio devices, or restart the app.',
          attempt: 0,
          maxAttempts: 0,
          terminal: true,
          stuck: false,
        });
      }
    }
  }

  if (this.meetingState.isMeetingActive) {
    this.systemAudioCapture?.start();
    this.microphoneCapture?.start();
    this.interviewerSTT?.start();
    this.userSTT?.start();
  }
}
