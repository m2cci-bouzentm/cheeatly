import { ipcMain } from 'electron';

export function safeHandle(
  channel: string,
  listener: (event: any, ...args: any[]) => Promise<any> | any
): void {
  ipcMain.removeHandler(channel);
  ipcMain.handle(channel, listener);
}

export function safeOn(
  channel: string,
  listener: (event: any, ...args: any[]) => void
): void {
  ipcMain.removeAllListeners(channel);
  ipcMain.on(channel, listener);
}
