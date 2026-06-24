import { EventEmitter } from 'events';
import { spawn, ChildProcess } from 'child_process';
import { app } from 'electron';
import path from 'path';
import {
  createAudioCommand,
  createStartCommand,
  createStopCommand,
  type ParakeetAudioSource,
  type ParakeetCommand,
  type ParakeetEvent,
  type ParakeetTranscriptEvent,
} from './parakeetProtocol';
import { ParakeetTranscriptReconciler } from './parakeetTranscriptReconciler';

const START_TIMEOUT_MS = parseInt(
  process.env.SPEECH_TO_TEXT_TIMEOUT_MS || '120000',
  10
);

function resolveBinaryPath(): string {
  const envPath = process.env.SPEECH_TO_TEXT_BINARY?.trim();
  if (envPath) return envPath;

  if (app.isPackaged) {
    return path.join(
      process.resourcesPath,
      'local-stt-engine',
      'speech-to-text'
    );
  }

  return path.join(
    app.getAppPath(),
    'local-stt-engine',
    '.build',
    'release',
    'speech-to-text'
  );
}

export class LocalParakeetSTT extends EventEmitter {
  private modelId: string;
  private language: string = 'auto';
  private channel: ParakeetAudioSource = 'mic';
  private child: ChildProcess | null = null;
  private stdoutBuffer: string = '';
  private isSessionActive: boolean = false;
  private writeQueue: Promise<void> = Promise.resolve();
  private startResolve: (() => void) | null = null;
  private startReject: ((err: Error) => void) | null = null;
  private transcriptReconciler = new ParakeetTranscriptReconciler();
  private isSpeechActive: boolean = false;
  private destroyed: boolean = false;
  // Resolves when the engine's terminal 'final' lands (or the child dies) —
  // the drain must wait for THIS, not a fixed delay: the stop-commit pass can
  // exceed any blind window and trailing words would vanish from the meeting.
  private finalSeen: Promise<void> = Promise.resolve();
  private resolveFinalSeen: (() => void) | null = null;
  private _restartChain: Promise<void> = Promise.resolve();
  private _restartGeneration = 0;

  constructor(modelId?: string) {
    super();
    this.modelId =
      modelId || process.env.SPEECH_TO_TEXT_MODEL || 'parakeet-tdt-0.6b-v3';

    if (process.platform !== 'darwin') {
      console.warn(
        '[LocalParakeetSTT] FluidAudio only runs on macOS Apple Silicon'
      );
    }
  }

  setChannel(ch: ParakeetAudioSource): void {
    this.channel = ch;
  }

  setRecognitionLanguage(lang: string): void {
    this.language = lang || 'auto';
  }

  setSampleRate(_rate: number): void {}
  setCredentials(_path: string): void {}
  setAudioChannelCount(_count: number): void {}
  notifySpeechEnded(): void {
    if (!this.isSessionActive || this.destroyed) return;
    this.isSpeechActive = false;
    const gen = ++this._restartGeneration;
    this._restartChain = this._restartChain
      .catch(() => {})
      .then(async () => {
        if (this.destroyed || gen !== this._restartGeneration) return;
        this.stop();
        await this.awaitDrained(3000);
        if (this.destroyed || gen !== this._restartGeneration) return;
        await this.start();
      })
      .catch((err) => {
        console.error(
          '[LocalParakeetSTT] restart after speech_ended failed:',
          err
        );
      });
  }

  async start(): Promise<void> {
    if (this.destroyed) return;

    this.ensureChild();

    if (!this.child) return;

    this.isSessionActive = true;
    this.finalSeen = new Promise<void>((resolve) => {
      this.resolveFinalSeen = resolve;
    });

    const startPromise = new Promise<void>((resolve, reject) => {
      this.startResolve = resolve;
      this.startReject = reject;
    });

    const timeout = setTimeout(() => {
      if (this.startReject) {
        const err = new Error(
          `Parakeet start timeout after ${START_TIMEOUT_MS}ms`
        );
        this.startReject(err);
        this.startResolve = null;
        this.startReject = null;
        this.emit('error', err);
      }
    }, START_TIMEOUT_MS);

    this.sendCommand(
      createStartCommand(this.modelId, this.language, this.channel)
    );

    try {
      await startPromise;
    } finally {
      clearTimeout(timeout);
      this.startResolve = null;
      this.startReject = null;
    }
  }

  write(chunk: Buffer): void {
    if (!this.child || !this.isSessionActive || this.destroyed) return;
    this.isSpeechActive = true;
    this.sendCommand(createAudioCommand(this.channel, chunk));
  }

