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
  destination: z.string().trim().min(1).max(160).optional(),
  country: z.string().trim().max(100).optional(),
  isTransferDay: z.boolean().optional().default(false),
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

export const voyaVerifyTripRequestSchema = z.object({
  tripId: z.number().int().positive(),
  destination: z.string().trim().min(2).max(160).optional(),
  lang: z.string().trim().max(35).optional(),
});
export type VoyaVerifyTripRequest = z.infer<typeof voyaVerifyTripRequestSchema>;

export const voyaVerifyTripResultSchema = z.object({
  tripId: z.number().int().positive(),
  checked: z.number().int().nonnegative(),
  verified: z.number().int().nonnegative(),
  unresolved: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  sourceCounts: z.record(z.string(), z.number().int().nonnegative()),
  items: z.array(z.object({
    placeId: z.number().int().positive(),
    name: z.string(),
    status: z.enum(['verified', 'unresolved', 'already_verified', 'error']),
    source: z.string().nullable(),
    matchedName: z.string().nullable(),
    reason: z.string(),
  })),
});
export type VoyaVerifyTripResult = z.infer<typeof voyaVerifyTripResultSchema>;


export const voyaDayEditRequestSchema = z.object({
  tripId: z.number().int().positive(),
  dayId: z.number().int().positive(),
  instruction: z.string().trim().min(3).max(1200),
});
export type VoyaDayEditRequest = z.infer<typeof voyaDayEditRequestSchema>;

export const voyaDayEditExistingItemSchema = z.object({
  kind: z.literal('existing'),
  assignmentId: z.number().int().positive(),
  startTime: z.string().regex(time24).nullable().optional(),
  endTime: z.string().regex(time24).nullable().optional(),
  notes: z.string().trim().max(400).nullable().optional(),
});

export const voyaDayEditNewItemSchema = z.object({
  kind: z.literal('new'),
  activity: voyaSuggestedActivitySchema,
});

export const voyaDayEditDraftSchema = z.object({
  tripId: z.number().int().positive(),
  dayId: z.number().int().positive(),
  summary: z.string().trim().min(1).max(700),
  title: z.string().trim().min(1).max(140).optional(),
  objective: z.string().trim().max(500).optional(),
  sequence: z.array(z.discriminatedUnion('kind', [
    voyaDayEditExistingItemSchema,
    voyaDayEditNewItemSchema,
  ])).min(1).max(16),
  removedAssignmentIds: z.array(z.number().int().positive()).max(16).default([]),
  generatedBy: z.object({
    provider: z.enum(['local', 'openai', 'anthropic']),
    model: z.string().min(1),
  }),
});
export type VoyaDayEditDraft = z.infer<typeof voyaDayEditDraftSchema>;

export const voyaApplyDayEditRequestSchema = z.object({
  draft: voyaDayEditDraftSchema,
});
export type VoyaApplyDayEditRequest = z.infer<typeof voyaApplyDayEditRequestSchema>;


export const voyaTripEditRequestSchema = z.object({
  tripId: z.number().int().positive(),
  instruction: z.string().trim().min(3).max(1600),
});
export type VoyaTripEditRequest = z.infer<typeof voyaTripEditRequestSchema>;

export const voyaTripEditPlanSchema = z.object({
  tripId: z.number().int().positive(),
  summary: z.string().trim().min(1).max(900),
  affectedDays: z.array(z.object({
    dayId: z.number().int().positive(),
    reason: z.string().trim().min(1).max(400),
    instruction: z.string().trim().min(3).max(1000),
  })).min(1).max(30),
  generatedBy: z.object({
    provider: z.enum(['local', 'openai', 'anthropic']),
    model: z.string().min(1),
  }),
});
export type VoyaTripEditPlan = z.infer<typeof voyaTripEditPlanSchema>;


export const voyaTravelerDnaSchema = z.object({
  pace: z.enum(['relaxed', 'balanced', 'packed']).default('balanced'),
  budgetStyle: z.enum(['budget', 'moderate', 'premium', 'luxury']).default('moderate'),
  walkingTolerance: z.enum(['low', 'medium', 'high']).default('medium'),
  morningStyle: z.enum(['slow', 'standard', 'early']).default('standard'),
  nightlifeFrequency: z.enum(['never', 'sometimes', 'often']).default('sometimes'),
  museumInterest: z.enum(['low', 'medium', 'high']).default('medium'),
  foodStyle: z.array(z.string().trim().min(1).max(60)).max(8).default([]),
  hotelStyle: z.array(z.string().trim().min(1).max(60)).max(8).default([]),
  localPreference: z.number().int().min(0).max(100).default(70),
  notes: z.string().trim().max(1000).default(''),
});
export type VoyaTravelerDna = z.infer<typeof voyaTravelerDnaSchema>;

