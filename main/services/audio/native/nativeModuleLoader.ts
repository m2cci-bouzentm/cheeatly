import path from 'path';

export interface AudioDeviceInfo {
  id: string;
  name: string;
}

export interface NativeModule {
  getHardwareId(): string;
  verifyGumroadKey(licenseKey: string): Promise<string>;
  // Optional so stale binaries still load after Dodo additions.
  verifyDodoKey?: (licenseKey: string, deviceLabel: string) => Promise<string>;
  validateDodoKey?: (licenseKey: string) => Promise<string>;
  deactivateDodoKey?: (
    licenseKey: string,
    instanceId: string
  ) => Promise<string>;
  getInputDevices(): Array<AudioDeviceInfo>;
  getOutputDevices(): Array<AudioDeviceInfo>;
  // Optional because shipped binaries may predate route-change support.
  getDefaultOutputDeviceId?: () => string;
  // macOS-only stealth panel attributes; optional for stale binaries.
  applyStealthToWindow?: (handle: Buffer) => void;
  isAccessibilityGranted?: () => boolean;
  // macOS-only event tap; requires Accessibility permission at runtime.
  StealthKeyboardTap?: new () => {
    start(
      callback: (err: Error | null, ev: CapturedKey) => void,
      overlayBounds?: OverlayBoundsInput | null
    ): boolean;
    stop(): void;
    readonly isActive: boolean;
  };
  SystemAudioCapture: new (deviceId?: string | null) => {
    getSampleRate(): number;
    start(
      callback: (...args: any[]) => any,
      onSpeechEnded?: (...args: any[]) => any
    ): void;
    stop(): void;
  };
  MicrophoneCapture: new (deviceId?: string | null) => {
    getSampleRate(): number;
    start(
      callback: (...args: any[]) => any,
      onSpeechEnded?: (...args: any[]) => any
    ): void;
    stop(): void;
  };
}

export interface OverlayBoundsInput {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CapturedKey {
  keyCode: number;
  chars: string;
  flags: number;
  isKeyDown: boolean;
  isOutsideMouseDown?: boolean;
}

const REQUIRED_METHODS = [
  'getHardwareId',
  'verifyGumroadKey',
  'getInputDevices',
  'getOutputDevices',
];
const REQUIRED_CONSTRUCTORS = ['SystemAudioCapture', 'MicrophoneCapture'];
// Dodo methods are soft-required so audio/Gumroad keep working with stale binaries.
const SOFT_REQUIRED_METHODS = [
  'verifyDodoKey',
  'validateDodoKey',
  'deactivateDodoKey',
];

function validateNativeModule(mod: any): asserts mod is NativeModule {
  for (const fn of REQUIRED_METHODS) {
    if (typeof mod[fn] !== 'function') {
      throw new Error(
        `NativeModule: missing or invalid method "${fn}" (expected function, got ${typeof mod[fn]})`
      );
    }
  }
  for (const cls of REQUIRED_CONSTRUCTORS) {
    if (typeof mod[cls] !== 'function') {
      throw new Error(
        `NativeModule: missing or invalid constructor "${cls}" (expected constructor, got ${typeof mod[cls]})`
      );
    }
  }

  for (const fn of SOFT_REQUIRED_METHODS) {
    if (typeof mod[fn] !== 'function') {
      console.warn(
        `[nativeModuleLoader] WARNING: optional method "${fn}" not found in binary — ` +
          `Dodo license validation/deactivation will be unavailable until binary is rebuilt. ` +
          `Run \`npm run build:native\` to refresh the Rust native module.`
      );
    }
  }

  // Smoke-test catches asar JS stubs that export names but cannot dlopen the binary.
  let result: unknown;
  try {
    result = mod.getInputDevices();
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(
      `NativeModule: functional smoke-test threw (${msg}) — likely loaded asar stub instead of real binary`
    );
  }
  if (!Array.isArray(result)) {
    throw new Error(
      `NativeModule: getInputDevices() returned ${typeof result} instead of Array` +
        ` — likely loaded asar stub instead of real binary`
    );
  }
}

function getNativeBinaryName(): string {
  const { platform, arch } = process;
  const map: Record<string, Record<string, string>> = {
    win32: {
      x64: 'index.win32-x64-msvc.node',
      ia32: 'index.win32-ia32-msvc.node',
      arm64: 'index.win32-arm64-msvc.node',
    },
    darwin: { x64: 'index.darwin-x64.node', arm64: 'index.darwin-arm64.node' },
    linux: {
      x64: 'index.linux-x64-gnu.node',
      arm64: 'index.linux-arm64-gnu.node',
    },
  };
  return map[platform]?.[arch] ?? `index.${platform}-${arch}.node`;
}

let cached: NativeModule | null | undefined = undefined;

// Load the .node directly; npm symlink packages and sealed asar stubs both break native dlopen.
export function loadNativeModule(): NativeModule | null {
  if (cached !== undefined) return cached;

  // Keep accidental renderer/worker imports from crashing on top-level Electron access.
  let appPath: string;
  let isDev = false;
  let verboseLogging = false;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { app } = require('electron') as typeof import('electron');
    appPath = app.getAppPath();
    isDev = process.env.NODE_ENV === 'development' && !app.isPackaged;
  } catch (e) {
    console.error('[nativeModuleLoader] app.getAppPath() not available:', e);
    cached = null;
    return null;
  }

  // SettingsManager can be unavailable during early boot.
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { SettingsService } = require('../../SettingsService');
    verboseLogging = !!SettingsService.getInstance().get('verboseLogging');
  } catch {}

  const binary = getNativeBinaryName();

  const packagedPath = process.resourcesPath
    ? path.join(
        process.resourcesPath,
        'app.asar.unpacked',
        'platform-bridge',
        binary
      )
    : null;
  const devPath = path.join(appPath, 'platform-bridge', binary);
  const devFallbackPath = path.join(appPath, '..', 'platform-bridge', binary);

  // Packaged builds must prefer app.asar.unpacked; dev should avoid noisy missing packaged path logs.
  const candidates: string[] = isDev
    ? [devPath, devFallbackPath, ...(packagedPath ? [packagedPath] : [])]
    : [...(packagedPath ? [packagedPath] : []), devPath, devFallbackPath];

  for (const filePath of candidates) {
    try {
      const mod = require(filePath);
      validateNativeModule(mod);
      cached = mod;
      if (verboseLogging) {
        console.log(`[nativeModuleLoader] Loaded ${binary} from: ${filePath}`);
      }
      return cached;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (verboseLogging) {
        console.warn(
          `[nativeModuleLoader] Could not load from ${filePath}: ${msg}`
        );
      }
    }
  }

  console.error(
    `[nativeModuleLoader] Failed to load ${binary} from all ${candidates.length} candidate paths.`
  );
  cached = null;
  return null;
}
