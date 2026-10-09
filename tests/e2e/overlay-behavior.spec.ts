import { expect, test, type Page } from '@playwright/test';

// Real React components/hooks; only the OS/provider boundary is controlled.
// These tests do not prove native capture, permissions, or persistence.
async function openOverlay(page: Page, interval = 3600) {
  await page.goto('http://localhost:5180');
  await expect(
    page.getByRole('button', { name: 'Logo Start Cheatly' })
  ).toBeVisible();
  await page.evaluate((interval) => {
    const w = window as any;
    const listeners = new Map<string, Set<(data: any) => void>>();
    w.behavior = {
      calls: [],
      scans: [],
      listeners,
      emit(name: string, data: any) {
        for (const callback of listeners.get(name) ?? []) callback(data);
      },
    };
    const record =
      (name: string) =>
      async (...args: any[]) => {
        w.behavior.calls.push([name, ...args]);
        return { success: true };
      };
    for (const name of [
      'endMeeting',
      'abortMeeting',
      'setModel',
      'setUndetectable',
      'modelSelectorCloseIfOpen',
      'closeSettingsWindow',
      'toggleModelSelector',
      'toggleSettingsWindow',
    ])
      w.desktopAPI[name] = record(name);
    for (const name of [
      'onNativeAudioTranscript',
      'onSessionReset',
      'onQuestionAnalysisConfigChanged',
      'onQuestionStateChanged',
      'onModelChanged',
      'onUndetectableChanged',
    ]) {
      w.desktopAPI[name] = (callback: (data: any) => void) => {
        const callbacks = listeners.get(name) ?? new Set();
        callbacks.add(callback);
        listeners.set(name, callbacks);
        return () => callbacks.delete(callback);
      };
    }
    w.desktopAPI.setModel = async (model: string) => {
      w.behavior.calls.push(['setModel', model]);
      w.behavior.emit('onModelChanged', model);
      return { success: true };
    };
    w.desktopAPI.getNativeAudioStatus = async () => ({
      connected: true,
      transcript: [],
    });
    w.desktopAPI.getQuestionAnalysisConfig = async () => ({
      enabled: true,
      interval,
      window: 2,
    });
    w.behavior.questionState = {
      questions: [],
      isScanning: false,
      scanError: '',
      scanNotice: '',
      settingsEnabled: true,
      isPaused: false,
      revision: 1,
    };
    w.behavior.publishQuestions = (patch: any) => {
      Object.assign(w.behavior.questionState, patch, {
        revision: w.behavior.questionState.revision + 1,
      });
      w.behavior.emit('onQuestionStateChanged', {
        ...w.behavior.questionState,
      });
      return { ...w.behavior.questionState };
    };
    w.desktopAPI.getQuestionState = async () => ({
      ...w.behavior.questionState,
    });
    w.desktopAPI.scanQuestions = async () => {
      w.behavior.scans.push('scan');
      return w.behavior.publishQuestions({
        scanNotice: 'Waiting for speech. Record a question, then scan again.',
      });
    };
    w.desktopAPI.setQuestionsPaused = async (isPaused: boolean) => {
      w.behavior.calls.push(['setQuestionsPaused', isPaused]);
      return w.behavior.publishQuestions({ isPaused, isScanning: false });
    };
    w.desktopAPI.dismissQuestion = async (id: string) => {
      w.behavior.calls.push(['dismissQuestion', id]);
      return w.behavior.publishQuestions({
        questions: w.behavior.questionState.questions.filter(
          (q: any) => q.id !== id
        ),
      });
    };
    w.desktopAPI.resetQuestions = async () =>
      w.behavior.publishQuestions({ questions: [] });
    w.desktopAPI.setWindowMode = async (mode: string) => {
      w.behavior.calls.push(['setWindowMode', mode]);
      window.dispatchEvent(
        new CustomEvent('cheatly-window-mode', { detail: mode })
      );
    };
    window.dispatchEvent(
      new CustomEvent('cheatly-window-mode', { detail: 'overlay' })
    );
  }, interval);
  await expect(page.getByRole('button', { name: 'Stop & Save' })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Pause mic', exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'GPT-OSS 120B', exact: true })
  ).toBeVisible();
  await page.evaluate(() => {
    (window as any).behavior.calls = [];
  });
}