export const DEFAULT_VOYA_TRAVELER_DNA: VoyaTravelerDna = voyaTravelerDnaSchema.parse({});


export const voyaReadinessKindSchema = z.enum(['Reserve', 'Verify', 'Transport', 'Hotel', 'Timing', 'Document', 'Other']);
export const voyaReadinessPrioritySchema = z.enum(['High', 'Medium', 'Low']);
export const voyaReadinessStatusSchema = z.enum(['To do', 'Done', 'Not needed']);
export type VoyaReadinessKind = z.infer<typeof voyaReadinessKindSchema>;
export type VoyaReadinessPriority = z.infer<typeof voyaReadinessPrioritySchema>;
export type VoyaReadinessStatus = z.infer<typeof voyaReadinessStatusSchema>;

export const voyaGeneratedReadinessItemSchema = z.object({
  title: z.string().trim().min(1).max(180),
  kind: voyaReadinessKindSchema,
  priority: voyaReadinessPrioritySchema,
  reason: z.string().trim().min(1).max(500),
  actionLabel: z.string().trim().max(120).optional(),
  dayId: z.number().int().positive().nullable().optional(),
  placeId: z.number().int().positive().nullable().optional(),
});
export type VoyaGeneratedReadinessItem = z.infer<typeof voyaGeneratedReadinessItemSchema>;

export const voyaReadinessBuildRequestSchema = z.object({
  tripId: z.number().int().positive(),
});
export type VoyaReadinessBuildRequest = z.infer<typeof voyaReadinessBuildRequestSchema>;

