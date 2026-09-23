import { z } from 'zod';

const isoDate = /^\d{4}-\d{2}-\d{2}$/;
const time24 = /^([01]\d|2[0-3]):[0-5]\d$/;

export const voyaPlanDraftRequestSchema = z.object({
  destination: z.string().trim().min(2).max(160),
  country: z.string().trim().max(100).optional(),
  startDate: z.string().regex(isoDate).optional(),
  endDate: z.string().regex(isoDate).optional(),
  days: z.number().int().min(1).max(30),
  travelers: z.number().int().min(1).max(20).default(1),
  currency: z.string().trim().min(3).max(8).default('USD'),
  pace: z.enum(['relaxed', 'balanced', 'packed']).default('balanced'),
  budgetStyle: z.enum(['budget', 'moderate', 'premium', 'luxury']).default('moderate'),
  interests: z.array(z.string().trim().min(1).max(60)).max(12).default([]),
  notes: z.string().trim().max(1200).optional(),
});
export type VoyaPlanDraftRequest = z.infer<typeof voyaPlanDraftRequestSchema>;

export const voyaSuggestedActivitySchema = z.object({
  name: z.string().trim().min(1).max(180),
  category: z.string().trim().min(1).max(60),
  description: z.string().trim().min(1).max(600),
  area: z.string().trim().max(120).optional(),
  addressQuery: z.string().trim().max(220).optional(),
  startTime: z.string().regex(time24).optional(),
  durationMin: z.number().int().min(15).max(720),
  priceKnown: z.boolean(),
  price: z.number().nonnegative().optional(),
  priceLabel: z.string().trim().max(100).optional(),
  verificationStatus: z.literal('Suggested'),
  reservationRecommended: z.boolean().default(false),
  notes: z.string().trim().max(400).optional(),
}).superRefine((activity, ctx) => {
  if (!activity.priceKnown && activity.price !== undefined) {
    ctx.addIssue({ code: 'custom', path: ['price'], message: 'Unknown prices must not include a numeric price' });
  }
});

export const voyaDraftDaySchema = z.object({
  dayNumber: z.number().int().positive(),
  date: z.string().regex(isoDate).optional(),
  title: z.string().trim().min(1).max(140),
  objective: z.string().trim().min(1).max(320),
  neighborhood: z.string().trim().max(140).optional(),
  intensity: z.enum(['easy', 'balanced', 'full']),
  activities: z.array(voyaSuggestedActivitySchema).min(1).max(12),
  transportNote: z.string().trim().max(400).optional(),
});

export const voyaPlanDraftResponseSchema = z.object({
  destination: z.string().trim().min(1).max(160),
  country: z.string().trim().max(100).optional(),
  title: z.string().trim().min(1).max(180),
  summary: z.string().trim().min(1).max(900),
  strategy: z.object({
    rhythm: z.string().trim().min(1).max(600),
    baseArea: z.string().trim().max(180).optional(),
    transportStrategy: z.string().trim().min(1).max(600),
    foodStrategy: z.string().trim().min(1).max(600),
    reservationPriorities: z.array(z.string().trim().min(1).max(180)).max(10),
    mustKnow: z.array(z.string().trim().min(1).max(240)).max(10),
  }),
  days: z.array(voyaDraftDaySchema).min(1).max(30),
  cautions: z.array(z.string().trim().min(1).max(240)).max(10).default([]),
  generatedBy: z.object({
    provider: z.enum(['local', 'openai', 'anthropic']),
    model: z.string().min(1),
  }),
});
export type VoyaPlanDraftResponse = z.infer<typeof voyaPlanDraftResponseSchema>;

export const voyaMaterializeDraftRequestSchema = z.object({
  request: voyaPlanDraftRequestSchema,
  draft: voyaPlanDraftResponseSchema,
  reminderDays: z.number().int().min(0).max(30).optional().default(0),
});
export type VoyaMaterializeDraftRequest = z.infer<typeof voyaMaterializeDraftRequestSchema>;
