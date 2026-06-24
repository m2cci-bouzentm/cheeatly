import { EventEmitter } from 'events';
import { loadNativeModule } from './nativeModuleLoader';

const NativeModule: any = loadNativeModule();
const { SystemAudioCapture: RustAudioCapture } = NativeModule || {};

export class SystemAudioCapture extends EventEmitter {
  private isRecording: boolean = false;
  private deviceId: string | null = null;
  private detectedSampleRate: number = 48000;
  private monitor: any = null;
  private chunkCount: number = 0;
  private sampleRatePollTimers: NodeJS.Timeout[] = [];
  // Awaiting stop() must mean the CoreAudio/SCK/WASAPI handle is released.
  private _teardownPromise: Promise<void> | null = null;

  constructor(deviceId?: string | null) {
    super();
    this.deviceId = deviceId || null;
    if (!RustAudioCapture) {
      console.error(
        '[SystemAudioCapture] Rust class implementation not found.'
      );
      return;
    }
    // Eager system-audio init can mute/degrade output at app launch.
    console.log(
      `[SystemAudioCapture] Initialized (lazy). Device ID: ${this.deviceId || 'default'}`
    );
  }

  // STT needs the emitted/resampled rate, not the native hardware rate.
  public getSampleRate(): number {
    if (!this.monitor) return this.detectedSampleRate;
    if (typeof this.monitor.getSampleRate === 'function')
      return this.setDetectedSampleRate(this.monitor.getSampleRate());
    if (typeof this.monitor.get_sample_rate === 'function')
      return this.setDetectedSampleRate(this.monitor.get_sample_rate());
    return this.detectedSampleRate;
  }

  private setDetectedSampleRate(emittedRate: number): number {
    if (emittedRate !== this.detectedSampleRate) {
      console.log(`[SystemAudioCapture] Emitted STT rate: ${emittedRate}`);
      this.detectedSampleRate = emittedRate;
    }
    return emittedRate;
  }

  // Native hardware rate is diagnostic only.
  public getNativeSampleRate(): number {
    if (!this.monitor) return 0;
    try {
      if (typeof this.monitor.getNativeSampleRate === 'function') {
        return this.monitor.getNativeSampleRate();
      }
    } catch (e) {
      console.warn('[SystemAudioCapture] getNativeSampleRate failed:', e);
    }
    return 0;
  }

  public start(): void {
    if (this.isRecording) return;

    if (!RustAudioCapture) {
      console.error('[SystemAudioCapture] Cannot start: Rust module missing');
      return;
    }

    if (!this.monitor) {
      console.log(
        '[SystemAudioCapture] Creating native monitor (lazy init)...'
      );
      try {
        this.monitor = new RustAudioCapture(this.deviceId);
      } catch (e) {
        console.error(
          '[SystemAudioCapture] Failed to create native monitor:',
          e
        );
        this.emit('error', e);
        return;
      }
    }

    try {
      console.log('[SystemAudioCapture] Starting native capture...');
      this.chunkCount = 0;

      this.isRecording = true;

      this.monitor.start(
        (err: Error | null, chunk: Buffer) => {
          if (err) {
            console.error('[SystemAudioCapture] Callback error:', err);
            this.isRecording = false;
            this.emit('error', err);
            return;
          }
          if (!chunk || chunk.length === 0) return;
          // Deferred native stop can produce late chunks after finalize().
          if (!this.isRecording) return;
          this.chunkCount++;
          if (this.chunkCount <= 3 || this.chunkCount % 500 === 0) {
            console.log(
              `[SystemAudioCapture] Chunk #${this.chunkCount}: ${chunk.length} bytes from Rust`
            );
          }
          // napi-rs already returns an owned Buffer; copying churns GC.
          this.emit('data', chunk);
        },
        (err: Error | null, _ended: boolean) => {
          if (err) {
            console.error(
              '[SystemAudioCapture] Speech ended callback error:',
              err
            );
            return;
          }
          this.emit('speech_ended');
        }
      );

      // SCK/CoreAudio publishes the real rate only after async native init.
      if (
        typeof this.monitor.getSampleRate === 'function' ||
        typeof this.monitor.get_sample_rate === 'function'
      ) {
        const pollRate = () => {
          const rate =
            typeof this.monitor?.getSampleRate === 'function'
              ? this.monitor.getSampleRate()
              : this.monitor?.get_sample_rate?.();
          if (rate && rate !== this.detectedSampleRate) {
            this.detectedSampleRate = rate;
            console.log(`[SystemAudioCapture] Detected sample rate: ${rate}Hz`);
            this.emit('sample_rate_changed', rate);
          }
        };

        // Timers are cancelled on stop to avoid stale monitor reads.
        this.sampleRatePollTimers.push(setTimeout(pollRate, 1000));
        this.sampleRatePollTimers.push(setTimeout(pollRate, 8000));
      }

      this.emit('start');
    } catch (error) {
      console.error('[SystemAudioCapture] Failed to start:', error);
      this.isRecording = false;
      // start() can throw after allocating native handles; release them on next tick.
      const dying = this.monitor;
      this.monitor = null;
      if (dying) {
        setImmediate(() => {
          try {
            dying.stop();
          } catch (e) {
            console.error(
              '[SystemAudioCapture] Error stopping orphaned monitor after failed start:',
              e
            );
          }
        });
      }
      this.emit('error', error);
    }
  }

  // Native stop blocks on device release; defer it after flipping JS state.
  public stop(): Promise<void> {
    if (!this.isRecording) {
      return this._teardownPromise ?? Promise.resolve();
    }

    // Stale polls must not read a null or re-created monitor.
    for (const t of this.sampleRatePollTimers) clearTimeout(t);
    this.sampleRatePollTimers = [];

    console.log(
      '[SystemAudioCapture] Stopping capture (deferred native teardown)...'
    );
    this.isRecording = false;
    const monitor = this.monitor;
    // Reusing the same Rust monitor after stop can leave the tap half-initialized.
    this.monitor = null;

    const teardownPromise = new Promise<void>((resolve) => {
      setImmediate(() => {
        try {
          monitor?.stop();
        } catch (e) {
          console.error('[SystemAudioCapture] Error stopping (deferred):', e);
        }
        resolve();
      });
    });
    this._teardownPromise = teardownPromise;
    void teardownPromise.then(() => {
      if (this._teardownPromise === teardownPromise) {
        this._teardownPromise = null;
      }
    });

    this.emit('stop');
    return teardownPromise;
  }

  public async destroy(): Promise<void> {
    // Keep listeners until native callbacks finish.
    await this.stop();
    this.removeAllListeners();
    this.monitor = null;
  }
}
