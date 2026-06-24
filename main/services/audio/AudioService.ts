import { SystemAudioCapture } from './native/SystemAudioCapture';
import { MicrophoneCapture } from './native/MicrophoneCapture';
import { TranscriptHandler } from './native/TranscriptHandler';
import { WindowService } from '../window/WindowService';
import { SettingsWindowService } from '../window/SettingsWindowService';
import { CredentialService } from '../CredentialService';
import { SettingsService } from '../SettingsService';
interface MeetingState {
  readonly isMeetingActive: boolean;
  readonly meetingGeneration: number;
  readonly isDraining: boolean;
  readonly micMuted: boolean;
  readonly systemMuted: boolean;
  readonly isQuitting: boolean;
}
import {
  createSTTProviderImpl,
  prewarmSttProvidersImpl,
  reconfigureSttProviderImpl,
  doReconfigureSttProviderImpl,
} from './AudioSttImpl';
import {
  wireSystemCaptureImpl,
  wireMicCaptureImpl,
} from './AudioCaptureWiringImpl';
import {
  setupSystemAudioPipelineImpl,
  restartCapturesAfterResumeImpl,
} from './AudioPipelineImpl';
import {
  broadcastDeviceSelectionImpl,
  normalizeDeviceIdImpl,
  detectSameInputOutputDeviceImpl,
  checkSameInputOutputDeviceImpl,
  getEffectiveOutputDeviceNameImpl,
  pickFallbackInputDeviceImpl,
  normalizeDeviceNameImpl,
  isBluetoothInputNameImpl,
  findBuiltInInputDeviceImpl,
  reconfigureAudioImpl,
} from './AudioDeviceRoutingImpl';
import {
  setupAudioRecoveryHandlerImpl,
  startDefaultOutputWatcherImpl,
  stopDefaultOutputWatcherImpl,
  stopDefaultOutputWatcherForShutdownImpl,
  handleDefaultOutputChangedImpl,
  setupMicRecoveryHandlerImpl,
} from './AudioRecoveryImpl';
import {
  startAudioTestImpl,
  startAudioTestInternalImpl,
  stopAudioTestImpl,
} from './AudioTestImpl';

export type TranscriptSegment = {
  speaker: string;
  text: string;
  timestamp: number;
  final: boolean;
  confidence: number;
};

// Meeting lifecycle is injected so audio does not own AppState.
export class AudioService {
  public systemAudioCapture: any = null;
  public microphoneCapture: any = null;
  public audioTestCapture: any = null;
  public audioTestSystemCapture: any = null;
  public _audioTestStarting = false;
  public _audioTestEpoch = 0;
  public _audioTestSystemProbeTimer: NodeJS.Timeout | null = null;
  public interviewerSTT: any = null;
  public userSTT: any = null;
  public _sysSttRateApplied: boolean = false;
  public _micSttRateApplied: boolean = false;
  public _lastRequestedInputDeviceId: string | undefined = undefined;
  public _lastRequestedOutputDeviceId: string | undefined = undefined;
  public _sttReconfigureChain: Promise<void> = Promise.resolve();
  public _systemAudioRecoveryInProgress = false;
  public _systemAudioRecoveryAttempts = 0;
  public _systemAudioRecoveryTimer: NodeJS.Timeout | null = null;
  public _systemAudioLastFailureAt: number | null = null;
  public _systemAudioSuccessfulRestarts = 0;
  public _systemAudioConsecutiveFailures = 0;
  public _micRecoveryInProgress = false;
  public _micRecoveryAttempts = 0;
  public _micRecoveryTimer: NodeJS.Timeout | null = null;
  public micMuted = false;
  public systemMuted = false;
  public _defaultOutputWatcherInterval: NodeJS.Timeout | null = null;
  public _lastObservedDefaultOutputId: string | null = null;
  public _defaultOutputSwitchInProgress = false;

  constructor(
    public readonly windowHelper: WindowService,
    public readonly settingsWindowHelper: SettingsWindowService,
    public readonly credentials: CredentialService,
    public readonly settings: SettingsService,
    public readonly meetingState: MeetingState,
    public readonly transcriptHandler: TranscriptHandler,
    public readonly appBroadcast: (channel: string, ...args: any[]) => void,
    public readonly sendToMeetingSurfaces: (
      channel: string,
      ...args: any[]
    ) => void,
    public readonly sendToSettingsSurfaces: (
      channel: string,
      ...args: any[]
    ) => void,
    public readonly sendAudioCaptureFailed: (payload: any) => void,
    public readonly sendSystemAudioPermissionDenied: (message: string) => void,
    public readonly applyTranscriptSegment: (segment: TranscriptSegment) => void
  ) {}