export const voyaReadinessItemSchema = voyaGeneratedReadinessItemSchema.extend({
  id: z.number().int().positive(),
  tripId: z.number().int().positive(),
  status: voyaReadinessStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type VoyaReadinessItem = z.infer<typeof voyaReadinessItemSchema>;

export const voyaReadinessResultSchema = z.object({
  tripId: z.number().int().positive(),
  score: z.number().int().min(0).max(100),
  updatedAt: z.string().nullable(),
  fingerprint: z.string().nullable(),
  stale: z.boolean(),
  items: z.array(voyaReadinessItemSchema),
});
export type VoyaReadinessResult = z.infer<typeof voyaReadinessResultSchema>;

export const voyaReadinessStatusRequestSchema = z.object({
  tripId: z.number().int().positive(),
  itemId: z.number().int().positive(),
  status: voyaReadinessStatusSchema,
});
export type VoyaReadinessStatusRequest = z.infer<typeof voyaReadinessStatusRequestSchema>;


export const voyaDestinationDiscoveryRequestSchema = z.object({
  days: z.number().int().min(2).max(30).default(7),
  budgetStyle: z.enum(['budget', 'moderate', 'premium', 'luxury']).default('moderate'),
  climate: z.enum(['any', 'warm', 'mild', 'cool']).default('any'),
  travelStyle: z.enum(['balanced', 'culture', 'food', 'nature', 'beach', 'city', 'nightlife', 'slow']).default('balanced'),
  month: z.number().int().min(1).max(12).optional(),
  interests: z.array(z.string().trim().min(1).max(60)).max(10).default([]),
  travelEffort: z.enum(['easy', 'open', 'adventurous']).default('open'),
  notes: z.string().trim().max(1000).optional(),
});
export type VoyaDestinationDiscoveryRequest = z.infer<typeof voyaDestinationDiscoveryRequestSchema>;

export const voyaDestinationSuggestionSchema = z.object({
  name: z.string().trim().min(1).max(120),
  country: z.string().trim().min(1).max(100),
  type: z.enum(['City', 'Country', 'Island', 'Region', 'Town', 'Other']),
  fitSummary: z.string().trim().min(1).max(420),
  whyFit: z.array(z.string().trim().min(1).max(180)).min(2).max(4),
  vibe: z.array(z.string().trim().min(1).max(40)).min(2).max(5),
  budgetBand: z.enum(['budget', 'moderate', 'premium', 'luxury', 'mixed']),
  climateNote: z.string().trim().min(1).max(220),
  highlights: z.array(z.string().trim().min(1).max(120)).min(2).max(5),
  tradeoffs: z.array(z.string().trim().min(1).max(180)).max(3).default([]),
  searchTerm: z.string().trim().min(1).max(180),
});
export type VoyaDestinationSuggestion = z.infer<typeof voyaDestinationSuggestionSchema>;

export const voyaDestinationDiscoveryResultSchema = z.object({
  summary: z.string().trim().min(1).max(700),
  suggestions: z.array(voyaDestinationSuggestionSchema).min(6).max(8),
  generatedBy: z.object({
    provider: z.enum(['local', 'openai', 'anthropic']),
    model: z.string().min(1),
  }),
});
export type VoyaDestinationDiscoveryResult = z.infer<typeof voyaDestinationDiscoveryResultSchema>;


export const voyaDestinationResolveRequestSchema = z.object({
  query: z.string().trim().min(2).max(180),
});
export type VoyaDestinationResolveRequest = z.infer<typeof voyaDestinationResolveRequestSchema>;

export const voyaResolvedDestinationSchema = z.object({
  name: z.string().trim().min(1).max(120),
  country: z.string().trim().min(1).max(100),
  region: z.string().trim().max(120).optional(),
  type: z.enum(['City', 'Country', 'Island', 'Region', 'Town', 'State', 'Province', 'Other']),
  disambiguation: z.string().trim().max(180).optional(),
  subtitle: z.string().trim().min(1).max(220),
  searchTerm: z.string().trim().min(1).max(180),
});
export type VoyaResolvedDestination = z.infer<typeof voyaResolvedDestinationSchema>;

export const voyaDestinationResolveResultSchema = z.object({
  suggestions: z.array(voyaResolvedDestinationSchema).min(1).max(6),
  generatedBy: z.object({
    provider: z.enum(['local', 'openai', 'anthropic']),
    model: z.string().min(1),
  }),
});
export type VoyaDestinationResolveResult = z.infer<typeof voyaDestinationResolveResultSchema>;


export const voyaMultiCityDestinationSchema = z.object({
  name: z.string().trim().min(2).max(120),
  country: z.string().trim().max(100).optional(),
  region: z.string().trim().max(120).optional(),
});
export type VoyaMultiCityDestination = z.infer<typeof voyaMultiCityDestinationSchema>;

export const voyaMultiCityPlanRequestSchema = z.object({
  destinations: z.array(voyaMultiCityDestinationSchema).min(2).max(6),
  startDate: z.string().regex(isoDate).optional(),
  endDate: z.string().regex(isoDate).optional(),
  days: z.number().int().min(2).max(30),
  travelers: z.number().int().min(1).max(20).default(1),
  currency: z.string().trim().min(3).max(8).default('USD'),
  pace: z.enum(['relaxed', 'balanced', 'packed']).default('balanced'),
  budgetStyle: z.enum(['budget', 'moderate', 'premium', 'luxury']).default('moderate'),
  interests: z.array(z.string().trim().min(1).max(60)).max(12).default([]),
  notes: z.string().trim().max(1200).optional(),
  allowReorder: z.boolean().default(true),
});
export type VoyaMultiCityPlanRequest = z.infer<typeof voyaMultiCityPlanRequestSchema>;

export const voyaMultiCityLegSchema = z.object({
  order: z.number().int().min(1).max(6),
  destination: z.string().trim().min(1).max(120),
  country: z.string().trim().max(100).optional(),
  allocatedDays: z.number().int().min(1).max(30),
  nights: z.number().int().min(0).max(30),
  baseArea: z.string().trim().max(180).optional(),
  summary: z.string().trim().min(1).max(420),
  transportFromPrevious: z.enum(['Train', 'Flight', 'Drive', 'Ferry', 'Bus', 'Transfer/Depends']).optional(),
  transferDurationLabel: z.string().trim().max(120).optional(),
  transferNotes: z.string().trim().max(360).optional(),
});
export type VoyaMultiCityLeg = z.infer<typeof voyaMultiCityLegSchema>;

export const voyaMultiCityPlanDraftSchema = z.object({
  title: z.string().trim().min(1).max(180),
  summary: z.string().trim().min(1).max(900),
  journeySummary: z.string().trim().min(1).max(700),
  orderReason: z.string().trim().min(1).max(500),
  legs: z.array(voyaMultiCityLegSchema).min(2).max(6),
  days: z.array(voyaDraftDaySchema).min(2).max(30),
  cautions: z.array(z.string().trim().min(1).max(240)).max(10).default([]),
  generatedBy: z.object({
    provider: z.enum(['local', 'openai', 'anthropic']),
    model: z.string().min(1),
  }),
});
export type VoyaMultiCityPlanDraft = z.infer<typeof voyaMultiCityPlanDraftSchema>;

export const voyaMaterializeMultiCityDraftRequestSchema = z.object({
  request: voyaMultiCityPlanRequestSchema,
  draft: voyaMultiCityPlanDraftSchema,
  reminderDays: z.number().int().min(0).max(30).optional().default(0),
});
export type VoyaMaterializeMultiCityDraftRequest = z.infer<typeof voyaMaterializeMultiCityDraftRequestSchema>;
