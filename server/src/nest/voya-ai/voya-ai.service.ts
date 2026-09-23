import { Injectable } from '@nestjs/common';
import {
  type VoyaApplyDayEditRequest,
  type VoyaDayEditDraft,
  type VoyaDayEditRequest,
  type VoyaMaterializeDraftRequest,
  type VoyaPlanDraftRequest,
  type VoyaPlanDraftResponse,
  type VoyaVerifyTripRequest,
  type VoyaVerifyTripResult,
  type VoyaTripEditPlan,
  type VoyaTravelerDna,
  type VoyaTripEditRequest,
  type VoyaGeneratedReadinessItem,
  type VoyaReadinessBuildRequest,
  type VoyaReadinessResult,
  type VoyaReadinessStatusRequest,
  voyaGeneratedReadinessItemSchema,
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

const generatedPlanSchema = voyaPlanDraftResponseSchema.omit({ generatedBy: true });
const generatedDayEditSchema = voyaDayEditDraftSchema.omit({ tripId: true, dayId: true, generatedBy: true });
const generatedTripEditPlanSchema = voyaTripEditPlanSchema.omit({ tripId: true, generatedBy: true });
const generatedReadinessSchema = z.object({
  items: z.array(voyaGeneratedReadinessItemSchema).max(12),
});

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
  ) {}

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
    return readinessResult(request.tripId, rows, fingerprint);
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
        reservationStatus: assignment.reservation_status || null,
        reservationNotes: assignment.reservation_notes || null,
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
        protected: a.accommodation_id != null,
      })),
    }));

    const config = this.configResolver.resolve(user.id);
    if (!config) throw new VoyaAiUnavailableError();
    const travelerDna = this.travelerDna(user.id);

    let repair = '';
    for (let attempt = 0; attempt < 2; attempt++) {
      const raw = await this.generator.generate(config, {
        system: TRIP_EDIT_SYSTEM_PROMPT,
        user: [
          `Trip: ${trip.title || 'Untitled trip'}.`,
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
      protected: a.accommodation_id != null,
    }));

    let repair = '';
    for (let attempt = 0; attempt < 2; attempt++) {
      const raw = await this.generator.generate(config, {
        system: DAY_EDIT_SYSTEM_PROMPT,
        user: [
          `Trip: ${trip.title || 'Untitled trip'}.`,
          `Day ${day.day_number || ''}${day.date ? ` on ${day.date}` : ''}.`,
          day.title ? `Current day title: ${day.title}.` : '',
          day.notes ? `Current day notes: ${day.notes}` : '',
          `Traveler instruction: ${request.instruction}`,
          this.travelerDnaPrompt(travelerDna),
          'Current assignments (these ids are authoritative):',
          JSON.stringify(context),
          'Every current assignmentId must appear exactly once: either as kind="existing" in sequence or in removedAssignmentIds.',
          'Never invent an assignmentId.',
          'Any assignment marked protected=true MUST stay in sequence and MUST NOT appear in removedAssignmentIds.',
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

    const currentByAssignment = new Map(current.map(a => [a.id, a]));
    const keptExistingIds = new Set(
      draft.sequence.filter(item => item.kind === 'existing').map(item => item.assignmentId),
    );
    const destinationHint =
      this.places.list(String(draft.tripId), { assignment: 'all' })
        .map(place => destinationFromNotes(place.notes))
        .find(Boolean)
      || trip.title
      || 'this trip';

    const createdPlaces: Array<ReturnType<PlacesService['create']>> = [];
    const createdAssignments: Array<NonNullable<ReturnType<AssignmentsService['createAssignment']>>> = [];
    const removedIds = [...draft.removedAssignmentIds];

    const result = this.db.transaction(() => {
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
        day: updatedDay,
        assignments: this.assignments.listDayAssignments(draft.dayId),
      };
    });

    for (const place of createdPlaces) {
      this.places.broadcast(String(draft.tripId), 'place:created', { place }, undefined);
    }
    for (const assignment of createdAssignments) {
      this.assignments.broadcast(String(draft.tripId), 'assignment:created', { assignment }, undefined);
    }
    for (const assignmentId of removedIds) {
      this.assignments.broadcast(
        String(draft.tripId),
        'assignment:deleted',
        { assignmentId, dayId: draft.dayId },
        undefined,
      );
    }
    this.assignments.broadcast(
      String(draft.tripId),
      'assignment:reordered',
      { dayId: draft.dayId, orderedIds: result.assignments.map(a => a.id) },
      undefined,
    );
    this.days.broadcast(String(draft.tripId), 'day:updated', { day: result.day }, undefined);
    this.assignments.reconcile(draft.tripId);

    return result;
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

  private assertDayEditDraft(
    draft: VoyaDayEditDraft,
    current: ReturnType<AssignmentsService['listDayAssignments']>,
  ): void {
    const currentIds = new Set(current.map(a => a.id));
    const protectedIds = new Set(current.filter(a => a.accommodation_id != null).map(a => a.id));
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
        throw new VoyaAiInvalidDraftError(`Protected hotel-linked assignment ${id} must stay on the day`);
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

function readinessResult(tripId: number, rows: VoyaReadinessRow[], currentFingerprint: string): VoyaReadinessResult {
  const weights = { High: 3, Medium: 2, Low: 1 } as const;
  let total = 0;
  let complete = 0;
  for (const row of rows) {
    const weight = weights[row.priority];
    total += weight;
    if (row.status === 'Done' || row.status === 'Not needed') complete += weight;
  }
  const score = total === 0 ? 100 : Math.round((complete / total) * 100);
  const storedFingerprint = rows[0]?.fingerprint ?? null;
  return {
    tripId,
    score,
    updatedAt: rows.reduce<string | null>((latest, row) => !latest || row.updated_at > latest ? row.updated_at : latest, null),
    fingerprint: storedFingerprint,
    stale: rows.length > 0 && storedFingerprint !== currentFingerprint,
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