  public setMicMuted(muted: boolean): void {
    this.micMuted = muted;
    console.log(`[Audio] Mic ${muted ? 'muted' : 'unmuted'}`);
  }
  public setSystemMuted(muted: boolean): void {
    this.systemMuted = muted;
    console.log(`[Audio] System audio ${muted ? 'muted' : 'unmuted'}`);
  }
  public setRecognitionLanguage(key: string): void {
    console.log(`[Audio] Setting recognition language to: ${key}`);
    this.credentials.setSttLanguage(key);
    const effectiveKey = key === 'auto' ? 'english' : key;
    this.interviewerSTT?.setRecognitionLanguage(effectiveKey);
    this.userSTT?.setRecognitionLanguage(effectiveKey);
  }

  public createSTTProvider(speaker: 'interviewer' | 'user'): any {
    return createSTTProviderImpl.call(this, speaker);
  }
  public wireSystemCapture(
    capture: SystemAudioCapture,
    label: string = ''
  ): void {
    return wireSystemCaptureImpl.call(this, capture, label);
  }
  public wireMicCapture(capture: MicrophoneCapture, label: string = ''): void {
    return wireMicCaptureImpl.call(this, capture, label);
  }
  public setupSystemAudioPipeline(): Promise<void> {
    return setupSystemAudioPipelineImpl.call(this);
  }
  public prewarmSttProviders(): void {
    return prewarmSttProvidersImpl.call(this);
  }
  public restartCapturesAfterResume(): Promise<void> {
    return restartCapturesAfterResumeImpl.call(this);
  }
  public broadcastDeviceSelection(payload: any): void {
    return broadcastDeviceSelectionImpl.call(this, payload);
  }
  public normalizeDeviceId(id: string | null | undefined): string | undefined {
    return normalizeDeviceIdImpl.call(this, id);
  }
  public detectSameInputOutputDevice(): string | undefined {
    return detectSameInputOutputDeviceImpl.call(this);
  }
  public checkSameInputOutputDevice(
    inputId?: string,
    outputId?: string
  ): string | undefined {
    return checkSameInputOutputDeviceImpl.call(this, inputId, outputId);
  }
  public getEffectiveOutputDeviceName(outputDeviceId?: string): string {
    return getEffectiveOutputDeviceNameImpl.call(this, outputDeviceId);
  }
  public pickFallbackInputDevice(
    conflictingName: string
  ): { id: string; name: string } | undefined {
    return pickFallbackInputDeviceImpl.call(this, conflictingName);
  }
  public normalizeDeviceName(name: string): string {
    return normalizeDeviceNameImpl.call(this, name);
  }
  public isBluetoothInputName(name: string): boolean {
    return isBluetoothInputNameImpl.call(this, name);
  }
  public findBuiltInInputDevice(): { id: string; name: string } | undefined {
    return findBuiltInInputDeviceImpl.call(this);
  }
  public reconfigureAudio(
    inputDeviceId?: string | null,
    outputDeviceId?: string | null
  ): Promise<void> {
    return reconfigureAudioImpl.call(this, inputDeviceId, outputDeviceId);
  }
  public reconfigureSttProvider(): Promise<void> {
    return reconfigureSttProviderImpl.call(this);
  }
  public doReconfigureSttProvider(): Promise<void> {
    return doReconfigureSttProviderImpl.call(this);
  }
  public setupAudioRecoveryHandler(): void {
    return setupAudioRecoveryHandlerImpl.call(this);
  }
  public startDefaultOutputWatcher(): void {
    return startDefaultOutputWatcherImpl.call(this);
  }
  public stopDefaultOutputWatcher(): void {
    return stopDefaultOutputWatcherImpl.call(this);
  }
  public stopDefaultOutputWatcherForShutdown(): void {
    return stopDefaultOutputWatcherForShutdownImpl.call(this);
  }
  public handleDefaultOutputChanged(): Promise<void> {
    return handleDefaultOutputChangedImpl.call(this);
  }
  public setupMicRecoveryHandler(): void {
    return setupMicRecoveryHandlerImpl.call(this);
  }
  public startAudioTest(deviceId?: string): Promise<void> {
    return startAudioTestImpl.call(this, deviceId);
  }
  public startAudioTestInternal(deviceId?: string): Promise<void> {
    return startAudioTestInternalImpl.call(this, deviceId);
  }
  public stopAudioTest(): void {
    return stopAudioTestImpl.call(this);
  }
}
