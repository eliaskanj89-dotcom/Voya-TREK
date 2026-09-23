import { Injectable } from '@nestjs/common';
import {
  type VoyaPlanDraftRequest,
  type VoyaPlanDraftResponse,
  voyaPlanDraftResponseSchema,
} from '@trek/shared';
import { z } from 'zod';
import { LlmConfigResolver } from '../llm-parse/llm-config.resolver';
import { StructuredGenerationService } from './structured-generation.service';

const generatedPlanSchema = voyaPlanDraftResponseSchema.omit({ generatedBy: true });

export class VoyaAiUnavailableError extends Error {
  constructor() {
    super('Voya AI is not configured. Enable the LLM integration and choose a model in Settings.');
    this.name = 'VoyaAiUnavailableError';
  }
}

export class VoyaAiInvalidDraftError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VoyaAiInvalidDraftError';
  }
}

@Injectable()
export class VoyaAiService {
  constructor(
    private readonly configResolver: LlmConfigResolver,
    private readonly generator: StructuredGenerationService,
  ) {}

  async planDraft(userId: number, request: VoyaPlanDraftRequest): Promise<VoyaPlanDraftResponse> {
    const config = this.configResolver.resolve(userId);
    if (!config) throw new VoyaAiUnavailableError();

    const jsonSchema = z.toJSONSchema(generatedPlanSchema);
    let repair = '';

    for (let attempt = 0; attempt < 2; attempt++) {
      const raw = await this.generator.generate(config, {
        system: SYSTEM_PROMPT,
        user: this.userPrompt(request, repair),
        jsonSchema,
      });

      try {
        const normalized = this.normalize(raw, request);
        const parsed = generatedPlanSchema.parse(normalized);
        this.assertQuality(parsed, request);
        return {
          ...parsed,
          generatedBy: { provider: config.provider, model: config.model },
        };
      } catch (error) {
        if (attempt === 1) {
          const detail = error instanceof Error ? error.message : 'unknown validation error';
          throw new VoyaAiInvalidDraftError(`The model could not produce a valid Voya itinerary: ${detail}`);
        }
        repair = this.validationMessage(error);
      }
    }

    throw new VoyaAiInvalidDraftError('The model could not produce a valid Voya itinerary');
  }

  private userPrompt(request: VoyaPlanDraftRequest, repair: string): string {
    const interests = request.interests.length ? request.interests.join(', ') : 'general discovery, food, culture and local character';
    return [
      `Plan a ${request.days}-day trip to ${request.destination}${request.country ? `, ${request.country}` : ''}.`,
      request.startDate ? `Start date: ${request.startDate}.` : '',
      request.endDate ? `End date: ${request.endDate}.` : '',
      `Travelers: ${request.travelers}. Pace: ${request.pace}. Budget style: ${request.budgetStyle}. Currency: ${request.currency}.`,
      `Interests: ${interests}.`,
      request.notes ? `Traveler notes: ${request.notes}` : '',
      'Build a realistic daily rhythm with geographically coherent neighborhoods and enough breathing room for transfers.',
      'Use distinct named places across the trip. Do not repeat restaurants, cafes, museums, landmarks, or attractions on later days.',
      'Do not claim live availability, current opening hours, confirmed reservation status, visa rules, or real-time transport status.',
      'This generation call has no verified pricing source. Therefore every activity MUST use priceKnown=false and MUST omit numeric price. A qualitative priceLabel such as "$$ · check current price" is allowed.',
      'Every activity is only a suggestion until Voya verifies it, so verificationStatus MUST be exactly "Suggested".',
      'Prefer concrete real places when you are confident they exist. If uncertain, use a neighborhood-level or category-level activity rather than inventing a business.',
      'Do not include hotels as booked stays. You may describe a recommended base area in strategy.baseArea.',
      repair ? `Your previous draft failed validation. Correct these problems on the next full draft: ${repair}` : '',
    ].filter(Boolean).join('\n');
  }

  private normalize(raw: unknown, request: VoyaPlanDraftRequest): unknown {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw;
    const out = structuredClone(raw) as Record<string, unknown>;
    const days = Array.isArray(out.days) ? out.days : [];

    out.days = days.map((value, index) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
      const day = { ...(value as Record<string, unknown>), dayNumber: index + 1 };
      if (request.startDate) day.date = addIsoDays(request.startDate, index);
      else delete day.date;

      if (Array.isArray(day.activities)) {
        day.activities = day.activities.map((activity) => {
          if (!activity || typeof activity !== 'object' || Array.isArray(activity)) return activity;
          const next = { ...(activity as Record<string, unknown>), verificationStatus: 'Suggested', priceKnown: false };
          delete next.price;
          return next;
        });
      }
      return day;
    });

    return out;
  }

  private assertQuality(plan: z.infer<typeof generatedPlanSchema>, request: VoyaPlanDraftRequest): void {
    if (plan.days.length !== request.days) {
      throw new VoyaAiInvalidDraftError(`Expected exactly ${request.days} days but received ${plan.days.length}`);
    }
    const seen = new Set<string>();
    const duplicates = new Set<string>();
    for (const day of plan.days) {
      for (const activity of day.activities) {
        const key = canonicalPlaceName(activity.name);
        if (!key || GENERIC_ACTIVITY_NAMES.has(key)) continue;
        if (seen.has(key)) duplicates.add(activity.name);
        seen.add(key);
      }
    }
    if (duplicates.size) {
      throw new VoyaAiInvalidDraftError(`Repeated named places: ${Array.from(duplicates).slice(0, 6).join(', ')}`);
    }
  }

  private validationMessage(error: unknown): string {
    if (error instanceof z.ZodError) {
      return error.issues.slice(0, 8).map((issue) => `${issue.path.join('.') || 'draft'}: ${issue.message}`).join('; ');
    }
    return error instanceof Error ? error.message : 'The response did not match the itinerary contract';
  }
}

function addIsoDays(date: string, offset: number): string {
  const [year, month, day] = date.split('-').map(Number);
  const value = new Date(Date.UTC(year, month - 1, day + offset));
  return value.toISOString().slice(0, 10);
}

function canonicalPlaceName(value: string): string {
  return value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

const GENERIC_ACTIVITY_NAMES = new Set([
  'free time',
  'hotel',
  'break',
  'transfer',
  'airport transfer',
  'walk',
  'walking tour',
  'lunch',
  'dinner',
  'breakfast',
]);

const SYSTEM_PROMPT = `You are Voya, a premium travel-planning engine.
Create practical, human-paced itineraries that feel intentionally designed rather than mechanically filled.
Accuracy and trust are more important than false precision.
Never invent real-time availability, exact prices, opening hours, or reservation confirmation.
Never present an unverified suggestion as verified.
Return only the requested structured itinerary object.`;