  stop(): void {
    if (!this.child || !this.isSessionActive) return;
    this.isSessionActive = false;

    this.sendCommand(createStopCommand());
  }

  finalize(): void {
    this.stop();
  }

  // Resolves once the post-stop terminal 'final' has been handled (its
  // remainder already emitted to listeners), the child has died, or the
  // timeout elapses. Immediate when no session ever started.
  awaitDrained(timeoutMs = 5_000): Promise<void> {
    return Promise.race([
      this.finalSeen,
      new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
    ]);
  }

  async destroy(): Promise<void> {
    if (this.destroyed) return;
    this.destroyed = true;
    this.isSessionActive = false;

    if (this.child) {
      this.child.kill('SIGTERM');
      this.child = null;
    }

    this.stdoutBuffer = '';
  }

  async shutdown(): Promise<void> {
    return this.destroy();
  }

  private ensureChild(): void {
    if (this.child && !this.child.killed) return;

    const binPath = resolveBinaryPath();
    try {
      this.child = spawn(binPath, ['stdio'], {
        env: process.env,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (err: any) {
      this.emit(
        'error',
        new Error(`Failed to spawn speech-to-text binary: ${err.message}`)
      );
      return;
    }

    this.child.stdout!.setEncoding('utf8');
    this.child.stderr!.setEncoding('utf8');

    this.child.stdout!.on('data', (chunk: string) => {
      this.readStdout(chunk);
    });

    this.child.stderr!.on('data', (data: string) => {
      console.error(`[LocalParakeetSTT] stderr: ${data.trim()}`);
    });

    this.child.on('error', (err: Error) => {
      this.emit(
        'error',
        new Error(`speech-to-text process error: ${err.message}`)
      );
      this.child = null;
    });

    this.child.on('exit', (code: number | null) => {
      if (code !== null && code !== 0 && !this.destroyed) {
        this.emit(
          'error',
          new Error(`speech-to-text exited with code ${code}`)
        );
      }
      this.child = null;
      this.isSessionActive = false;
      // A dead engine emits no terminal final — unblock any waiting drain.
      this.resolveFinalSeen?.();
      this.resolveFinalSeen = null;
    });
  }

  private readStdout(chunk: string): void {
    this.stdoutBuffer += chunk;

    while (true) {
      const newline = this.stdoutBuffer.indexOf('\n');
      if (newline < 0) return;

      const line = this.stdoutBuffer.slice(0, newline).trim();
      this.stdoutBuffer = this.stdoutBuffer.slice(newline + 1);

      if (!line) continue;

      try {
        this.handleEvent(JSON.parse(line) as ParakeetEvent);
      } catch {
        console.warn(
          `[LocalParakeetSTT] malformed stdout line: ${line.slice(0, 200)}`
        );
      }
    }
  }

  private handleEvent(event: ParakeetEvent): void {
    switch (event.type) {
      case 'session_started':
        if (this.startResolve) {
          this.startResolve();
          this.startResolve = null;
          this.startReject = null;
        }
        this.emit('status', { type: 'ready' });
        break;

      case 'partial':
        this.emitTranscript(
          this.transcriptReconciler.handlePartial(event, this.isSpeechActive)
        );
        break;

      case 'committed': {
        this.emitTranscript(
          this.transcriptReconciler.handleCommitted(
            event,
            this.isSessionActive,
            this.isSpeechActive
          )
        );
        break;
      }

      case 'final': {
        this.emitTranscript(this.transcriptReconciler.handleFinal(event));
        // Listeners above ran synchronously — the drain may now read state.
        this.resolveFinalSeen?.();
        this.resolveFinalSeen = null;
        break;
      }

      case 'error':
        this.emit(
          'error',
          new Error(event.message || 'Unknown Parakeet error')
        );
        break;

      case 'status':
        console.log(`[LocalParakeetSTT] status: ${event.message}`);
        break;
    }
  }

  private emitTranscript(transcript: ParakeetTranscriptEvent | null): void {
    if (!transcript) return;
    this.emit('transcript', transcript);
  }

  private sendCommand(command: ParakeetCommand): void {
    const write = this.writeQueue
      .catch((): undefined => undefined)
      .then(() => this.writeCommandNow(command));
    this.writeQueue = write;
  }

  private writeCommandNow(command: Record<string, unknown>): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (!this.child?.stdin || this.child.stdin.destroyed) {
        resolve();
        return;
      }

      const data = JSON.stringify(command) + '\n';
      const ok = this.child.stdin.write(data, 'utf8', (err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });

      if (!ok) {
        this.child.stdin.once('drain', () => resolve());
      }
    });
  }
}
