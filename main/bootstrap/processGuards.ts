// Side-effect guard module imported once by main.ts during startup.
import { logToFile, serializeArgs, isVerboseLogging } from '../utils/logger';

process.stdout?.on?.('error', () => {});
process.stderr?.on?.('error', () => {});
process.on('uncaughtException', (err) => {
  logToFile('[CRITICAL] Uncaught Exception: ' + serializeArgs([err]));
});
process.on('unhandledRejection', (reason) => {
  logToFile('[CRITICAL] Unhandled Rejection: ' + serializeArgs([reason]));
});

const originalLog = console.log;
const originalWarn = console.warn;
const originalError = console.error;
console.log = (...args: any[]) => {
  if (isVerboseLogging()) logToFile('[LOG] ' + serializeArgs(args));
  try {
    originalLog.apply(console, args);
  } catch {}
};
console.warn = (...args: any[]) => {
  if (isVerboseLogging()) logToFile('[WARN] ' + serializeArgs(args));
  try {
    originalWarn.apply(console, args);
  } catch {}
};
console.error = (...args: any[]) => {
  logToFile('[ERROR] ' + serializeArgs(args));
  try {
    originalError.apply(console, args);
  } catch {}
};