async function scans(page: Page) {
  return page.evaluate(() => (window as any).behavior.scans);
}

test('selectors stay embedded, select a model, and dismiss on Escape/outside click', async ({
  page,
  context,
}) => {
  await openOverlay(page);
  const model = page.getByRole('button', { name: 'GPT-OSS 120B', exact: true });
  await model.click();
  await page.getByRole('button', { name: 'GLM 4.7', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'GLM 4.7', exact: true })
  ).toHaveAttribute('aria-expanded', 'false');
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as any).behavior.calls.filter(
            (c: any[]) => c[0] === 'setModel'
          ).length
      )
    )
    .toBe(1);
  await page.getByRole('button', { name: 'GLM 4.7', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(
    page.getByRole('button', { name: 'GLM 4.7', exact: true })
  ).toHaveAttribute('aria-expanded', 'false');
  const settings = page.getByRole('button', { name: 'Quick settings' });
  await settings.click();
  await page.getByRole('switch').first().click();
  await expect(page.getByText('Undetectable', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Transcript', exact: true }).click();
  await expect(settings).toHaveAttribute('aria-expanded', 'false');
  expect(context.pages()).toHaveLength(1);
  const calls = await page.evaluate(() => (window as any).behavior.calls);
  expect(calls).toContainEqual(['setUndetectable', true]);
  expect(
    calls.some((c: any[]) =>
      ['toggleModelSelector', 'toggleSettingsWindow'].includes(c[0])
    )
  ).toBe(false);
});

for (const [label, command] of [
  ['Stop & Save', 'endMeeting'],
  ['Discard', 'abortMeeting'],
]) {
  test(`${label} waits for completion, prevents duplicate requests, then returns to launcher`, async ({
    page,
  }) => {
    await openOverlay(page);
    await page.evaluate((command) => {
      const w = window as any;
      w.desktopAPI[command] = () => {
        w.behavior.calls.push([command]);
        return new Promise((resolve) => {
          w.behavior.finish = resolve;
        });
      };
    }, command);
    const button = page.getByRole('button', { name: label, exact: true });
    await button.evaluate((node: HTMLButtonElement) => {
      node.click();
      node.click();
    });
    await expect(
      page.getByRole('button', { name: 'Stopping…' })
    ).toBeDisabled();
    await expect(
      page.getByRole('button', { name: 'Discard', exact: true })
    ).toBeDisabled();
    expect(await page.evaluate(() => (window as any).behavior.calls)).toEqual([
      [command],
    ]);
    await page.evaluate(() =>
      (window as any).behavior.finish({ success: true })
    );
    await expect(
      page.getByRole('button', { name: 'Logo Start Cheatly' })
    ).toBeVisible();
    expect(await page.evaluate(() => (window as any).behavior.calls)).toEqual([
      [command],
      ['modelSelectorCloseIfOpen'],
      ['closeSettingsWindow'],
      ['setWindowMode', 'launcher'],
    ]);
  });

  test(`${label} failure stays in overlay and permits retry`, async ({
    page,
  }) => {
    await openOverlay(page);
    await page.evaluate((command) => {
      const w = window as any;
      w.desktopAPI[command] = async () => {
        w.behavior.calls.push([command]);
        if (
          w.behavior.calls.filter((call: string[]) => call[0] === command)
            .length === 1
        )
          throw new Error('Controlled stop failure');
        return { success: true };
      };
    }, command);
    await page.getByRole('button', { name: label, exact: true }).click();
    await expect(
      page.getByText('Error: Controlled stop failure', { exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: label, exact: true })
    ).toBeEnabled();
    const calls = await page.evaluate(() => (window as any).behavior.calls);
    expect(calls.filter((call: string[]) => call[0] === command)).toEqual([
      [command],
    ]);
    expect(calls.some((call: string[]) => call[0] === 'setWindowMode')).toBe(
      false
    );
    await page.getByRole('button', { name: label, exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Logo Start Cheatly' })
    ).toBeVisible();
  });
}

// Scheduling, transcript windows, deduplication, retries and cancellation now live
// in Rust QuestionService tests. Here we exercise the actual UI/IPC contract.
test('manual scan displays backend empty-input notice', async ({ page }) => {
  await openOverlay(page);
  await page.getByRole('button', { name: 'Scan now', exact: true }).click();
  await expect(
    page.getByText('Waiting for speech. Record a question, then scan again.')
  ).toBeVisible();
  expect(await scans(page)).toEqual(['scan']);
});

test('scan errors and subsequent suggestions are rendered from backend state', async ({
  page,
}) => {
  await openOverlay(page);
  await page.evaluate(() => {
    const w = window as any;
    w.desktopAPI.scanQuestions = async () => {
      w.behavior.scans.push('scan');
      return w.behavior.publishQuestions(
        w.behavior.scans.length === 1
          ? {
              scanError:
                'Add an OpenRouter API key in Settings → AI Providers to detect questions.',
            }
          : {
              scanError: '',
              scanNotice: 'Scan complete. 1 new suggestions.',
              questions: [
                {
                  id: 'q1',
                  speaker: 'Them',
                  text: 'How do we prevent duplicate payments?',
                  timestamp: 1,
                  type: 'question',
                },
              ],
            }
      );
    };
  });
  await page.getByRole('button', { name: 'Scan now', exact: true }).click();
  await expect(
    page.getByText(
      'Add an OpenRouter API key in Settings → AI Providers to detect questions.'
    )
  ).toBeVisible();
  await page.getByRole('button', { name: 'Scan now', exact: true }).click();
  await expect(
    page.getByText('Scan complete. 1 new suggestions.')
  ).toBeVisible();
  await expect(
    page.getByText('How do we prevent duplicate payments?', { exact: true })
  ).toHaveCount(1);
  expect(await scans(page)).toHaveLength(2);
});

test('backend pending state disables scan and pause invokes backend command', async ({
  page,
}) => {
  await openOverlay(page);
  await page.evaluate(() =>
    (window as any).behavior.publishQuestions({ isScanning: true })
  );
  await expect(
    page.getByRole('button', { name: 'Scan now', exact: true })
  ).toBeDisabled();
  await page.getByRole('button', { name: 'Pause scanning' }).click();
  await expect(page.getByText('Analysis paused')).toBeVisible();
  await page.getByRole('button', { name: 'Resume scanning' }).click();
  await expect(
    page.getByRole('button', { name: 'Scan now', exact: true })
  ).toBeEnabled();
  expect(
    await page.evaluate(() =>
      (window as any).behavior.calls.filter(
        (call: string[]) => call[0] === 'setQuestionsPaused'
      )
    )
  ).toEqual([
    ['setQuestionsPaused', true],
    ['setQuestionsPaused', false],
  ]);
});

test('overlay remount hydrates backend suggestions and ignores older revisions', async ({
  page,
}) => {
  await openOverlay(page);
  await page.evaluate(() => {
    const w = window as any;
    w.behavior.publishQuestions({
      questions: [
        {
          id: 'q1',
          speaker: 'Them',
          text: 'Retained question?',
          timestamp: 1,
          type: 'question',
        },
      ],
    });
    w.behavior.emit('onQuestionStateChanged', {
      ...w.behavior.questionState,
      revision: 0,
      questions: [],
    });
  });
  await expect(
    page.getByText('Retained question?', { exact: true })
  ).toBeVisible();
  await page.evaluate(() =>
    (window as any).desktopAPI.setWindowMode('launcher')
  );
  await expect(
    page.getByRole('button', { name: 'Logo Start Cheatly' })
  ).toBeVisible();
  await page.evaluate(() =>
    (window as any).desktopAPI.setWindowMode('overlay')
  );
  await expect(
    page.getByText('Retained question?', { exact: true })
  ).toBeVisible();
  expect(await scans(page)).toEqual([]);
});
