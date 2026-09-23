import { Injectable } from '@nestjs/common';
import {
  type VoyaApplyDayEditRequest,
  type VoyaApplyTripEditRequest,
  type VoyaDayEditDraft,
  type VoyaDayEditRequest,
  type VoyaMaterializeDraftRequest,
  type VoyaMaterializeMultiCityDraftRequest,
  type VoyaMultiCityPlanDraft,
  type VoyaMultiCityPlanRequest,
  type VoyaPlanDraftRequest,
  type VoyaPlanDraftResponse,
  type VoyaVerifyTripRequest,
  type VoyaVerifyTripResult,
  type VoyaTransportAdviceRequest,
  type VoyaTransportAdviceResult,
  type VoyaTripEditPlan,
  type VoyaTravelerDna,
  type VoyaTripEditRequest,
  type VoyaGeneratedReadinessItem,
  type VoyaDestinationDiscoveryRequest,
  type VoyaDestinationDiscoveryResult,
  type VoyaDestinationResolveRequest,
  type VoyaDestinationResolveResult,
  type VoyaEditHistoryRequest,
  type VoyaEditHistoryResult,
  type VoyaRestoreEditSnapshotRequest,
  type VoyaReadinessBuildRequest,
  type VoyaReadinessResult,
  type VoyaReadinessStatusRequest,
  type VoyaReadinessToTodoRequest,
  type VoyaReadinessToTodoResult,
  voyaGeneratedReadinessItemSchema,
  voyaDestinationDiscoveryResultSchema,
  voyaMultiCityPlanDraftSchema,
  voyaDestinationResolveResultSchema,
  voyaApplyTripEditRequestSchema,
  voyaDayEditDraftSchema,
  voyaPlanDraftResponseSchema,
  voyaTravelerDnaSchema,
  voyaTripEditPlanSchema,
} from '@trek/shared';
import { z } from 'zod';
import { LlmConfigResolver } from '../llm-parse/llm-config.resolver';
import { StructuredGenerationService } from './structured-generation.service';
import type { User } from '../../types';
import { DatabaseService } from '../database/database.service';
import { TripsService } from '../trips/trips.service';
import { DaysService } from '../days/days.service';
import { PlacesService } from '../places/places.service';
import { AssignmentsService } from '../assignments/assignments.service';
import { MapsService } from '../maps/maps.service';
import { SettingsService } from '../settings/settings.service';
import { TransitService } from '../transit/transit.service';
import { RoadtripRouterService } from '../roadtrip/roadtrip-router.service';
import { TodoService } from '../todo/todo.service';

const generatedPlanSchema = voyaPlanDraftResponseSchema.omit({ generatedBy: true });
const generatedMultiCityPlanSchema = voyaMultiCityPlanDraftSchema.omit({ generatedBy: true });
const generatedDayEditSchema = voyaDayEditDraftSchema.omit({ tripId: true, dayId: true, generatedBy: true });
const generatedTripEditPlanSchema = voyaTripEditPlanSchema.omit({ tripId: true, generatedBy: true });
const generatedReadinessSchema = z.object({
  items: z.array(voyaGeneratedReadinessItemSchema).max(12),
});
const generatedDestinationDiscoverySchema = voyaDestinationDiscoveryResultSchema.omit({ generatedBy: true });
const generatedDestinationResolveSchema = voyaDestinationResolveResultSchema.omit({ generatedBy: true });

export class VoyaAiUnavailableError extends Error {
  constructor() {
    super('Voya AI is not configured. Enable the LLM integration and choose a model in Settings.');
    this.name = 'VoyaAiUnavailableError';
  }
}

