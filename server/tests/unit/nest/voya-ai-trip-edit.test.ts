import { describe, expect, it } from 'vitest';
import type { VoyaDayEditDraft, VoyaTripEditPlan } from '@trek/shared';
import { VoyaAiInvalidDraftError, VoyaAiService } from '../../../src/nest/voya-ai/voya-ai.service';

const service = new VoyaAiService(
  {} as never, {} as never, {} as never, {} as never, {} as never,
  {} as never, {} as never, {} as never, {} as never,
);

const plan = (dayIds = [11, 22]): VoyaTripEditPlan => ({
  tripId: 7,
  summary: 'Rebalance two days without changing the rest of the trip.',
  affectedDays: dayIds.map((dayId, index) => ({
    dayId,
    reason: `Day ${index + 1} needs adjustment.`,
    instruction: `Rework day ${index + 1} while preserving strong existing stops.`,
  })),
  generatedBy: { provider: 'openai', model: 'test-model' },
});

const draft = (dayId: number, tripId = 7): VoyaDayEditDraft => ({
  tripId,
  dayId,
  summary: 'A safer day edit.',
  sequence: [
    {
      kind: 'new',
      activity: {
        name: `Suggestion ${dayId}`,
        category: 'Sightseeing',
        description: 'A Voya suggestion used only for contract testing.',
        durationMin: 60,
        priceKnown: false,
        verificationStatus: 'Suggested',
        reservationRecommended: false,
      },
    },
  ],
  removedAssignmentIds: [],
  generatedBy: { provider: 'openai', model: 'test-model' },
});

const assertBundle = (candidatePlan: VoyaTripEditPlan, drafts: VoyaDayEditDraft[]) =>
  (service as unknown as {
    assertAtomicTripEditBundle: (plan: VoyaTripEditPlan, drafts: VoyaDayEditDraft[]) => void
  }).assertAtomicTripEditBundle(candidatePlan, drafts);

describe('Voya atomic whole-trip edit guard', () => {
  it('accepts exactly one reviewed draft for every affected day', () => {
    expect(() => assertBundle(plan(), [draft(11), draft(22)])).not.toThrow();
  });

  it('rejects applying when an affected day has no reviewed draft', () => {
    expect(() => assertBundle(plan(), [draft(11)])).toThrow(/exactly one reviewed draft/i);
  });

  it('rejects duplicate day drafts', () => {
    expect(() => assertBundle(plan(), [draft(11), draft(11)])).toThrow(/duplicate day drafts/i);
  });

  it('rejects a reviewed draft from another trip', () => {
    expect(() => assertBundle(plan(), [draft(11), draft(22, 99)])).toThrow(
      VoyaAiInvalidDraftError,
    );
  });
});
