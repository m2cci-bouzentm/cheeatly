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
    w.desktopAPI.analyzeTranscript = async (text: string) => {
      w.behavior.scans.push(text);
      return { questions: [] };
    };
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

async function speech(
  page: Page,
  text: string,
  final = true,
  speaker = 'interviewer'
) {
  await page.evaluate(
    ({ text, final, speaker }) => {
      (window as any).behavior.emit('onNativeAudioTranscript', {
        text,
        final,
        speaker,
      });
    },
    { text, final, speaker }
  );
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

test('empty manual scan explains that speech is needed without calling provider', async ({
  page,
}) => {
  await openOverlay(page);
  await page.getByRole('button', { name: 'Scan now', exact: true }).click();
  await expect(
    page.getByText('Waiting for speech. Record a question, then scan again.')
  ).toBeVisible();
  expect(await scans(page)).toEqual([]);
});

test('manual scan includes partial speech, retries errors, and deduplicates suggestions', async ({
  page,
}) => {
  await openOverlay(page);
  await page.evaluate(() => {
    const w = window as any;
    w.desktopAPI.analyzeTranscript = async (text: string) => {
      w.behavior.scans.push(text);
      if (w.behavior.scans.length === 1)
        throw new Error('No OpenRouter API key');
      return {
        questions: [
          { text: 'How do we prevent duplicate payments?' },
          { text: '  HOW DO WE PREVENT DUPLICATE PAYMENTS? ' },
          { text: '' },
        ],
      };
    };
  });
  await speech(page, 'How do we prevent duplicate payments?', false);
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
  await page.getByRole('button', { name: 'Scan now', exact: true }).click();
  await expect(
    page.getByText('Scan complete. No new suggestions.')
  ).toBeVisible();
  expect(await scans(page)).toEqual(
    Array(3).fill('Them: How do we prevent duplicate payments?')
  );
  await expect(
    page.getByText('How do we prevent duplicate payments?', { exact: true })
  ).toHaveCount(1);
});

test('pending scan is single flight and results from before pause are ignored', async ({
  page,
}) => {
  await openOverlay(page);
  await page.evaluate(() => {
    const w = window as any;
    w.desktopAPI.analyzeTranscript = (text: string) => {
      w.behavior.scans.push(text);
      return new Promise((resolve) => {
        w.behavior.resolveScan = resolve;
      });
    };
  });
  await speech(page, 'Which database?');
  const scan = page.getByRole('button', { name: 'Scan now', exact: true });
  await scan.evaluate((node: HTMLButtonElement) => {
    node.click();
    node.click();
  });
  await expect(scan).toBeDisabled();
  expect(await scans(page)).toHaveLength(1);
  await page.getByRole('button', { name: 'Pause scanning' }).click();
  await page.evaluate(() =>
    (window as any).behavior.resolveScan({
      questions: [{ text: 'Stale suggestion' }],
    })
  );
  await expect(page.getByText('Analysis paused')).toBeVisible();
  await page.getByRole('button', { name: 'Resume scanning' }).click();
  await expect(page.getByText('Stale suggestion')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Scan now', exact: true })
  ).toBeEnabled();
});

test('automatic scans honor transcript window, unchanged-text dedup, and pause', async ({
  page,
}) => {
  await page.clock.install();
  await openOverlay(page, 2);
  await speech(page, 'Old turn', true, 'user');
  await speech(page, 'Recent question?');
  await speech(page, 'Recent reply', true, 'user');
  await page.clock.fastForward(2000);
  await expect
    .poll(() => scans(page))
    .toEqual(['Them: Recent question?\nMe: Recent reply']);
  await page.clock.fastForward(6000);
  expect(await scans(page)).toHaveLength(1);
  await page.getByRole('button', { name: 'Pause scanning' }).click();
  await speech(page, 'Another question?');
  await page.clock.fastForward(6000);
  expect(await scans(page)).toHaveLength(1);
  await page.getByRole('button', { name: 'Resume scanning' }).click();
  await page.clock.fastForward(2000);
  await expect.poll(() => scans(page)).toHaveLength(2);
  expect((await scans(page))[1]).toBe(
    'Me: Recent reply\nThem: Another question?'
  );
});
