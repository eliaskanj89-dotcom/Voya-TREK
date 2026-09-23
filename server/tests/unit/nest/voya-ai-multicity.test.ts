import { describe, expect, it } from 'vitest';
import type { VoyaMultiCityPlanDraft, VoyaMultiCityPlanRequest } from '@trek/shared';
import { VoyaAiService, VoyaAiInvalidDraftError } from '../../../src/nest/voya-ai/voya-ai.service';

const service = new VoyaAiService(
  {} as never, {} as never, {} as never, {} as never, {} as never,
  {} as never, {} as never, {} as never, {} as never,
);

const request = (overrides: Partial<VoyaMultiCityPlanRequest> = {}): VoyaMultiCityPlanRequest => ({
  destinations: [{ name: 'Rome' }, { name: 'Florence' }],
  days: 4,
  travelers: 2,
  currency: 'EUR',
  pace: 'balanced',
  budgetStyle: 'moderate',
  interests: ['food', 'culture'],
  allowReorder: true,
  ...overrides,
});

const activity = (name: string, category = 'Sightseeing') => ({
  name,
  category,
  description: `Visit ${name}`,
  durationMin: 90,
  priceKnown: false as const,
  verificationStatus: 'Suggested' as const,
  reservationRecommended: false,
});

const draft = (overrides: Partial<VoyaMultiCityPlanDraft> = {}): VoyaMultiCityPlanDraft => ({
  title: 'Rome to Florence',
  summary: 'A balanced Italian journey.',
  journeySummary: 'Two cities connected by a lighter transfer day.',
  orderReason: 'Logical geographic sequence.',
  legs: [
    {
      order: 1,
      destination: 'Rome',
      allocatedDays: 2,
      nights: 1,
      summary: 'Ancient Rome and food.',
    },
    {
      order: 2,
      destination: 'Florence',
      allocatedDays: 2,
      nights: 1,
      summary: 'Renaissance Florence.',
      transportFromPrevious: 'Train',
      transferDurationLabel: 'Verify current schedule',
      transferNotes: 'Check the current operator schedule before booking.',
    },
  ],
  days: [
    { dayNumber: 1, destination: 'Rome', title: 'Rome arrival', objective: 'Settle in', intensity: 'easy', isTransferDay: false, activities: [activity('Pantheon')] },
    { dayNumber: 2, destination: 'Rome', title: 'Ancient Rome', objective: 'Explore', intensity: 'balanced', isTransferDay: false, activities: [activity('Colosseum')] },
    { dayNumber: 3, destination: 'Florence', title: 'To Florence', objective: 'Transfer and settle', intensity: 'easy', isTransferDay: true, activities: [activity('Train to Florence', 'Transport'), activity('Piazza della Signoria')] },
    { dayNumber: 4, destination: 'Florence', title: 'Florence', objective: 'Explore', intensity: 'balanced', isTransferDay: false, activities: [activity('Uffizi Gallery')] },
  ],
  cautions: [],
  generatedBy: { provider: 'openai', model: 'test-model' },
  ...overrides,
});

const assertQuality = (candidate: VoyaMultiCityPlanDraft, req = request()) =>
  (service as unknown as { assertMultiCityQuality: (draft: VoyaMultiCityPlanDraft, request: VoyaMultiCityPlanRequest) => void })
    .assertMultiCityQuality(candidate, req);

describe('Voya multi-city quality guard', () => {
  it('accepts a balanced valid journey', () => {
    expect(() => assertQuality(draft())).not.toThrow();
  });

  it('rejects a later city whose first day is not a transfer day', () => {
    const candidate = draft();
    candidate.days[2] = { ...candidate.days[2], isTransferDay: false };
    expect(() => assertQuality(candidate)).toThrow(VoyaAiInvalidDraftError);
  });

  it('rejects an overloaded transfer day', () => {
    const candidate = draft();
    candidate.days[2] = {
      ...candidate.days[2],
      activities: [
        activity('Train to Florence', 'Transport'),
        activity('Stop 1'), activity('Stop 2'), activity('Stop 3'),
        activity('Stop 4'), activity('Stop 5'),
      ],
    };
    expect(() => assertQuality(candidate)).toThrow(/overloaded/i);
  });

  it('rejects repeated named places across cities', () => {
    const candidate = draft();
    candidate.days[3] = { ...candidate.days[3], activities: [activity('Pantheon')] };
    expect(() => assertQuality(candidate)).toThrow(/Repeated named places/i);
  });

  it('rejects reordering when the traveler disabled it', () => {
    const candidate = draft({
      legs: [
        {
          order: 1,
          destination: 'Florence',
          allocatedDays: 2,
          nights: 1,
          summary: 'Florence first.',
        },
        {
          order: 2,
          destination: 'Rome',
          allocatedDays: 2,
          nights: 1,
          summary: 'Rome second.',
          transportFromPrevious: 'Train',
        },
      ],
      days: [
        { dayNumber: 1, destination: 'Florence', title: 'Florence', objective: 'Explore', intensity: 'balanced', isTransferDay: false, activities: [activity('Uffizi Gallery')] },
        { dayNumber: 2, destination: 'Florence', title: 'Florence', objective: 'Explore', intensity: 'balanced', isTransferDay: false, activities: [activity('Ponte Vecchio')] },
        { dayNumber: 3, destination: 'Rome', title: 'Rome transfer', objective: 'Transfer', intensity: 'easy', isTransferDay: true, activities: [activity('Train to Rome', 'Transport')] },
        { dayNumber: 4, destination: 'Rome', title: 'Rome', objective: 'Explore', intensity: 'balanced', isTransferDay: false, activities: [activity('Colosseum')] },
      ],
    });
    expect(() => assertQuality(candidate, request({ allowReorder: false }))).toThrow(/order changed/i);
  });
});
