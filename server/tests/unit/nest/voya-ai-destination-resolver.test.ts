import { describe, expect, it, vi } from 'vitest';
import type { User } from '../../../src/types';
import { VoyaAiInvalidDraftError, VoyaAiService } from '../../../src/nest/voya-ai/voya-ai.service';

const user = { id: 7 } as User;
const config = { provider: 'openai', model: 'test-model' } as never;

const makeService = (generated: unknown[]) => {
  const resolve = vi.fn(() => config);
  const generate = vi.fn();
  for (const value of generated) generate.mockResolvedValueOnce(value);

  const service = new VoyaAiService(
    { resolve } as never,
    { generate } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );

  return { service, resolve, generate };
};

const georgiaOptions = {
  suggestions: [
    {
      name: 'Georgia',
      country: 'Georgia',
      type: 'Country',
      disambiguation: 'country in the Caucasus',
      subtitle: 'A country between Eastern Europe and Western Asia.',
      searchTerm: 'Georgia country',
    },
    {
      name: 'Georgia',
      country: 'United States',
      region: 'Georgia',
      type: 'State',
      disambiguation: 'U.S. state',
      subtitle: 'A state in the southeastern United States.',
      searchTerm: 'Georgia, United States',
    },
  ],
};

describe('Voya destination resolver', () => {
  it('returns validated canonical destination options with provider metadata', async () => {
    const { service, resolve, generate } = makeService([georgiaOptions]);

    const result = await service.resolveDestination(user, { query: 'Georgia' });

    expect(resolve).toHaveBeenCalledWith(user.id);
    expect(generate).toHaveBeenCalledTimes(1);
    expect(result.generatedBy).toEqual({ provider: 'openai', model: 'test-model' });
    expect(result.suggestions).toHaveLength(2);
    expect(result.suggestions[0].searchTerm).toBe('Georgia country');
    expect(result.suggestions[1].type).toBe('State');
  });

  it('rejects duplicate geographic interpretations instead of guessing', async () => {
    const duplicate = {
      suggestions: [
        georgiaOptions.suggestions[0],
        { ...georgiaOptions.suggestions[0], searchTerm: 'Georgia' },
      ],
    };
    const { service, generate } = makeService([duplicate, duplicate]);

    await expect(service.resolveDestination(user, { query: 'Georgia' }))
      .rejects.toThrow(VoyaAiInvalidDraftError);
    expect(generate).toHaveBeenCalledTimes(2);
  });
});
