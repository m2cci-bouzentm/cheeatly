import { describe, it, expect, afterAll } from 'vitest';
import '../helpers/testEnv';
import { getPrisma } from '../../config/database';
import { getProviderNames } from '../../services/llm/provider';

describe('core health surface', () => {
  afterAll(async () => {
    await getPrisma().$disconnect();
  });

  it('exposes the provider list (gemini included)', () => {
    expect(getProviderNames()).toEqual(expect.arrayContaining(['gemini']));
  });

  it('database is initialized and queryable after initCore', async () => {
    const count = await getPrisma().meeting.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });
});
