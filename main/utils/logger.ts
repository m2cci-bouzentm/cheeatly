import { app } from 'electron';
import path from 'path';
import fs from 'fs';

let _verbose = false;
export const isVerboseLogging = (): boolean => _verbose;
export const setVerboseLoggingFlag = (enabled: boolean): void => {
  _verbose = enabled;
};

let _logFile: string | null = null;
const getLogFile = (): string | null => {
  if (_logFile) return _logFile;
  try {
    _logFile = path.join(app.getPath('documents'), 'cheatly_debug.log');
    return _logFile;
  } catch {
    return null;
  }
};
export function serializeArgs(args: unknown[]): string {
  return args.map(a => a instanceof Error ? (a.stack || a.message) : typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
}
export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  tag: string
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(
        new Error('[withTimeout] ' + tag + ' timed out after ' + ms + 'ms')
      );
    }, ms);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}
const LOG_MAX_BYTES = 10 * 1024 * 1024;
function rotateLogFileIfNeeded(logFile: string): void {
  try {
    const stat = fs.statSync(logFile);
    if (stat.size < LOG_MAX_BYTES) return;
    const rotated = logFile + '.1';
    if (fs.existsSync(rotated)) fs.unlinkSync(rotated);
    fs.renameSync(logFile, rotated);
  } catch {}
}
export function logToFile(msg: string) {
  try {
    const logFile = getLogFile();
    if (!logFile) return;
    rotateLogFileIfNeeded(logFile);
    fs.appendFileSync(logFile, new Date().toISOString() + ' ' + msg + '\n');
  } catch (e) {}
}