export class VoyaAiPermissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VoyaAiPermissionError';
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
    private readonly db: DatabaseService,
    private readonly trips: TripsService,
    private readonly days: DaysService,
    private readonly places: PlacesService,
    private readonly assignments: AssignmentsService,
    private readonly maps: MapsService,
    private readonly settings: SettingsService,
    private readonly transit: TransitService,
    private readonly roadRouter: RoadtripRouterService,
  ) {}

  async resolveDestination(
    user: User,
    request: VoyaDestinationResolveRequest,
  ): Promise<VoyaDestinationResolveResult> {
    const config = this.configResolver.resolve(user.id);
    if (!config) throw new VoyaAiUnavailableError();

    let repair = '';
    for (let attempt = 0; attempt < 2; attempt++) {
      const raw = await this.generator.generate(config, {
        system: DESTINATION_RESOLVER_SYSTEM_PROMPT,
        user: [
          `Traveler typed: "${request.query}".`,
          'Return 1-6 plausible geographic interpretations, most likely first.',
          'If the term is ambiguous, include the materially different real places a traveler could mean.',
          'Use canonical destination names and country names.',
          'Allowed destination types are city, country, island, region, town, state, province, or other geographic area.',
          'Never return a hotel, airport, train station, restaurant, attraction, company, neighborhood venue, or fictional place.',
          'disambiguation should concisely explain the distinction only when useful, e.g. "country in the Caucasus" vs "U.S. state".',
          'subtitle should give short geographic context, not marketing copy.',
          'searchTerm should be an unambiguous canonical string suitable for itinerary generation.',
          repair ? `Previous result failed validation. Fix: ${repair}` : '',
        ].filter(Boolean).join('\n'),
        jsonSchema: z.toJSONSchema(generatedDestinationResolveSchema),
      });

      try {
        const parsed = generatedDestinationResolveSchema.parse(raw);
        const seen = new Set<string>();
        for (const suggestion of parsed.suggestions) {
          const key = `${canonicalPlaceName(suggestion.name)}|${canonicalPlaceName(suggestion.country)}|${canonicalPlaceName(suggestion.region || '')}`;
          if (seen.has(key)) throw new VoyaAiInvalidDraftError(`Duplicate destination interpretation: ${suggestion.searchTerm}`);
          seen.add(key);
        }
        return {
          ...parsed,
          generatedBy: { provider: config.provider, model: config.model },
        };
      } catch (error) {
        if (attempt === 1) {
          const detail = error instanceof Error ? error.message : 'unknown validation error';
          throw new VoyaAiInvalidDraftError(`Voya could not resolve this destination safely: ${detail}`);
        }
        repair = this.validationMessage(error);
      }
    }

    throw new VoyaAiInvalidDraftError('Voya could not resolve this destination');
  }

  async discoverDestinations(
    user: User,
    request: VoyaDestinationDiscoveryRequest,
  ): Promise<VoyaDestinationDiscoveryResult> {
    const config = this.configResolver.resolve(user.id);
    if (!config) throw new VoyaAiUnavailableError();
    const travelerDna = this.travelerDna(user.id);

    let repair = '';
    for (let attempt = 0; attempt < 2; attempt++) {
      const raw = await this.generator.generate(config, {
        system: DESTINATION_DISCOVERY_SYSTEM_PROMPT,
        user: [
          `Trip length: ${request.days} days.`,
          `Budget style: ${request.budgetStyle}. Climate preference: ${request.climate}. Travel style: ${request.travelStyle}.`,
          request.month ? `Travel month: ${request.month}.` : 'Travel month is flexible.',
          `Travel effort appetite: ${request.travelEffort}.`,
          request.interests.length ? `Current interests: ${request.interests.join(', ')}.` : '',
          request.notes ? `Traveler notes: ${request.notes}` : '',
          this.travelerDnaPrompt(travelerDna),
          'Return 6-8 DISTINCT real geographic destinations. Do not repeat the same metro area, island group, or near-identical destination under different names.',
          'Fit suggestions to the requested trip length: avoid sprawling multi-region countries when the traveler only has a few days unless you name a specific city or region.',
          'budgetBand is a qualitative positioning only. Never provide exact costs, flight prices, hotel rates, or numeric budgets.',
          'climateNote is a broad typical-climate fit, not a weather forecast. Do not state guaranteed temperatures or current conditions.',
          'Do not mention visa ease, entry rules, passport rules, current safety levels, political stability, live events, live availability, or current transport schedules.',
          'highlights must be broad well-known place themes or attractions, not claims about current opening status.',
          'tradeoffs should be practical planning tradeoffs such as distance between areas, crowds in broad terms, or a slower pace needed for geography; avoid current-event claims.',
          'searchTerm should be the canonical destination string a trip planner can reuse.',
          repair ? `Previous result failed validation. Fix: ${repair}` : '',
        ].filter(Boolean).join('\n'),
        jsonSchema: z.toJSONSchema(generatedDestinationDiscoverySchema),
      });

      try {
        const parsed = generatedDestinationDiscoverySchema.parse(raw);
        const seen = new Set<string>();
        for (const suggestion of parsed.suggestions) {
          const key = `${canonicalPlaceName(suggestion.name)}|${canonicalPlaceName(suggestion.country)}`;
          if (seen.has(key)) throw new VoyaAiInvalidDraftError(`Duplicate destination: ${suggestion.name}`);
          seen.add(key);
        }
        return {
          ...parsed,
          generatedBy: { provider: config.provider, model: config.model },
        };
      } catch (error) {
        if (attempt === 1) {
          const detail = error instanceof Error ? error.message : 'unknown validation error';
          throw new VoyaAiInvalidDraftError(`Voya could not produce safe destination ideas: ${detail}`);
        }
        repair = this.validationMessage(error);
      }
    }

    throw new VoyaAiInvalidDraftError('Voya could not produce destination ideas');
  }

  async planMultiCityDraft(userId: number, request: VoyaMultiCityPlanRequest): Promise<VoyaMultiCityPlanDraft> {
    const config = this.configResolver.resolve(userId);
    if (!config) throw new VoyaAiUnavailableError();
    const travelerDna = this.travelerDna(userId);

    let repair = '';
    for (let attempt = 0; attempt < 2; attempt++) {
      const raw = await this.generator.generate(config, {
        system: MULTI_CITY_SYSTEM_PROMPT,
        user: [
          `Plan one coherent ${request.days}-day multi-city trip.`,
          `Requested destinations: ${request.destinations.map((d, index) => `${index + 1}. ${d.name}${d.country ? `, ${d.country}` : ''}`).join(' | ')}.`,
          request.allowReorder
            ? 'You may reorder the destinations only when the route becomes materially more practical; explain the reason in orderReason.'
            : 'Keep the destinations in exactly the requested order.',
          request.startDate ? `Start date: ${request.startDate}.` : '',
          request.endDate ? `End date: ${request.endDate}.` : '',
          `Travelers: ${request.travelers}. Pace: ${request.pace}. Budget style: ${request.budgetStyle}. Currency: ${request.currency}.`,
          this.travelerDnaPrompt(travelerDna),
          request.interests.length ? `Interests: ${request.interests.join(', ')}.` : '',
          request.notes ? `Traveler notes: ${request.notes}` : '',
          'Create exactly one leg for every requested destination and exactly the requested total number of days.',
          'allocatedDays across all legs MUST sum exactly to the requested trip days.',
          'The days array MUST contain exactly the requested number of days and each day MUST name its destination and country.',
          'Every day belongs to exactly one leg. The number of days assigned to each destination MUST equal that leg allocatedDays.',
          'The first day in every leg after the first MUST have isTransferDay=true. Other days should normally be false.',
          'Transfer days must be lighter than normal sightseeing days and should include a transport/transfer activity plus limited local plans after arrival.',
          'transportFromPrevious is qualitative only: Train, Flight, Drive, Ferry, Bus, or Transfer/Depends.',
          'Do NOT invent exact train/flight numbers, departure times, live fares, ticket availability, seats, or booking confirmation.',
          'transferDurationLabel must be approximate language only when you are confident about the broad journey duration; otherwise use "Verify current schedule".',
          'Never claim live opening hours, current availability, visa rules, or reservation confirmation.',
          'Every generated activity is Suggested. Set priceKnown=false and omit numeric price. Qualitative price labels are allowed.',
          'Avoid repeating named restaurants, cafes, museums, landmarks, or attractions anywhere across cities.',
          'Use realistic geographic clustering inside each destination and preserve breathing room on transfer days.',
          repair ? `Previous multi-city draft failed validation. Correct these issues: ${repair}` : '',
        ].filter(Boolean).join('\n'),
        jsonSchema: z.toJSONSchema(generatedMultiCityPlanSchema),
      });

      try {
        const normalized = this.normalizeMultiCity(raw, request);
        const parsed = generatedMultiCityPlanSchema.parse(normalized);
        const draft: VoyaMultiCityPlanDraft = {
          ...parsed,
          generatedBy: { provider: config.provider, model: config.model },
        };
        this.assertMultiCityQuality(draft, request);
        return draft;
      } catch (error) {
        if (attempt === 1) {
          const detail = error instanceof Error ? error.message : 'unknown validation error';
          throw new VoyaAiInvalidDraftError(`The model could not produce a valid multi-city Voya itinerary: ${detail}`);
        }
        repair = this.validationMessage(error);
      }
    }

    throw new VoyaAiInvalidDraftError('The model could not produce a valid multi-city itinerary');
  }

  materializeMultiCityDraft(user: User, body: VoyaMaterializeMultiCityDraftRequest) {
    const request = body.request;
    const draft = voyaMultiCityPlanDraftSchema.parse(body.draft);
    this.assertMultiCityQuality(draft, request);

    if (!this.trips.can('trip_create', user.role, null, user.id, false)) {
      throw new VoyaAiPermissionError('No permission to create trips');
    }

    return this.db.transaction(() => {
      const created = this.trips.create(user.id, {
        title: draft.title,
        description: [draft.summary, draft.journeySummary].filter(Boolean).join('\n\n'),
        start_date: request.startDate ?? null,
        end_date: request.endDate ?? null,
        currency: request.currency,
        reminder_days: body.reminderDays,
        ...(!request.startDate && !request.endDate ? { day_count: request.days } : {}),
      });

      const tripId = created.tripId;
      const storedDays = this.days.list(tripId).days;
      if (storedDays.length !== draft.days.length) {
        throw new VoyaAiInvalidDraftError(
          `TREK created ${storedDays.length} days for a ${draft.days.length}-day multi-city draft`,
        );
      }

      const firstDayByDestination = new Map<string, number>();
      draft.days.forEach((day, index) => {
        const key = canonicalPlaceName(day.destination || '');
        if (key && !firstDayByDestination.has(key)) firstDayByDestination.set(key, index);
      });

      for (let index = 0; index < draft.days.length; index++) {
        const planDay = draft.days[index];
        const storedDay = storedDays[index];
        const destination = planDay.destination || request.destinations[0]?.name || '';
        const leg = draft.legs.find(candidate => canonicalPlaceName(candidate.destination) === canonicalPlaceName(destination));
        const transferLine = planDay.isTransferDay && leg?.transportFromPrevious
          ? `Voya transfer suggestion: ${leg.transportFromPrevious}${leg.transferDurationLabel ? ` · ${leg.transferDurationLabel}` : ''}. ${leg.transferNotes || 'Verify current schedule and fare before booking.'}`
          : '';

        this.days.update(storedDay.id, storedDay, {
          title: planDay.title,
          notes: [
            `Voya city: ${destination}${planDay.country ? `, ${planDay.country}` : ''}.`,
            planDay.objective,
            transferLine,
            planDay.transportNote,
          ].filter(Boolean).join('\n\n'),
        });

        for (const activity of planDay.activities) {
          // Inter-city movement is journey guidance, not a venue. Persisting a
          // model-authored "Train to Florence" as a Place pollutes the pool and
          // guarantees a failed provider-verification lookup. The transfer
          // itself already lives in the day's notes above; only real stops become
          // Places/Assignments.
          if (planDay.isTransferDay && isTransferActivity(activity.category, activity.name)) continue;

          const suggestionNote = [
            'Suggested by Voya — verify current details before relying on them.',
            `Voya destination: ${destination}.`,
            planDay.isTransferDay ? 'This is part of a Voya transfer day.' : '',
            activity.notes,
            activity.reservationRecommended ? 'Reservation may be worth checking.' : '',
            activity.priceLabel,
          ].filter(Boolean).join(' ');

          const place = this.places.create(String(tripId), {
            name: activity.name,
            description: activity.description,
            address: activity.addressQuery || activity.area,
            duration_minutes: activity.durationMin,
            place_time: activity.startTime,
            notes: suggestionNote,
          });

          this.assignments.createAssignment(storedDay.id, place.id, suggestionNote);
        }
      }

      const trip = this.trips.get(tripId, user.id);
      if (!trip) throw new VoyaAiInvalidDraftError('Created multi-city trip could not be reloaded');

      return {
        trip,
        days: this.days.list(tripId).days,
        draft,
      };
    });
  }

  async planDraft(userId: number, request: VoyaPlanDraftRequest): Promise<VoyaPlanDraftResponse> {
    const config = this.configResolver.resolve(userId);
    if (!config) throw new VoyaAiUnavailableError();
    const travelerDna = this.travelerDna(userId);

    const jsonSchema = z.toJSONSchema(generatedPlanSchema);
    let repair = '';

    for (let attempt = 0; attempt < 2; attempt++) {
      const raw = await this.generator.generate(config, {
        system: SYSTEM_PROMPT,
        user: this.userPrompt(request, repair, travelerDna),
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

  materializeDraft(user: User, body: VoyaMaterializeDraftRequest) {
    const request = body.request;
    const draft = voyaPlanDraftResponseSchema.parse(body.draft);
    this.assertQuality(draft, request);

    if (!this.trips.can('trip_create', user.role, null, user.id, false)) {
      throw new VoyaAiPermissionError('No permission to create trips');
    }

    return this.db.transaction(() => {
      const created = this.trips.create(user.id, {
        title: draft.title,
        description: draft.summary,
        start_date: request.startDate ?? null,
        end_date: request.endDate ?? null,
        currency: request.currency,
        reminder_days: body.reminderDays,
        ...(!request.startDate && !request.endDate ? { day_count: request.days } : {}),
      });

      const tripId = created.tripId;
      const storedDays = this.days.list(tripId).days;
      if (storedDays.length !== draft.days.length) {
        throw new VoyaAiInvalidDraftError(
          `TREK created ${storedDays.length} days for a ${draft.days.length}-day Voya draft`,
        );
      }

      for (let index = 0; index < draft.days.length; index++) {
        const planDay = draft.days[index];
        const storedDay = storedDays[index];

        this.days.update(storedDay.id, storedDay, {
          title: planDay.title,
          notes: [planDay.objective, planDay.transportNote].filter(Boolean).join('\n\n'),
        });

        for (const activity of planDay.activities) {
          const suggestionNote = [
            'Suggested by Voya — verify current details before relying on them.',
            `Voya destination: ${request.destination}.`,
            activity.notes,
            activity.reservationRecommended ? 'Reservation may be worth checking.' : '',
            activity.priceLabel,
          ].filter(Boolean).join(' ');

          const place = this.places.create(String(tripId), {
            name: activity.name,
            description: activity.description,
            address: activity.addressQuery || activity.area,
            duration_minutes: activity.durationMin,
            place_time: activity.startTime,
            notes: suggestionNote,
            ...(activity.priceKnown && activity.price !== undefined
              ? { price: activity.price, currency: request.currency }
              : {}),
          });

          this.assignments.createAssignment(
            storedDay.id,
            place.id,
            suggestionNote,
          );
        }
      }

      const trip = this.trips.get(tripId, user.id);
      if (!trip) throw new VoyaAiInvalidDraftError('Created trip could not be reloaded');

      return {
        trip,
        days: this.days.list(tripId).days,
        draft: {
          ...draft,
          generatedBy: body.draft.generatedBy,
        },
      };
    });
  }

  getReadiness(user: User, request: VoyaReadinessBuildRequest): VoyaReadinessResult {
    this.assertTripAccess(request.tripId, user.id);
    const context = this.readinessContext(request.tripId);
    const fingerprint = readinessFingerprint(context);
    const rows = this.db.all<VoyaReadinessRow>(
      `SELECT * FROM voya_readiness_items WHERE trip_id = ?
       ORDER BY CASE priority WHEN 'High' THEN 0 WHEN 'Medium' THEN 1 ELSE 2 END, id ASC`,
      request.tripId,
    );
    const state = this.db.get<{ fingerprint: string; updated_at: string }>(
      'SELECT fingerprint, updated_at FROM voya_readiness_state WHERE trip_id = ?',
      request.tripId,
    );
    return readinessResult(request.tripId, rows, fingerprint, state ?? null);
  }

  async refreshReadiness(user: User, request: VoyaReadinessBuildRequest): Promise<VoyaReadinessResult> {
    this.assertTripAccess(request.tripId, user.id);
    const config = this.configResolver.resolve(user.id);
    if (!config) throw new VoyaAiUnavailableError();

    const context = this.readinessContext(request.tripId);
    const fingerprint = readinessFingerprint(context);
    const validDayIds = new Set(context.days.map((day) => day.dayId));
    const validPlaceIds = new Set(context.days.flatMap((day) => day.stops.map((stop) => stop.placeId)));

    let repair = '';
    let generated: VoyaGeneratedReadinessItem[] = [];
    for (let attempt = 0; attempt < 2; attempt++) {
      const raw = await this.generator.generate(config, {
        system: READINESS_SYSTEM_PROMPT,
        user: [
          'Build a short Before You Go checklist from the stored trip facts below.',
          JSON.stringify(context),
          'Create 0-12 items only when there is a concrete action or verification step supported by those facts.',
          'Do not add visa, passport, health, legal, border, weather, opening-hours, or live-availability claims.',
          'Do not invent URLs, reservation confirmations, prices, or deadlines.',
          'If a reservation is already confirmed, do not tell the traveler to reserve it again.',
          'A Voya place note that says reservation may be worth checking can justify a Reserve or Verify task, but phrase it as a check, never as a claim of availability.',
          'High means the trip could materially break if ignored; Medium means useful preparation; Low means convenience.',
          'dayId and placeId may only use ids present in the supplied trip context; otherwise omit them.',
          repair ? `Previous checklist failed validation. Fix: ${repair}` : '',
        ].filter(Boolean).join('\n'),
        jsonSchema: z.toJSONSchema(generatedReadinessSchema),
      });

      try {
        const parsed = generatedReadinessSchema.parse(raw);
        for (const item of parsed.items) {
          if (item.dayId != null && !validDayIds.has(item.dayId)) {
            throw new VoyaAiInvalidDraftError(`Unknown readiness dayId ${item.dayId}`);
          }
          if (item.placeId != null && !validPlaceIds.has(item.placeId)) {
            throw new VoyaAiInvalidDraftError(`Unknown readiness placeId ${item.placeId}`);
          }
        }
        generated = dedupeReadinessItems(parsed.items);
        break;
      } catch (error) {
        if (attempt === 1) {
          const detail = error instanceof Error ? error.message : 'unknown validation error';
          throw new VoyaAiInvalidDraftError(`Voya could not build a safe readiness checklist: ${detail}`);
        }
        repair = this.validationMessage(error);
      }
    }

    const existing = this.db.all<VoyaReadinessRow>(
      'SELECT * FROM voya_readiness_items WHERE trip_id = ?',
      request.tripId,
    );
    const statuses = new Map(existing.map((row) => [readinessIdentity(row.kind, row.title), row.status]));

    this.db.transaction(() => {
      this.db.run('DELETE FROM voya_readiness_items WHERE trip_id = ?', request.tripId);
      this.db.run(
        `INSERT INTO voya_readiness_state (trip_id, fingerprint, updated_at)
         VALUES (?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(trip_id) DO UPDATE SET fingerprint = excluded.fingerprint, updated_at = CURRENT_TIMESTAMP`,
        request.tripId,
        fingerprint,
      );
      const insert = this.db.prepare(
        `INSERT INTO voya_readiness_items
          (trip_id, title, kind, priority, status, reason, action_label, day_id, place_id, fingerprint, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      );
      for (const item of generated) {
        insert.run(
          request.tripId,
          item.title,
          item.kind,
          item.priority,
          statuses.get(readinessIdentity(item.kind, item.title)) ?? 'To do',
          item.reason,
          item.actionLabel ?? null,
          item.dayId ?? null,
          item.placeId ?? null,
          fingerprint,
        );
      }
    });

    return this.getReadiness(user, request);
  }

  readinessToTodo(user: User, request: VoyaReadinessToTodoRequest): VoyaReadinessToTodoResult {
    this.assertTripAccess(request.tripId, user.id);
    const trip = this.todo.verifyTripAccess(request.tripId, user.id);
    if (!trip) throw new VoyaAiPermissionError('Trip not found');
    if (!this.todo.canEdit(trip, user)) throw new VoyaAiPermissionError('No permission to edit trip tasks');

    const item = this.db.get<VoyaReadinessRow>(
      'SELECT * FROM voya_readiness_items WHERE id = ? AND trip_id = ?',
      request.itemId,
      request.tripId,
    );
    if (!item) throw new VoyaAiInvalidDraftError('Readiness item not found');

    const marker = `[voya-readiness:${item.id}]`;
    const existing = this.todo.listItems(request.tripId).find((todoItem: any) =>
      typeof todoItem.description === 'string' && todoItem.description.includes(marker),
    );
    if (existing) {
      return { created: false, todoItemId: Number((existing as any).id) };
    }

    const priority = item.priority === 'High' ? 1 : item.priority === 'Medium' ? 2 : 3;
    const description = [
      item.reason,
      item.action_label ? `Suggested action: ${item.action_label}` : '',
      'Created from Voya Before You Go.',
      marker,
    ].filter(Boolean).join('\n\n');

    const created = this.todo.createItem(request.tripId, {
      name: item.title,
      category: 'Voya · Before You Go',
      description,
      priority,
    }) as any;

    this.todo.broadcast(String(request.tripId), 'todo:created', { item: created }, undefined);
    return { created: true, todoItemId: Number(created.id) };
  }

  updateReadinessStatus(user: User, request: VoyaReadinessStatusRequest): VoyaReadinessResult {
    this.assertTripAccess(request.tripId, user.id);
    const row = this.db.get<{ id: number }>(
      'SELECT id FROM voya_readiness_items WHERE id = ? AND trip_id = ?',
      request.itemId,
      request.tripId,
    );
    if (!row) throw new VoyaAiInvalidDraftError('Readiness item not found');

    this.db.run(
      'UPDATE voya_readiness_items SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND trip_id = ?',
      request.status,
      request.itemId,
      request.tripId,
    );
    return this.getReadiness(user, { tripId: request.tripId });
  }

  private assertTripAccess(tripId: number, userId: number): void {
    if (!this.db.canAccessTrip(tripId, userId)) throw new VoyaAiPermissionError('Trip not found');
  }

  private readinessContext(tripId: number) {
    const trip = this.db.get<{
      id: number; title: string; start_date: string | null; end_date: string | null; description: string | null;
    }>('SELECT id, title, start_date, end_date, description FROM trips WHERE id = ?', tripId);
    if (!trip) throw new VoyaAiPermissionError('Trip not found');

    const days = this.days.list(tripId).days.map((day) => ({
      dayId: day.id,
      dayNumber: day.day_number ?? null,
      date: day.date ?? null,
      title: day.title ?? null,
      notes: day.notes ?? null,
      stops: (day.assignments || []).map((assignment) => ({
        assignmentId: assignment.id,
        placeId: assignment.place_id,
        name: assignment.place?.name || '',
        address: assignment.place?.address || null,
        time: assignment.place?.place_time || null,
        durationMin: assignment.place?.duration_minutes ?? null,
        notes: assignment.place?.notes || assignment.notes || null,
        accommodationLinked: assignment.accommodation_id != null,
      })),
    }));

    const reservations = this.db.all<{
      id: number; title: string; type: string; status: string; reservation_time: string | null;
      reservation_end_time: string | null; confirmation_number: string | null; location: string | null;
      notes: string | null; needs_review?: number | null; day_id: number | null; place_id: number | null;
    }>(
      `SELECT id, title, type, status, reservation_time, reservation_end_time,
              confirmation_number, location, notes, needs_review, day_id, place_id
       FROM reservations WHERE trip_id = ? ORDER BY reservation_time, id`,
      tripId,
    );

    const accommodations = this.db.all<{
      id: number; place_id: number | null; place_name: string | null; start_day_id: number;
      end_day_id: number; check_in: string | null; check_out: string | null; confirmation: string | null;
    }>(
      `SELECT a.id, a.place_id, p.name AS place_name, a.start_day_id, a.end_day_id,
              a.check_in, a.check_out, a.confirmation
       FROM day_accommodations a
       LEFT JOIN places p ON p.id = a.place_id
       WHERE a.trip_id = ? ORDER BY a.start_day_id, a.id`,
      tripId,
    );

    return {
      trip: {
        id: trip.id,
        title: trip.title,
        startDate: trip.start_date,
        endDate: trip.end_date,
        description: trip.description,
      },
      days,
      reservations,
      accommodations,
    };
  }

  async planTripEdit(user: User, request: VoyaTripEditRequest): Promise<VoyaTripEditPlan> {
    const trip = this.days.verifyTripAccess(request.tripId, user.id);
    if (!trip) throw new VoyaAiPermissionError('Trip not found');
    if (!this.days.canEdit(trip, user)) throw new VoyaAiPermissionError('No permission to edit this trip');

    const tripDays = this.days.list(request.tripId).days;
    if (tripDays.length === 0) throw new VoyaAiInvalidDraftError('This trip has no days to edit');

    const context = tripDays.map(day => ({
      dayId: day.id,
      dayNumber: day.day_number ?? null,
      date: day.date ?? null,
      title: day.title ?? null,
      notes: day.notes ?? null,
      stops: (day.assignments || []).map(a => ({
        assignmentId: a.id,
        name: a.place?.name || '',
        time: a.place?.place_time || null,
        protected: this.assignmentProtectedFromAiEdit(a),
      })),
    }));

    const config = this.configResolver.resolve(user.id);
    if (!config) throw new VoyaAiUnavailableError();
    const travelerDna = this.travelerDna(user.id);
    const tripTitle = this.trips.get(request.tripId, user.id)?.title || 'Untitled trip';

    let repair = '';
    for (let attempt = 0; attempt < 2; attempt++) {
      const raw = await this.generator.generate(config, {
        system: TRIP_EDIT_SYSTEM_PROMPT,
        user: [
          `Trip: ${tripTitle}.`,
          `Traveler instruction: ${request.instruction}`,
          this.travelerDnaPrompt(travelerDna),
          'Current trip days:',
          JSON.stringify(context),
          'Choose ONLY the days that actually need changes to satisfy the instruction.',
          'Use only the dayId values supplied above. Never invent a day id.',
          'For every affected day, write a concrete day-specific instruction that a second planning pass can execute safely.',
          'Do not choose a day merely to make the edit feel comprehensive. Leave already-good days untouched.',
          repair ? `Previous plan failed validation. Fix: ${repair}` : '',
        ].filter(Boolean).join('\n'),
        jsonSchema: z.toJSONSchema(generatedTripEditPlanSchema),
      });

      try {
        const parsed = generatedTripEditPlanSchema.parse(raw);
        const plan: VoyaTripEditPlan = {
          ...parsed,
          tripId: request.tripId,
          generatedBy: { provider: config.provider, model: config.model },
        };
        this.assertTripEditPlan(plan, tripDays.map(day => day.id));
        return plan;
      } catch (error) {
        if (attempt === 1) {
          const detail = error instanceof Error ? error.message : 'unknown validation error';
          throw new VoyaAiInvalidDraftError(`Voya could not produce a safe trip edit plan: ${detail}`);
        }
        repair = this.validationMessage(error);
      }
    }

    throw new VoyaAiInvalidDraftError('Voya could not produce a safe trip edit plan');
  }

  async transportAdvice(user: User, request: VoyaTransportAdviceRequest): Promise<VoyaTransportAdviceResult> {
    const trip = this.days.verifyTripAccess(request.tripId, user.id);
    if (!trip) throw new VoyaAiPermissionError('Trip not found');

    const day = this.days.getDay(request.dayId, request.tripId);
    if (!day) throw new VoyaAiInvalidDraftError('Transfer day not found');

    const [originGeo, destinationGeo] = await Promise.all([
      this.transit.geocode(request.origin, request.lang, undefined, user.id),
      this.transit.geocode(request.destination, request.lang, undefined, user.id),
    ]);

    const origin = originGeo.results[0];
    const destination = destinationGeo.results[0];
    if (!origin || !destination) {
      throw new VoyaAiInvalidDraftError('Voya could not resolve both transfer cities through the configured transit provider');
    }

    const departureIso =
      request.departureDate && request.departureTime
        ? new Date(`${request.departureDate}T${request.departureTime}:00`).toISOString()
        : request.departureDate
          ? new Date(`${request.departureDate}T09:00:00`).toISOString()
          : undefined;

    const from = `${origin.lat},${origin.lng}`;
    const to = `${destination.lat},${destination.lng}`;

    const [transitResult, roadResult] = await Promise.allSettled([
      this.transit.plan(
        {
          from,
          to,
          time: departureIso,
          modes: 'TRANSIT',
          maxTransfers: 4,
        },
        request.lang,
        user.id,
      ),
      this.roadRouter.route(
        user.id,
        request.tripId,
        request.dayId,
        [
          { lat: origin.lat, lng: origin.lng },
          { lat: destination.lat, lng: destination.lng },
        ],
        'driving',
        [],
      ),
    ]);

    const options: VoyaTransportAdviceResult['options'] = [];
    let transitProvider: string | null = null;

    if (transitResult.status === 'fulfilled') {
      transitProvider = transitResult.value.provider;
      const unique = transitResult.value.itineraries
        .filter(itinerary => itinerary.duration > 0)
        .sort((a, b) => a.duration - b.duration || a.transfers - b.transfers)
        .slice(0, 3);

      unique.forEach((itinerary, index) => {
        const scheduledLegs = itinerary.legs.filter(leg => leg.mode !== 'WALK');
        const operators = [...new Set(scheduledLegs.map(leg => leg.agency).filter((value): value is string => !!value))];
        const lines = [...new Set(scheduledLegs.map(leg => leg.line).filter((value): value is string => !!value))];
        const mainMode = scheduledLegs[0]?.mode || 'TRANSIT';
        const departurePoint = scheduledLegs[0]?.from.name || origin.name;
        const arrivalPoint = scheduledLegs.at(-1)?.to.name || destination.name;

        options.push({
          id: `transit-${index + 1}`,
          mode: 'transit',
          label: humanTransitMode(mainMode, lines),
          durationMin: Math.max(1, Math.round(itinerary.duration / 60)),
          durationLabel: formatMinutes(Math.max(1, Math.round(itinerary.duration / 60))),
          distanceKm: null,
          transfers: itinerary.transfers,
          departurePoint,
          arrivalPoint,
          departureTime: itinerary.startTime || null,
          arrivalTime: itinerary.endTime || null,
          operatorLabel: operators.length ? operators.join(' · ') : lines.length ? lines.join(' · ') : null,
          source: transitResult.value.provider,
          sourceBacked: true,
          liveFareAvailable: false,
          fareLabel: 'Check current fare with the operator',
          recommended: false,
          notes: [
            itinerary.transfers === 0 ? 'Direct scheduled journey.' : `${itinerary.transfers} transfer${itinerary.transfers === 1 ? '' : 's'}.`,
            itinerary.walkSeconds > 0 ? `${Math.round(itinerary.walkSeconds / 60)} min walking included.` : '',
          ].filter(Boolean),
        });
      });
    }

    if (roadResult.status === 'fulfilled') {
      const seconds = roadResult.value.leg.seg.duration;
      const meters = roadResult.value.leg.seg.distance;
      options.push({
        id: 'drive-1',
        mode: 'drive',
        label: 'Drive',
        durationMin: Math.max(1, Math.round(seconds / 60)),
        durationLabel: roadResult.value.leg.seg.durationText || formatMinutes(Math.max(1, Math.round(seconds / 60))),
        distanceKm: Math.round((meters / 1000) * 10) / 10,
        transfers: null,
        departurePoint: origin.name,
        arrivalPoint: destination.name,
        departureTime: null,
        arrivalTime: null,
        operatorLabel: null,
        source: 'TREK routing',
        sourceBacked: true,
        liveFareAvailable: false,
        fareLabel: 'Fuel, tolls and parking not included',
        recommended: false,
        notes: [
          roadResult.value.avoidMissed.length ? 'Routing could not honor every avoidance preference.' : 'Road duration from TREK routing.',
        ],
      });
    }

    if (!options.length) {
      options.push({
        id: 'flight-handoff',
        mode: 'flight_handoff',
        label: 'Check flight options',
        durationMin: null,
        durationLabel: 'No verified ground option returned',
        distanceKm: null,
        transfers: null,
        departurePoint: request.origin,
        arrivalPoint: request.destination,
        departureTime: null,
        arrivalTime: null,
        operatorLabel: null,
        source: 'Voya handoff',
        sourceBacked: false,
        liveFareAvailable: false,
        fareLabel: 'Search current flights externally',
        recommended: true,
        notes: ['Voya has no live flight-search provider configured, so it will not invent schedules or fares.'],
      });
    } else {
      markRecommendedTransport(options);
    }

    const recommended = options.find(option => option.recommended) ?? options[0];
    return {
      tripId: request.tripId,
      origin: request.origin,
      destination: request.destination,
      checkedAt: new Date().toISOString(),
      summary: `${recommended.label} is the strongest currently verified option Voya found for this transfer.`,
      transitProvider,
      options,
      cautions: [
        'Public-transport times come from the configured TREK transit provider and can still change.',
        'Voya does not claim live fare or seat availability.',
        'Flights are not compared unless a real flight-search provider is configured.',
      ],
    };
  }

  async planDayEdit(user: User, request: VoyaDayEditRequest): Promise<VoyaDayEditDraft> {
    const trip = this.days.verifyTripAccess(request.tripId, user.id);
    if (!trip) throw new VoyaAiPermissionError('Trip not found');
    if (!this.days.canEdit(trip, user)) throw new VoyaAiPermissionError('No permission to edit this trip');

    const day = this.days.getDay(request.dayId, request.tripId);
    if (!day) throw new VoyaAiInvalidDraftError('Day not found');

    const current = this.assignments.listDayAssignments(request.dayId);
    const config = this.configResolver.resolve(user.id);
    if (!config) throw new VoyaAiUnavailableError();
    const travelerDna = this.travelerDna(user.id);
    const tripTitle = this.trips.get(request.tripId, user.id)?.title || 'Untitled trip';

    const context = current.map(a => ({
      assignmentId: a.id,
      placeId: a.place_id,
      name: a.place?.name || '',
      description: a.place?.description || null,
      address: a.place?.address || null,
      startTime: a.place?.place_time || null,
      endTime: a.place?.end_time || null,
      durationMin: a.place?.duration_minutes || null,
      notes: a.notes || null,
      protected: this.assignmentProtectedFromAiEdit(a),
    }));

    let repair = '';
    for (let attempt = 0; attempt < 2; attempt++) {
      const raw = await this.generator.generate(config, {
        system: DAY_EDIT_SYSTEM_PROMPT,
        user: [
          `Trip: ${tripTitle}.`,
          `Day ${day.day_number || ''}${day.date ? ` on ${day.date}` : ''}.`,
          day.title ? `Current day title: ${day.title}.` : '',
          day.notes ? `Current day notes: ${day.notes}` : '',
          `Traveler instruction: ${request.instruction}`,
          this.travelerDnaPrompt(travelerDna),
          'Current assignments (these ids are authoritative):',
          JSON.stringify(context),
          'Every current assignmentId must appear exactly once: either as kind="existing" in sequence or in removedAssignmentIds.',
          'Never invent an assignmentId.',
          'Any assignment marked protected=true MUST stay in sequence, MUST NOT appear in removedAssignmentIds, and MUST keep its current time and notes unchanged.',
          'Removing means removing it from this day only. The place remains saved in the trip.',
          'For a new place, use kind="new" and provide an activity. New activities are suggestions only: verificationStatus="Suggested", priceKnown=false, and omit numeric price.',
          'Keep the day geographically coherent and realistic. Avoid unnecessary churn: preserve good existing stops when the instruction does not require replacing them.',
          repair ? `Previous draft failed validation. Fix: ${repair}` : '',
        ].filter(Boolean).join('\n'),
        jsonSchema: z.toJSONSchema(generatedDayEditSchema),
      });

      try {
        const normalized = this.normalizeDayEdit(raw);
        const parsed = generatedDayEditSchema.parse(normalized);
        const draft: VoyaDayEditDraft = {
          ...parsed,
          tripId: request.tripId,
          dayId: request.dayId,
          generatedBy: { provider: config.provider, model: config.model },
        };
        this.assertDayEditDraft(draft, current);
        return draft;
      } catch (error) {
        if (attempt === 1) {
          const detail = error instanceof Error ? error.message : 'unknown validation error';
          throw new VoyaAiInvalidDraftError(`Voya could not produce a safe day edit: ${detail}`);
        }
        repair = this.validationMessage(error);
      }
    }

    throw new VoyaAiInvalidDraftError('Voya could not produce a safe day edit');
  }

  applyDayEdit(user: User, body: VoyaApplyDayEditRequest) {
    const draft = voyaDayEditDraftSchema.parse(body.draft);
    const trip = this.days.verifyTripAccess(draft.tripId, user.id);
    if (!trip) throw new VoyaAiPermissionError('Trip not found');
    if (!this.days.canEdit(trip, user)) throw new VoyaAiPermissionError('No permission to edit this trip');

    const day = this.days.getDay(draft.dayId, draft.tripId);
    if (!day) throw new VoyaAiInvalidDraftError('Day not found');

    const current = this.assignments.listDayAssignments(draft.dayId);
    this.assertDayEditDraft(draft, current);

    const mutation = this.db.transaction(() => {
      const snapshotId = this.createEditSnapshot(user.id, draft.tripId, [draft.dayId], 'day', `Before Voya day edit: ${draft.summary.slice(0, 120)}`);
      const applied = this.applyDayEditMutation(draft, current, day, this.trips.get(draft.tripId, user.id)?.title || 'this trip');
      this.stampEditSnapshotPostFingerprint(snapshotId, draft.tripId, [draft.dayId]);
      return applied;
    });

    this.broadcastDayEditMutation(draft.tripId, draft.dayId, mutation);
    this.assignments.reconcile(draft.tripId);
    return mutation.result;
  }

  applyTripEdit(user: User, body: VoyaApplyTripEditRequest) {
    const parsed = voyaApplyTripEditRequestSchema.parse(body);
    const tripId = parsed.plan.tripId;
    const trip = this.days.verifyTripAccess(tripId, user.id);
    if (!trip) throw new VoyaAiPermissionError('Trip not found');
    if (!this.days.canEdit(trip, user)) throw new VoyaAiPermissionError('No permission to edit this trip');

    this.assertTripEditPlan(parsed.plan, this.days.list(tripId).days.map(day => day.id));

    this.assertAtomicTripEditBundle(parsed.plan, parsed.drafts);
    const expectedDayIds = parsed.plan.affectedDays.map(item => item.dayId);

    const contexts = parsed.drafts.map(draft => {
      const day = this.days.getDay(draft.dayId, tripId);
      if (!day) throw new VoyaAiInvalidDraftError(`Day ${draft.dayId} no longer exists`);
      const current = this.assignments.listDayAssignments(draft.dayId);
      this.assertDayEditDraft(draft, current);
      return { draft, day, current };
    });

    const mutations = this.db.transaction(() => {
      const snapshotId = this.createEditSnapshot(user.id, tripId, expectedDayIds, 'trip', `Before Voya whole-trip edit: ${parsed.plan.summary.slice(0, 120)}`);
      const applied = contexts.map(({ draft, day, current }) =>
        this.applyDayEditMutation(draft, current, day, this.trips.get(tripId, user.id)?.title || 'this trip'),
      );
      this.stampEditSnapshotPostFingerprint(snapshotId, tripId, expectedDayIds);
      return applied;
    });

    for (let index = 0; index < contexts.length; index++) {
      this.broadcastDayEditMutation(
        tripId,
        contexts[index].draft.dayId,
        mutations[index],
      );
    }
    this.assignments.reconcile(tripId);

    return {
      tripId,
      affectedDays: contexts.map(({ draft }) => draft.dayId),
      appliedDays: contexts.length,
    };
  }

  private assertAtomicTripEditBundle(
    plan: VoyaTripEditPlan,
    drafts: VoyaDayEditDraft[],
  ): void {
    const expectedDayIds = plan.affectedDays.map(item => item.dayId);
    const draftDayIds = drafts.map(draft => draft.dayId);
    const uniqueDraftDayIds = new Set(draftDayIds);

    if (uniqueDraftDayIds.size !== draftDayIds.length) {
      throw new VoyaAiInvalidDraftError('Whole-trip edit contains duplicate day drafts');
    }
    if (
      expectedDayIds.length !== draftDayIds.length ||
      expectedDayIds.some(dayId => !uniqueDraftDayIds.has(dayId))
    ) {
      throw new VoyaAiInvalidDraftError('Every affected day must have exactly one reviewed draft before applying');
    }
    for (const draft of drafts) {
      if (draft.tripId !== plan.tripId) {
        throw new VoyaAiInvalidDraftError('All reviewed day drafts must belong to the same trip');
      }
    }
  }

  listEditHistory(user: User, request: VoyaEditHistoryRequest): VoyaEditHistoryResult {
    const trip = this.days.verifyTripAccess(request.tripId, user.id);
    if (!trip) throw new VoyaAiPermissionError('Trip not found');

    const rows = this.db.all<{
      id: number;
      trip_id: number;
      scope: 'day' | 'trip';
      label: string;
      affected_day_ids: string;
      created_at: string;
      restored_at: string | null;
    }>(
      'SELECT id, trip_id, scope, label, affected_day_ids, created_at, restored_at FROM voya_edit_snapshots WHERE trip_id = ? ORDER BY created_at DESC, id DESC LIMIT 20',
      request.tripId,
    );

    return {
      tripId: request.tripId,
      snapshots: rows.map(row => ({
        id: row.id,
        tripId: row.trip_id,
        scope: row.scope,
        label: row.label,
        affectedDayIds: parseNumberArray(row.affected_day_ids),
        createdAt: row.created_at,
        restoredAt: row.restored_at,
      })),
    };
  }

  restoreEditSnapshot(user: User, request: VoyaRestoreEditSnapshotRequest) {
    const trip = this.days.verifyTripAccess(request.tripId, user.id);
    if (!trip) throw new VoyaAiPermissionError('Trip not found');
    if (!this.days.canEdit(trip, user)) throw new VoyaAiPermissionError('No permission to edit this trip');

    const row = this.db.get<{
      id: number;
      trip_id: number;
      scope: 'day' | 'trip';
      label: string;
      affected_day_ids: string;
      snapshot_json: string;
    }>(
      'SELECT id, trip_id, scope, label, affected_day_ids, snapshot_json FROM voya_edit_snapshots WHERE id = ? AND trip_id = ?',
      request.snapshotId,
      request.tripId,
    );
    if (!row) throw new VoyaAiInvalidDraftError('Voya edit snapshot not found');

    const payload = parseEditSnapshotPayload(row.snapshot_json);
    const affectedDayIds = payload.days.map(entry => Number(entry.day.id)).filter(Number.isFinite);
    if (!affectedDayIds.length) throw new VoyaAiInvalidDraftError('Snapshot contains no restorable days');
    if (payload.postFingerprint) {
      const currentFingerprint = this.editStateFingerprint(request.tripId, affectedDayIds);
      if (currentFingerprint !== payload.postFingerprint) {
        throw new VoyaAiInvalidDraftError(
          'This itinerary changed after the Voya edit. Restore was blocked to protect newer manual changes.',
        );
      }
    }

    this.db.transaction(() => {
      this.createEditSnapshot(
        user.id,
        request.tripId,
        affectedDayIds,
        row.scope,
        'Before restore: ' + row.label.slice(0, 120),
        false,
      );

      const assignmentColumns = new Set(
        this.db.all<{ name: string }>("PRAGMA table_info('day_assignments')").map(column => column.name),
      );

      for (const daySnapshot of payload.days) {
        const dayId = Number(daySnapshot.day.id);
        if (!Number.isFinite(dayId)) throw new VoyaAiInvalidDraftError('Snapshot contains an invalid day id');
        const liveDay = this.days.getDay(dayId, request.tripId);
        if (!liveDay) throw new VoyaAiInvalidDraftError('Day ' + dayId + ' no longer exists and cannot be restored');

        const current = this.assignments.listDayAssignments(dayId);
        const preservedProtected = current.filter(assignment => this.assignmentProtectedFromAiEdit(assignment));
        const preservedIds = new Set(preservedProtected.map(assignment => assignment.id));

        for (const assignment of current) {
          if (!preservedIds.has(assignment.id)) this.assignments.deleteAssignment(assignment.id);
        }

        const reinsertedIds = new Set<number>();
        for (const assignment of daySnapshot.assignments) {
          const assignmentId = Number(assignment.id);
          if (!Number.isFinite(assignmentId)) continue;

          if (preservedIds.has(assignmentId)) {
            if (typeof assignment.order_index === 'number') {
              this.db.run(
                'UPDATE day_assignments SET order_index = ? WHERE id = ? AND day_id = ?',
                assignment.order_index,
                assignmentId,
                dayId,
              );
            }
            continue;
          }

          const values: Record<string, unknown> = { ...assignment, day_id: dayId };
          const columns = Object.keys(values).filter(column => assignmentColumns.has(column));
          if (!columns.length) continue;
          const placeholders = columns.map(() => '?').join(', ');
          this.db.run(
            'INSERT INTO day_assignments (' + columns.join(', ') + ') VALUES (' + placeholders + ')',
            ...columns.map(column => values[column]),
          );
          reinsertedIds.add(assignmentId);
        }

        for (const participant of daySnapshot.participants) {
          if (!reinsertedIds.has(participant.assignment_id)) continue;
          this.db.run(
            'INSERT OR IGNORE INTO assignment_participants (assignment_id, user_id) VALUES (?, ?)',
            participant.assignment_id,
            participant.user_id,
          );
        }
        for (const link of daySnapshot.reservationLinks) {
          if (!reinsertedIds.has(link.assignment_id)) continue;
          this.db.run(
            'UPDATE reservations SET assignment_id = ? WHERE id = ? AND trip_id = ?',
            link.assignment_id,
            link.reservation_id,
            request.tripId,
          );
        }

        const snapshotIdSet = new Set(daySnapshot.assignments.map(assignment => Number(assignment.id)));
        const snapshotOrderMax = daySnapshot.assignments.reduce(
          (max, assignment) => typeof assignment.order_index === 'number' ? Math.max(max, assignment.order_index) : max,
          -1,
        );
        let appendOrder = snapshotOrderMax + 1;
        for (const assignment of preservedProtected) {
          if (snapshotIdSet.has(assignment.id)) continue;
          this.db.run(
            'UPDATE day_assignments SET order_index = ? WHERE id = ? AND day_id = ?',
            appendOrder++,
            assignment.id,
            dayId,
          );
        }

        this.db.run(
          'UPDATE days SET title = ?, notes = ?, default_transport_mode = ? WHERE id = ? AND trip_id = ?',
          asNullableString(daySnapshot.day.title),
          asNullableString(daySnapshot.day.notes),
          asNullableString(daySnapshot.day.default_transport_mode),
          dayId,
          request.tripId,
        );
      }

      this.db.run(
        'UPDATE voya_edit_snapshots SET restored_at = CURRENT_TIMESTAMP WHERE id = ? AND trip_id = ?',
        request.snapshotId,
        request.tripId,
      );
      this.pruneEditSnapshots(request.tripId, request.snapshotId);
    });

    for (const dayId of affectedDayIds) {
      const day = this.days.getDay(dayId, request.tripId);
      if (!day) continue;
      const assignments = this.assignments.listDayAssignments(dayId);
      this.assignments.broadcast(
        String(request.tripId),
        'assignment:reordered',
        { dayId, orderedIds: assignments.map(assignment => assignment.id) },
        undefined,
      );
      this.days.broadcast(String(request.tripId), 'day:updated', { day }, undefined);
    }
    this.assignments.reconcile(request.tripId);

    return { tripId: request.tripId, snapshotId: request.snapshotId, restoredDays: affectedDayIds };
  }
  private editStateFingerprint(tripId: number, dayIds: number[]): string {
    const uniqueDayIds = [...new Set(dayIds)].sort((a, b) => a - b);
    const days = uniqueDayIds.map(dayId => {
      const day = this.db.get<Record<string, unknown>>(
        'SELECT id, title, notes, default_transport_mode FROM days WHERE id = ? AND trip_id = ?',
        dayId,
        tripId,
      );
      if (!day) throw new VoyaAiInvalidDraftError('Day ' + dayId + ' does not exist');

      const assignments = this.db.all<Record<string, unknown> & { id: number }>(
        'SELECT * FROM day_assignments WHERE day_id = ? ORDER BY order_index, id',
        dayId,
      );
      const assignmentIds = assignments.map(assignment => assignment.id);
      const marks = assignmentIds.map(() => '?').join(',');
      const participants = assignmentIds.length
        ? this.db.all<{ assignment_id: number; user_id: number }>(
            'SELECT assignment_id, user_id FROM assignment_participants WHERE assignment_id IN (' + marks + ') ORDER BY assignment_id, user_id',
            ...assignmentIds,
          )
        : [];
      const reservationLinks = assignmentIds.length
        ? this.db.all<{ reservation_id: number; assignment_id: number }>(
            'SELECT id AS reservation_id, assignment_id FROM reservations WHERE trip_id = ? AND assignment_id IN (' + marks + ') ORDER BY id',
            tripId,
            ...assignmentIds,
          )
        : [];
      return { day, assignments, participants, reservationLinks };
    });
    return snapshotFingerprint(days);
  }

  private stampEditSnapshotPostFingerprint(snapshotId: number, tripId: number, dayIds: number[]): void {
    const row = this.db.get<{ snapshot_json: string }>(
      'SELECT snapshot_json FROM voya_edit_snapshots WHERE id = ? AND trip_id = ?',
      snapshotId,
      tripId,
    );
    if (!row) throw new VoyaAiInvalidDraftError('Voya edit snapshot disappeared during apply');
    const payload = parseEditSnapshotPayload(row.snapshot_json);
    payload.postFingerprint = this.editStateFingerprint(tripId, dayIds);
    this.db.run(
      'UPDATE voya_edit_snapshots SET snapshot_json = ? WHERE id = ? AND trip_id = ?',
      JSON.stringify(payload),
      snapshotId,
      tripId,
    );
  }

  private createEditSnapshot(
    userId: number,
    tripId: number,
    dayIds: number[],
    scope: 'day' | 'trip',
    label: string,
    prune = true,
  ): number {
    const uniqueDayIds = [...new Set(dayIds)];
    const days = uniqueDayIds.map(dayId => {
      const day = this.db.get<Record<string, unknown> & { id: number }>(
        'SELECT * FROM days WHERE id = ? AND trip_id = ?',
        dayId,
        tripId,
      );
      if (!day) throw new VoyaAiInvalidDraftError('Day ' + dayId + ' does not exist');

      const assignments = this.db.all<Record<string, unknown> & { id: number }>(
        'SELECT * FROM day_assignments WHERE day_id = ? ORDER BY order_index, id',
        dayId,
      );
      const assignmentIds = assignments.map(assignment => assignment.id);
      const marks = assignmentIds.map(() => '?').join(',');
      const participants = assignmentIds.length
        ? this.db.all<{ assignment_id: number; user_id: number }>(
            'SELECT assignment_id, user_id FROM assignment_participants WHERE assignment_id IN (' + marks + ') ORDER BY assignment_id, user_id',
            ...assignmentIds,
          )
        : [];
      const reservationLinks = assignmentIds.length
        ? this.db.all<{ reservation_id: number; assignment_id: number }>(
            'SELECT id AS reservation_id, assignment_id FROM reservations WHERE trip_id = ? AND assignment_id IN (' + marks + ') ORDER BY id',
            tripId,
            ...assignmentIds,
          )
        : [];

      return { day, assignments, participants, reservationLinks };
    });

    const result = this.db.run(
      'INSERT INTO voya_edit_snapshots (trip_id, user_id, scope, label, affected_day_ids, snapshot_json) VALUES (?, ?, ?, ?, ?, ?)',
      tripId,
      userId,
      scope,
      label.slice(0, 180),
      JSON.stringify(uniqueDayIds),
      JSON.stringify({ version: 1, days }),
    );
    const snapshotId = Number(result.lastInsertRowid);
    if (prune) this.pruneEditSnapshots(tripId);
    return snapshotId;
  }

  private pruneEditSnapshots(tripId: number, preserveId?: number): void {
    const keep = this.db.all<{ id: number }>(
      'SELECT id FROM voya_edit_snapshots WHERE trip_id = ? ORDER BY created_at DESC, id DESC LIMIT 20',
      tripId,
    ).map(row => row.id);
    if (preserveId && !keep.includes(preserveId)) keep.push(preserveId);
    if (!keep.length) return;
    const marks = keep.map(() => '?').join(',');
    this.db.run(
      'DELETE FROM voya_edit_snapshots WHERE trip_id = ? AND id NOT IN (' + marks + ')',
      tripId,
      ...keep,
    );
  }
  private applyDayEditMutation(
    draft: VoyaDayEditDraft,
    current: ReturnType<AssignmentsService['listDayAssignments']>,
    day: NonNullable<ReturnType<DaysService['getDay']>>,
    tripTitle: string,
  ) {
    const currentByAssignment = new Map(current.map(a => [a.id, a]));
    const keptExistingIds = new Set(
      draft.sequence.filter(item => item.kind === 'existing').map(item => item.assignmentId),
    );
    const destinationHint =
      this.places.list(String(draft.tripId), { assignment: 'all' })
        .map(place => destinationFromNotes(place.notes))
        .find(Boolean)
      || tripTitle
      || 'this trip';

    const createdPlaces: Array<ReturnType<PlacesService['create']>> = [];
    const createdAssignments: Array<NonNullable<ReturnType<AssignmentsService['createAssignment']>>> = [];
    const removedIds = [...draft.removedAssignmentIds];

    for (const id of removedIds) this.assignments.deleteAssignment(id);

    const finalIds: number[] = [];
    const timeEdits: Array<{ id: number; start?: string | null; end?: string | null; notes?: string | null }> = [];

    for (const item of draft.sequence) {
      if (item.kind === 'existing') {
        const existing = currentByAssignment.get(item.assignmentId);
        if (!existing) throw new VoyaAiInvalidDraftError(`Assignment ${item.assignmentId} no longer exists`);
        finalIds.push(existing.id);
        timeEdits.push({ id: existing.id, start: item.startTime, end: item.endTime, notes: item.notes });
        continue;
      }

      const activity = item.activity;
      const matchingPlaceId = this.places.findMatchingPlaceId(String(draft.tripId), { name: activity.name });
      let placeId = matchingPlaceId;

      if (matchingPlaceId != null) {
        const duplicateKept = current.some(
          a => a.place_id === matchingPlaceId && keptExistingIds.has(a.id),
        );
        if (duplicateKept) {
          throw new VoyaAiInvalidDraftError(`The proposed new stop "${activity.name}" is already kept on this day`);
        }
      } else {
        const suggestionNote = [
          'Suggested by Voya — verify current details before relying on them.',
          `Voya destination: ${destinationHint}.`,
          activity.notes,
          activity.reservationRecommended ? 'Reservation may be worth checking.' : '',
          activity.priceLabel,
        ].filter(Boolean).join(' ');

        const place = this.places.create(String(draft.tripId), {
          name: activity.name,
          description: activity.description,
          address: activity.addressQuery || activity.area,
          duration_minutes: activity.durationMin,
          place_time: activity.startTime,
          notes: suggestionNote,
        });
        placeId = place.id;
        createdPlaces.push(place);
      }

      const assignment = this.assignments.createAssignment(
        draft.dayId,
        placeId!,
        'Suggested by Voya — review current details before relying on them.',
      );
      if (!assignment) throw new VoyaAiInvalidDraftError(`Could not add "${activity.name}" to this day`);
      createdAssignments.push(assignment);
      finalIds.push(assignment.id);
      timeEdits.push({ id: assignment.id, start: activity.startTime ?? undefined });
    }

    for (const edit of timeEdits) {
      if (edit.start !== undefined || edit.end !== undefined) {
        this.assignments.updateTime(edit.id, edit.start, edit.end);
      }
      if (edit.notes !== undefined) this.assignments.updateNotes(edit.id, edit.notes ?? null);
    }

    this.assignments.reorderAssignments(draft.dayId, finalIds);

    const updatedDay = this.days.update(draft.dayId, day, {
      ...(draft.title ? { title: draft.title } : {}),
      ...(draft.objective !== undefined ? { notes: draft.objective } : {}),
    });

    return {
      result: {
        day: updatedDay,
        assignments: this.assignments.listDayAssignments(draft.dayId),
      },
      createdPlaces,
      createdAssignments,
      removedIds,
    };
  }

  private broadcastDayEditMutation(
    tripId: number,
    dayId: number,
    mutation: ReturnType<VoyaAiService['applyDayEditMutation']>,
  ): void {
    for (const place of mutation.createdPlaces) {
      this.places.broadcast(String(tripId), 'place:created', { place }, undefined);
    }
    for (const assignment of mutation.createdAssignments) {
      this.assignments.broadcast(String(tripId), 'assignment:created', { assignment }, undefined);
    }
    for (const assignmentId of mutation.removedIds) {
      this.assignments.broadcast(
        String(tripId),
        'assignment:deleted',
        { assignmentId, dayId },
        undefined,
      );
    }
    this.assignments.broadcast(
      String(tripId),
      'assignment:reordered',
      { dayId, orderedIds: mutation.result.assignments.map(a => a.id) },
      undefined,
    );
    this.days.broadcast(String(tripId), 'day:updated', { day: mutation.result.day }, undefined);
  }

  async verifyTrip(user: User, request: VoyaVerifyTripRequest): Promise<VoyaVerifyTripResult> {
    const tripId = request.tripId;
    const trip = this.places.verifyTripAccess(String(tripId), user.id);
    if (!trip) throw new VoyaAiPermissionError('Trip not found');
    if (!this.places.canEdit(trip, user)) throw new VoyaAiPermissionError('No permission to update trip places');

    const rows = this.places.list(String(tripId), { assignment: 'all' }).filter(place => isVoyaSuggestion(place.notes));
    const items: VoyaVerifyTripResult['items'] = [];
    const sourceCounts: Record<string, number> = {};
    let verified = 0;
    let unresolved = 0;
    let skipped = 0;

    for (const place of rows) {
      const providerId = place.google_place_id || place.osm_id || place.amap_poi_id;
      if (providerId) {
        skipped++;
        items.push({
          placeId: place.id,
          name: place.name,
          status: 'already_verified',
          source: providerSource(place),
          matchedName: place.name,
          reason: 'This place already carries a provider identity.',
        });
        continue;
      }

      const destination = request.destination || destinationFromNotes(place.notes) || '';
      const query = [place.name, destination].filter(Boolean).join(', ');

      try {
        const search = await this.maps.searchPlaces(user.id, query, request.lang);
        const match = pickStrongPlaceMatch(place.name, destination, search.places);
        if (!match) {
          unresolved++;
          items.push({
            placeId: place.id,
            name: place.name,
            status: 'unresolved',
            source: search.source || null,
            matchedName: null,
            reason: destination
              ? 'No exact provider-name match in the expected destination.'
              : 'No exact provider-name match with enough location context.',
          });
          continue;
        }

        const fields = providerFields(match);
        if (fields.lat == null || fields.lng == null) {
          unresolved++;
          items.push({
            placeId: place.id,
            name: place.name,
            status: 'unresolved',
            source: search.source || readString(match.source),
            matchedName: readString(match.name),
            reason: 'The provider result had no usable coordinates.',
          });
          continue;
        }

        const source = readString(match.source) || search.source || 'map provider';
        const verificationNote = [
          `Matched by Voya to a ${source} place record on ${new Date().toISOString().slice(0, 10)}.`,
          'Current hours, prices and availability still require checking.',
          stripVoyaSuggestionPrefix(place.notes),
        ].filter(Boolean).join(' ');

        let updated = await this.places.update(String(tripId), String(place.id), {
          ...fields,
          notes: verificationNote,
        });

        if (!updated || ('conflict' in updated)) {
          throw new Error('Place changed while Voya was verifying it');
        }

        const matchedProviderId =
          fields.google_place_id || fields.osm_id || fields.amap_poi_id || fields.google_ftid || '';
        if (!place.image_url && matchedProviderId) {
          try {
            const photo = await this.maps.photo(
              user.id,
              matchedProviderId,
              fields.lat,
              fields.lng,
              readString(match.name) || place.name,
            );
            if (photo.photoUrl) {
              const withPhoto = await this.places.update(String(tripId), String(place.id), {
                image_url: photo.photoUrl,
              });
              if (withPhoto && !('conflict' in withPhoto)) updated = withPhoto;
            }
          } catch {
            // Photo enrichment is optional; identity verification has already succeeded.
          }
        }

        this.places.broadcast(String(tripId), 'place:updated', { place: updated }, undefined);
        verified++;
        sourceCounts[source] = (sourceCounts[source] || 0) + 1;
        items.push({
          placeId: place.id,
          name: place.name,
          status: 'verified',
          source,
          matchedName: readString(match.name) || place.name,
          reason: 'Exact provider name and destination context matched.',
        });
      } catch (error) {
        unresolved++;
        items.push({
          placeId: place.id,
          name: place.name,
          status: 'error',
          source: null,
          matchedName: null,
          reason: error instanceof Error ? error.message : 'Provider verification failed.',
        });
      }
    }

    return {
      tripId,
      checked: rows.length - skipped,
      verified,
      unresolved,
      skipped,
      sourceCounts,
      items,
    };
  }

  private travelerDna(userId: number): VoyaTravelerDna | null {
    const raw = this.settings.getUserSettings(userId).voya_traveler_dna;
    const parsed = voyaTravelerDnaSchema.safeParse(raw);
    return parsed.success ? parsed.data : null;
  }

  private travelerDnaPrompt(dna: VoyaTravelerDna | null): string {
    if (!dna) return '';
    return [
      'Saved Traveler DNA (use as background preferences unless this request explicitly overrides it):',
      `walking=${dna.walkingTolerance}`,
      `mornings=${dna.morningStyle}`,
      `nightlife=${dna.nightlifeFrequency}`,
      `museums=${dna.museumInterest}`,
      `localPreference=${dna.localPreference}/100`,
      dna.foodStyle.length ? `food=${dna.foodStyle.join(', ')}` : '',
      dna.hotelStyle.length ? `hotels=${dna.hotelStyle.join(', ')}` : '',
      dna.notes ? `travelerNotes=${dna.notes}` : '',
    ].filter(Boolean).join('; ');
  }

  private userPrompt(request: VoyaPlanDraftRequest, repair: string, travelerDna: VoyaTravelerDna | null): string {
    const interests = request.interests.length ? request.interests.join(', ') : 'general discovery, food, culture and local character';
    return [
      `Plan a ${request.days}-day trip to ${request.destination}${request.country ? `, ${request.country}` : ''}.`,
      request.startDate ? `Start date: ${request.startDate}.` : '',
      request.endDate ? `End date: ${request.endDate}.` : '',
      `Travelers: ${request.travelers}. Pace: ${request.pace}. Budget style: ${request.budgetStyle}. Currency: ${request.currency}.`,
      this.travelerDnaPrompt(travelerDna),
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

  private assertTripEditPlan(plan: VoyaTripEditPlan, dayIds: number[]): void {
    const valid = new Set(dayIds);
    const seen = new Set<number>();
    for (const item of plan.affectedDays) {
      if (!valid.has(item.dayId)) throw new VoyaAiInvalidDraftError(`Unknown day id ${item.dayId}`);
      if (seen.has(item.dayId)) throw new VoyaAiInvalidDraftError(`Day ${item.dayId} appears more than once`);
      seen.add(item.dayId);
    }
  }

  private normalizeMultiCity(raw: unknown, request: VoyaMultiCityPlanRequest): unknown {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw;
    const out = structuredClone(raw) as Record<string, unknown>;
    const days = Array.isArray(out.days) ? out.days : [];

    out.days = days.map((value, index) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
      const day: Record<string, unknown> = { ...(value as Record<string, unknown>), dayNumber: index + 1 };
      if (request.startDate) day.date = addIsoDays(request.startDate, index);
      else delete day.date;

      if (Array.isArray(day.activities)) {
        day.activities = day.activities.map((activity) => {
          if (!activity || typeof activity !== 'object' || Array.isArray(activity)) return activity;
          const next: Record<string, unknown> = {
            ...(activity as Record<string, unknown>),
            verificationStatus: 'Suggested',
            priceKnown: false,
          };
          delete next.price;
          return next;
        });
      }
      return day;
    });

    if (Array.isArray(out.legs)) {
      out.legs = out.legs.map((leg, index) => {
        if (!leg || typeof leg !== 'object' || Array.isArray(leg)) return leg;
        return { ...(leg as Record<string, unknown>), order: index + 1 };
      });
    }

    return out;
  }

  private assertMultiCityQuality(draft: VoyaMultiCityPlanDraft, request: VoyaMultiCityPlanRequest): void {
    if (draft.days.length !== request.days) {
      throw new VoyaAiInvalidDraftError(`Expected exactly ${request.days} days but received ${draft.days.length}`);
    }
    if (draft.legs.length !== request.destinations.length) {
      throw new VoyaAiInvalidDraftError(`Expected ${request.destinations.length} destination legs but received ${draft.legs.length}`);
    }

    const requestedNames = request.destinations.map(destination => canonicalPlaceName(destination.name));
    const legNames = draft.legs.map(leg => canonicalPlaceName(leg.destination));
    if (new Set(legNames).size !== legNames.length) {
      throw new VoyaAiInvalidDraftError('Every multi-city leg must use a distinct destination');
    }
    for (const requested of requestedNames) {
      if (!legNames.includes(requested)) throw new VoyaAiInvalidDraftError('A requested destination is missing from the journey');
    }
    if (!request.allowReorder && requestedNames.some((name, index) => legNames[index] !== name)) {
      throw new VoyaAiInvalidDraftError('Destination order changed even though reordering was disabled');
    }

    const allocated = draft.legs.reduce((sum, leg) => sum + leg.allocatedDays, 0);
    if (allocated !== request.days) {
      throw new VoyaAiInvalidDraftError(`Leg allocation totals ${allocated} days instead of ${request.days}`);
    }

    const daysByDestination = new Map<string, number>();
    for (const day of draft.days) {
      const key = canonicalPlaceName(day.destination || '');
      if (!legNames.includes(key)) throw new VoyaAiInvalidDraftError(`Day ${day.dayNumber} uses a destination outside the journey`);
      daysByDestination.set(key, (daysByDestination.get(key) || 0) + 1);
    }
    for (const leg of draft.legs) {
      const key = canonicalPlaceName(leg.destination);
      if ((daysByDestination.get(key) || 0) !== leg.allocatedDays) {
        throw new VoyaAiInvalidDraftError(`${leg.destination} was allocated ${leg.allocatedDays} days but the itinerary contains ${daysByDestination.get(key) || 0}`);
      }
    }

    let cursor = 0;
    for (let index = 0; index < draft.legs.length; index++) {
      const leg = draft.legs[index];
      const expected = canonicalPlaceName(leg.destination);
      for (let offset = 0; offset < leg.allocatedDays; offset++) {
        const day = draft.days[cursor + offset];
        if (!day || canonicalPlaceName(day.destination || '') !== expected) {
          throw new VoyaAiInvalidDraftError(`Days for ${leg.destination} must be contiguous in journey order`);
        }
        if (offset === 0 && index > 0 && day.isTransferDay !== true) {
          throw new VoyaAiInvalidDraftError(`The first day in ${leg.destination} must be marked as a transfer day`);
        }
        if (day.isTransferDay) {
          const localStops = day.activities.filter(activity => !isTransferActivity(activity.category, activity.name));
          if (localStops.length > 4) {
            throw new VoyaAiInvalidDraftError(
              `Transfer day ${day.dayNumber} is overloaded with ${localStops.length} local stops; use at most 4`,
            );
          }
        }
      }
      if (index > 0 && !leg.transportFromPrevious) {
        throw new VoyaAiInvalidDraftError(`${leg.destination} is missing a transfer mode from the previous city`);
      }
      cursor += leg.allocatedDays;
    }

    const seen = new Set<string>();
    const duplicates = new Set<string>();
    for (const day of draft.days) {
      for (const activity of day.activities) {
        const key = canonicalPlaceName(activity.name);
        if (!key || GENERIC_ACTIVITY_NAMES.has(key) || /transfer|train|flight|drive|ferry|bus/.test(key)) continue;
        if (seen.has(key)) duplicates.add(activity.name);
        seen.add(key);
      }
    }
    if (duplicates.size) {
      throw new VoyaAiInvalidDraftError(`Repeated named places across the journey: ${Array.from(duplicates).slice(0, 6).join(', ')}`);
    }
  }

  private normalizeDayEdit(raw: unknown): unknown {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw;
    const out = structuredClone(raw) as Record<string, unknown>;
    if (!Array.isArray(out.sequence)) return out;

    out.sequence = out.sequence.map(item => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return item;
      const row = { ...(item as Record<string, unknown>) };
      if (row.kind !== 'new' || !row.activity || typeof row.activity !== 'object' || Array.isArray(row.activity)) return row;
      const activity: Record<string, unknown> = {
        ...(row.activity as Record<string, unknown>),
        verificationStatus: 'Suggested',
        priceKnown: false,
      };
      delete activity.price;
      row.activity = activity;
      return row;
    });
    return out;
  }

  private assignmentProtectedFromAiEdit(assignment: {
    id: number;
    accommodation_id?: number | null;
    reservation_status?: string | null;
    reservation_datetime?: string | null;
  }): boolean {
    if (assignment.accommodation_id != null) return true;
    if (assignment.reservation_datetime) return true;
    if (assignment.reservation_status && assignment.reservation_status !== 'none') return true;
    return !!this.db.get<{ id: number }>(
      'SELECT id FROM reservations WHERE assignment_id = ? LIMIT 1',
      assignment.id,
    );
  }

  private assertDayEditDraft(
    draft: VoyaDayEditDraft,
    current: ReturnType<AssignmentsService['listDayAssignments']>,
  ): void {
    const currentIds = new Set(current.map(a => a.id));
    const protectedIds = new Set(current.filter(a => this.assignmentProtectedFromAiEdit(a)).map(a => a.id));
    const sequenceIds = draft.sequence
      .filter(item => item.kind === 'existing')
      .map(item => item.assignmentId);
    const removedIds = draft.removedAssignmentIds;

    const seen = new Set<number>();
    for (const id of [...sequenceIds, ...removedIds]) {
      if (!currentIds.has(id)) throw new VoyaAiInvalidDraftError(`Unknown assignment id ${id}`);
      if (seen.has(id)) throw new VoyaAiInvalidDraftError(`Assignment ${id} appears more than once`);
      seen.add(id);
    }
    if (seen.size !== currentIds.size) {
      const missing = [...currentIds].filter(id => !seen.has(id));
      throw new VoyaAiInvalidDraftError(`Every current assignment must be accounted for. Missing: ${missing.join(', ')}`);
    }
    for (const id of protectedIds) {
      if (!sequenceIds.includes(id)) {
        throw new VoyaAiInvalidDraftError(`Protected booked assignment ${id} must stay on the day`);
      }
      const currentAssignment = current.find(a => a.id === id);
      const proposed = draft.sequence.find(
        item => item.kind === 'existing' && item.assignmentId === id,
      );
      if (!currentAssignment || !proposed || proposed.kind !== 'existing') continue;
      const currentStart = currentAssignment.place?.place_time ?? null;
      const currentEnd = currentAssignment.place?.end_time ?? null;
      const currentNotes = currentAssignment.notes ?? null;
      if (
        (proposed.startTime !== undefined && proposed.startTime !== currentStart) ||
        (proposed.endTime !== undefined && proposed.endTime !== currentEnd) ||
        (proposed.notes !== undefined && proposed.notes !== currentNotes)
      ) {
        throw new VoyaAiInvalidDraftError(
          `Protected booked assignment ${id} cannot have its time or notes changed by Voya`,
        );
      }
    }

    const names = new Set<string>();
    for (const item of draft.sequence) {
      const name = item.kind === 'existing'
        ? current.find(a => a.id === item.assignmentId)?.place?.name
        : item.activity.name;
      if (!name) continue;
      const key = canonicalPlaceName(name);
      if (key && names.has(key)) throw new VoyaAiInvalidDraftError(`Duplicate stop in proposed day: ${name}`);
      if (key) names.add(key);
    }
  }

  private normalize(raw: unknown, request: VoyaPlanDraftRequest): unknown {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw;
    const out = structuredClone(raw) as Record<string, unknown>;
    const days = Array.isArray(out.days) ? out.days : [];

    out.days = days.map((value, index) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
      const day: Record<string, unknown> = { ...(value as Record<string, unknown>), dayNumber: index + 1 };
      if (request.startDate) day.date = addIsoDays(request.startDate, index);
      else delete day.date;

      if (Array.isArray(day.activities)) {
        day.activities = day.activities.map((activity) => {
          if (!activity || typeof activity !== 'object' || Array.isArray(activity)) return activity;
          const next: Record<string, unknown> = { ...(activity as Record<string, unknown>), verificationStatus: 'Suggested', priceKnown: false };
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

const MULTI_CITY_SYSTEM_PROMPT = `You are Voya, a premium multi-city travel-planning engine.
Build one coherent journey across the requested real destinations.
Allocate the exact requested number of days, keep each destination's days contiguous, and make the first day after each city change a realistic transfer day.
Recommend only qualitative transfer modes unless exact facts are supplied. Never invent live schedules, fares, availability, train or flight numbers.
All specific places are suggestions until verified. Never invent exact prices, opening hours, reservations, visa rules, or live conditions.
Return only the requested structured multi-city itinerary object.`;

const TRIP_EDIT_SYSTEM_PROMPT = `You are Voya editing an existing trip at whole-trip scope.
Choose only the days that materially need changes to satisfy the traveler.
Preserve strong existing plans and all protected booked or hotel-linked stops.
Do not invent day ids, live availability, opening hours, exact prices, or reservation status.
Return only the requested structured whole-trip edit plan.`;

const DAY_EDIT_SYSTEM_PROMPT = `You are Voya editing one day of an existing travel itinerary.
Preserve good existing plans unless the traveler's instruction requires change.
Never invent assignment ids. Every existing assignment must be explicitly kept or removed from this day.
Protected booked or hotel-linked assignments must remain unchanged.
New places are suggestions only and must never be presented as verified facts.
Do not invent live availability, opening hours, reservation status, exact prices, or transport schedules.
Return only the requested structured day-edit object.`;

const SYSTEM_PROMPT = `You are Voya, a premium travel-planning engine.
Create practical, human-paced itineraries that feel intentionally designed rather than mechanically filled.
Accuracy and trust are more important than false precision.
Never invent real-time availability, exact prices, opening hours, or reservation confirmation.
Never present an unverified suggestion as verified.
Return only the requested structured itinerary object.`;


function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function providerFields(record: Record<string, unknown>) {
  return {
    name: readString(record.name),
    lat: readNumber(record.lat),
    lng: readNumber(record.lng),
    address: readString(record.address),
    website: readString(record.website),
    phone: readString(record.phone),
    google_place_id: readString(record.google_place_id),
    google_ftid: readString(record.google_ftid),
    osm_id: readString(record.osm_id),
    amap_poi_id: readString(record.amap_poi_id),
  };
}

function normalizeIdentity(value: string): string {
  return value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function destinationTokens(value: string): string[] {
  return normalizeIdentity(value)
    .split(' ')
    .filter(token => token.length >= 3);
}

function pickStrongPlaceMatch(
  expectedName: string,
  destination: string,
  candidates: Record<string, unknown>[],
): Record<string, unknown> | null {
  const expected = normalizeIdentity(expectedName);
  const destTokens = destinationTokens(destination);

  for (const candidate of candidates) {
    const name = readString(candidate.name);
    if (!name || normalizeIdentity(name) !== expected) continue;

    if (destTokens.length === 0) return null;
    const address = normalizeIdentity(readString(candidate.address) || '');
    if (!address) continue;
    if (destTokens.some(token => address.includes(token))) return candidate;
  }

  return null;
}

function destinationFromNotes(notes: string | null | undefined): string | null {
  if (!notes) return null;
  const match = notes.match(/Voya destination:\s*([^.]*)\./i);
  return match?.[1]?.trim() || null;
}

function stripVoyaSuggestionPrefix(notes: string | null | undefined): string {
  return (notes || '')
    .replace(/Suggested by Voya — verify current details before relying on them\.\s*/i, '')
    .replace(/Voya destination:\s*[^.]*\.\s*/i, '')
    .trim();
}

function providerSource(place: {
  google_place_id?: string | null;
  osm_id?: string | null;
  amap_poi_id?: string | null;
}): string | null {
  if (place.google_place_id) return 'google';
  if (place.osm_id) return 'openstreetmap';
  if (place.amap_poi_id) return 'amap';
  return null;
}


function isVoyaSuggestion(notes: string | null | undefined): boolean {
  return /Suggested by Voya — verify current details before relying on them\./i.test(notes || '');
}


interface VoyaEditSnapshotPayload {
  version: 1;
  postFingerprint?: string;
  days: Array<{
    day: Record<string, unknown> & { id: number };
    assignments: Array<Record<string, unknown> & { id: number; order_index?: number | null }>;
    participants: Array<{ assignment_id: number; user_id: number }>;
    reservationLinks: Array<{ reservation_id: number; assignment_id: number }>;
  }>;
}

function snapshotFingerprint(value: unknown): string {
  const input = JSON.stringify(value);
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function parseEditSnapshotPayload(value: string): VoyaEditSnapshotPayload {
  try {
    const parsed = JSON.parse(value) as Partial<VoyaEditSnapshotPayload>;
    if (parsed.version !== 1 || !Array.isArray(parsed.days)) {
      throw new Error('Unsupported snapshot format');
    }
    return parsed as VoyaEditSnapshotPayload;
  } catch {
    throw new VoyaAiInvalidDraftError('Voya edit snapshot is corrupted or unsupported');
  }
}

function parseNumberArray(value: string): number[] {
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(Number).filter(Number.isFinite);
  } catch {
    return [];
  }
}

function asNullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}


interface VoyaReadinessRow {
  id: number;
  trip_id: number;
  title: string;
  kind: 'Reserve' | 'Verify' | 'Transport' | 'Hotel' | 'Timing' | 'Document' | 'Other';
  priority: 'High' | 'Medium' | 'Low';
  status: 'To do' | 'Done' | 'Not needed';
  reason: string;
  action_label: string | null;
  day_id: number | null;
  place_id: number | null;
  fingerprint: string | null;
  created_at: string;
  updated_at: string;
}

const READINESS_SYSTEM_PROMPT = `You are Voya's trip-readiness assistant.
Use only the supplied trip data.
Create concrete preparation/checking tasks, not generic travel advice.
Never invent legal requirements, visa rules, opening hours, live availability, prices, confirmations, URLs, deadlines, or policies.
If the trip data does not support a task, omit it.
Return only the requested structured checklist.`;

function readinessIdentity(kind: string, title: string): string {
  return `${kind}:${title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()}`;
}

function dedupeReadinessItems(items: VoyaGeneratedReadinessItem[]): VoyaGeneratedReadinessItem[] {
  const seen = new Set<string>();
  const out: VoyaGeneratedReadinessItem[] = [];
  for (const item of items) {
    const key = readinessIdentity(item.kind, item.title);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function readinessFingerprint(value: unknown): string {
  const input = JSON.stringify(value);
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function readinessResult(
  tripId: number,
  rows: VoyaReadinessRow[],
  currentFingerprint: string,
  state: { fingerprint: string; updated_at: string } | null,
): VoyaReadinessResult {
  const weights = { High: 3, Medium: 2, Low: 1 } as const;
  let total = 0;
  let complete = 0;
  for (const row of rows) {
    const weight = weights[row.priority];
    total += weight;
    if (row.status === 'Done' || row.status === 'Not needed') complete += weight;
  }
  const score = total === 0 ? 100 : Math.round((complete / total) * 100);
  const storedFingerprint = state?.fingerprint ?? rows[0]?.fingerprint ?? null;
  return {
    tripId,
    score,
    updatedAt: state?.updated_at ?? rows.reduce<string | null>((latest, row) => !latest || row.updated_at > latest ? row.updated_at : latest, null),
    fingerprint: storedFingerprint,
    stale: storedFingerprint != null && storedFingerprint !== currentFingerprint,
    items: rows.map((row) => ({
      id: row.id,
      tripId: row.trip_id,
      title: row.title,
      kind: row.kind,
      priority: row.priority,
      status: row.status,
      reason: row.reason,
      actionLabel: row.action_label ?? undefined,
      dayId: row.day_id,
      placeId: row.place_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
  };
}


const DESTINATION_DISCOVERY_SYSTEM_PROMPT = `You are Voya's destination discovery engine.
Suggest only real geographic travel destinations that you are confident exist.
Personalize recommendations using the traveler's stated request and Traveler DNA.
Be inspiring but factual. This is not a live-search call.
Never invent current prices, visa or entry rules, live safety claims, current events, opening hours, live weather, flight duration, or availability.
Use qualitative budget and climate language only.
Return only the requested structured discovery result.`;


const DESTINATION_RESOLVER_SYSTEM_PROMPT = `You are Voya's geographic destination resolver.
Interpret short traveler-entered destination text conservatively.
Return only real geographic travel destinations that you are confident exist.
When a name is ambiguous, surface distinct interpretations instead of silently choosing one.
Do not return businesses, hotels, airports, transit stations, attractions, or fictional places.
Do not add live facts, prices, safety claims, visa information, or travel availability.
Return only the requested structured result.`;


function isTransferActivity(category: string, name: string): boolean {
  const value = `${category} ${name}`.toLowerCase();
  return /\b(transport|transfer|train|rail|flight|airport|ferry|bus|drive|driving)\b/.test(value);
}


function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours <= 0) return `${rest} min`;
  if (rest === 0) return `${hours}h`;
  return `${hours}h ${rest}m`;
}

function humanTransitMode(mode: string, lines: string[]): string {
  const normalized = mode.toUpperCase();
  const base =
    normalized.includes('RAIL') || normalized === 'TRAIN' ? 'Train'
      : normalized === 'BUS' || normalized === 'COACH' ? 'Bus'
        : normalized === 'FERRY' ? 'Ferry'
          : normalized === 'TRAM' ? 'Tram'
            : normalized === 'SUBWAY' ? 'Metro'
              : 'Public transit';
  return lines.length ? `${base} · ${lines.slice(0, 2).join(' / ')}` : base;
}

function markRecommendedTransport(options: VoyaTransportAdviceResult['options']): void {
  const transit = options
    .filter(option => option.mode === 'transit' && option.durationMin != null)
    .sort((a, b) => (a.durationMin! - b.durationMin!) || ((a.transfers ?? 99) - (b.transfers ?? 99)))[0];
  const drive = options.find(option => option.mode === 'drive' && option.durationMin != null);

  let winner = transit ?? drive ?? options[0];
  if (transit && drive) {
    const transitPenalty = transit.durationMin! * (1 + Math.min(0.3, (transit.transfers ?? 0) * 0.08));
    winner = transitPenalty <= drive.durationMin! * 1.35 ? transit : drive;
  }
  for (const option of options) option.recommended = option.id === winner.id;
}
