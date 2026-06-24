import { EventEmitter } from 'events';
import { loadNativeModule } from './nativeModuleLoader';

// Eager native init avoids mic reinitialization latency across stop/start cycles.
const NativeModule: any = loadNativeModule();
const { MicrophoneCapture: RustMicCapture } = NativeModule || {};

export class MicrophoneCapture extends EventEmitter {
  private monitor: any = null;
  private isRecording: boolean = false;
  private deviceId: string | null = null;
  // Awaiting stop() must mean the cpal/HAL handle is released.
  private _teardownPromise: Promise<void> | null = null;
  // Skip prewarm during quit/dispose/device-swap paths that will not reuse this wrapper.
  private preWarmEnabled: boolean = true;

  constructor(deviceId?: string | null) {
    super();
    this.deviceId = deviceId || null;
    if (!RustMicCapture) {
      console.error('[MicrophoneCapture] Rust class implementation not found.');
      return;
    }
    console.log(
      `[MicrophoneCapture] Initialized wrapper. Device ID: ${this.deviceId || 'default'}`
    );
    try {
      console.log(
        '[MicrophoneCapture] Creating native monitor (Eager Init)...'
      );
      this.monitor = new RustMicCapture(this.deviceId);
    } catch (e) {
      console.error('[MicrophoneCapture] Failed to create native monitor:', e);
      // Callers need construction failure to trigger device fallback.
      throw e;
    }
  }

  public getSampleRate(): number {
    if (!this.monitor) return 48000;
    if (typeof this.monitor.getSampleRate === 'function')
      return this.monitor.getSampleRate();
    if (typeof this.monitor.get_sample_rate === 'function')
      return this.monitor.get_sample_rate();
    return 48000;
  }

  // Native hardware rate reveals Bluetooth HFP degradation before DSP resampling.
  public getNativeSampleRate(): number {
    if (!this.monitor) return 0;
    if (typeof this.monitor.getNativeSampleRate === 'function')
      return this.monitor.getNativeSampleRate();
    if (typeof this.monitor.get_native_sample_rate === 'function')
      return this.monitor.get_native_sample_rate();
    return 0;
  }

  public start(): void {
    if (this.isRecording) return;

    if (!RustMicCapture) {
      console.error('[MicrophoneCapture] Cannot start: Rust module missing');
      return;
    }

    if (!this.monitor) {
      console.log(
        '[MicrophoneCapture] Monitor not initialized. Re-initializing...'
      );
      try {
        this.monitor = new RustMicCapture(this.deviceId);
      } catch (e) {
        this.emit('error', e);
        return;
      }
    }

    try {
      console.log('[MicrophoneCapture] Starting native capture...');

      this.isRecording = true;

      this.monitor.start(
        (err: Error | null, chunk: Buffer) => {
          if (err) {
            console.error('[MicrophoneCapture] Callback error:', err);
            this.isRecording = false;
            this.emit('error', err);
            return;
          }
          if (!chunk || chunk.length === 0) return;
          // Deferred native stop can produce late chunks after finalize().
          if (!this.isRecording) return;
          if (Math.random() < 0.05) {
            console.log(
              `[MicrophoneCapture] Emitting chunk: ${chunk.length} bytes to JS`
            );
          }
          // napi-rs already returns an owned Buffer; copying churns GC.
          this.emit('data', chunk);
        },
        (err: Error | null, _ended: boolean) => {
          if (err) {
            console.error(
              '[MicrophoneCapture] Speech ended callback error:',
              err
            );
            return;
          }
          this.emit('speech_ended');
        }
      );

      this.emit('start');
    } catch (error) {
      console.error('[MicrophoneCapture] Failed to start:', error);
      this.isRecording = false;
      this.emit('error', error);
    }
  }

  // Native stop blocks on device release; defer it after flipping JS state.
  public stop(): Promise<void> {
    if (!this.isRecording) {
      return this._teardownPromise ?? Promise.resolve();
    }

    console.log(
      '[MicrophoneCapture] Stopping capture (deferred native teardown)...'
    );
    this.isRecording = false;
    const monitor = this.monitor;
    // New callers should see a clean wrapper while native teardown runs.
    this.monitor = null;

    // Keep prewarm outside the teardown promise so awaiting stop() pays only release cost.
    const teardownPromise = new Promise<void>((resolve) => {
      setImmediate(() => {
        try {
          monitor?.stop();
        } catch (e) {
          console.error('[MicrophoneCapture] Error stopping (deferred):', e);
        }
        resolve();
      });
    });
    this._teardownPromise = teardownPromise;

    void teardownPromise.then(() => {
      if (this._teardownPromise === teardownPromise) {
        this._teardownPromise = null;
      }
      if (!this.preWarmEnabled) return;
      if (!RustMicCapture) return;
      if (this.monitor) return;
      try {
        console.log(
          '[MicrophoneCapture] Pre-warming native monitor for next meeting...'
        );
        this.monitor = new RustMicCapture(this.deviceId);
      } catch (e) {
        // start() retries later; this event explains the next cold-start stall.
        console.error(
          '[MicrophoneCapture] Pre-warm failed (next start() will retry):',
          e
        );
        this.emit('pre_warm_failed', e);
      }
    });

    this.emit('stop');
    return teardownPromise;
  }

  public disablePreWarm(): void {
    this.preWarmEnabled = false;
  }

  public async destroy(): Promise<void> {
    // destroy() callers will not reuse this wrapper.
    this.preWarmEnabled = false;
    await this.stop();
    this.removeAllListeners();
    this.monitor = null;
  }
}
