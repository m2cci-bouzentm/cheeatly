import { app } from 'electron';
import * as path from 'path';
import type { AppState } from '../main';
import type { CheatlyCore, ProviderCredentials } from '../../core/src';
type UpdateTitlePayload = { id: string; title: string };
type UpdateSummaryPayload = { id: string; updates: any };
import { safeHandle } from './safeHandle';

type MeetingServices = {
  core: CheatlyCore;
  resolveLlmCredentials: () => ProviderCredentials;
};

// Core rows cross IPC as renderer-facing meeting objects.
export function mapMeeting(m: any, statusFor: any): any {
  const speakerFromRaw = (raw: string): string => {
    if (raw === 'Me') return 'user';
    if (raw === 'Them') return 'interviewer';
    return raw;
  };
  const summary = m.summary || '';
  return {
    id: m.id,
    title: m.title || 'Untitled Session',
    summaryStatus: statusFor(m),
    date: m.createdAt.toISOString(),
    duration: '0:00',
    summary,
    // The Summary tab renders detailedSummary.overview through ReactMarkdown —
    // the server's markdown summary goes there verbatim.
    detailedSummary: { overview: summary, actionItems: [], keyPoints: [] },
    transcript: (m.transcript || '')
      .split('\n')
      .filter(Boolean)
      .map((line: string, i: number) => {
        const colonIdx = line.indexOf(':');
        const raw = colonIdx > 0 ? line.slice(0, colonIdx).trim() : 'Unknown';
        const speaker = speakerFromRaw(raw);
        const text = colonIdx > 0 ? line.slice(colonIdx + 1).trim() : line;
        return { speaker, text, timestamp: i };
      }),
  };
}

// The finished transcript enters storage only through this two-phase pipeline.
function createMeetingPersistenceHandler(
  core: CheatlyCore,
  processMeeting: (id: string) => Promise<unknown>,
  broadcast: (channel: string) => void
): (transcript: string, aborted: boolean) => void {
  return (transcript, aborted) => {
    console.log(
      `[Meeting] Transcript ready: length ${transcript.length}, segments: ${transcript.split('\n').filter(Boolean).length}, aborted: ${aborted}`
    );
    if (!transcript.trim() || aborted) return;

    const id = `meeting-${Date.now()}`;

    core.meetings
      .create({ id, transcript })
      .then(() => {
        // Broadcast immediately after process() so launcher shows pending summary state.
        const processing = processMeeting(id);
        broadcast('meetings-updated');
        processing
          .then(() => {
            broadcast('meetings-updated');
          })
          .catch((err: any) => {
            console.error(
              '[Meeting] Summary/RAG failed (meeting saved, summary skipped):',
              err.message
            );
            broadcast('meetings-updated');
          });
      })
      .catch((err: any) => {
        console.error('[Meeting] Failed to save meeting:', err.message);
      });
  };
}

export function registerMeetingHandlers(
  appState: AppState,
  services: MeetingServices
): void {
  const { core, resolveLlmCredentials } = services;
  const statusFor = core.meetings.summaryStatusFor;
  // async wrapper: a sync resolveLlmCredentials() throw (no provider
  // configured) becomes a rejection the callers' .catch paths handle.
  const processMeeting = async (id: string) =>
    core.meetings.process(id, resolveLlmCredentials());

  safeHandle('delete-screenshot', async (_event, filePath: string) => {
    // Guard: only allow deletion of files within the app's own userData directory
    const userDataDir = app.getPath('userData');
    const resolved = path.resolve(filePath);
    if (!resolved.startsWith(userDataDir + path.sep)) {
      console.warn(
        '[IPC] delete-screenshot: path outside userData rejected:',
        filePath
      );
      return { success: false, error: 'Path not allowed' };
    }
    return appState.deleteScreenshot(resolved);
  });
  safeHandle('take-screenshot', async () => {
    const screenshotPath = await appState.takeScreenshot();
    const preview = await appState.getImagePreview(screenshotPath);
    return { path: screenshotPath, preview };
  });
  safeHandle('get-screenshots', async () => {
    return Promise.all(
      appState.getScreenshotQueue().map(async (path) => ({
        path,
        preview: await appState.getImagePreview(path),
      }))
    );
  });
  safeHandle('get-meeting-active', async () => {
    return appState.getIsMeetingActive();
  });
  safeHandle('reset-queues', async () => {
    try {
      appState.clearQueues();
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });
  safeHandle('retry-meeting-summary', async (_event, id: string) => {
    const processing = processMeeting(id);
    appState.broadcast('meetings-updated');
    processing
      .then(() => appState.broadcast('meetings-updated'))
      .catch((err: any) => {
        console.error('[Meeting] Summary retry failed:', err.message);
        appState.broadcast('meetings-updated');
      });
    return { success: true };
  });
  safeHandle('delete-meeting', async (_event, id: string) => {
    await core.meetings.remove(id);
    return { success: true };
  });
  safeHandle('abort-meeting', async () => {
    await appState.abortMeeting();
  });
  safeHandle('start-meeting', async (_event, metadata?: any) => {
    try {
      await appState.startMeeting(metadata);
      return { success: true };
    } catch (error: any) {
      console.error('Error starting meeting:', error);
      return { success: false, error: error.message };
    }
  });
  // Persist after drain; early buffer reads miss trailing STT finals.
  appState.setMeetingPersistenceHandler(
    createMeetingPersistenceHandler(core, processMeeting, (ch) =>
      appState.broadcast(ch)
    )
  );

  safeHandle('end-meeting', async () => {
    try {
      await appState.endMeeting();
      return { success: true };
    } catch (error: any) {
      console.error('Error ending meeting:', error);
      return { success: false, error: error.message };
    }
  });
  safeHandle('get-recent-meetings', async () => {
    const { meetings } = await core.meetings.list({ limit: 50 });
    return meetings.map((m) => mapMeeting(m, statusFor));
  });
  safeHandle('get-meeting-details', async (_event, id) => {
    return mapMeeting(await core.meetings.get(id), statusFor);
  });
  safeHandle(
    'update-meeting-title',
    async (_event, { id, title }: UpdateTitlePayload) => {
      await core.meetings.update(id, { title });
      return { success: true };
    }
  );
  safeHandle(
    'update-meeting-summary',
    async (_event, { id, updates }: UpdateSummaryPayload) => {
      const summary = typeof updates === 'string' ? updates : updates?.summary;
      await core.meetings.update(id, { summary });
      return { success: true };
    }
  );
  safeHandle('flush-database', async () => {
    return { success: true };
  });
}
