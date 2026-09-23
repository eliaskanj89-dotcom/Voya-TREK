import { describe, expect, it, vi } from 'vitest';
import { VoyaAiInvalidDraftError, VoyaAiService } from '../../../src/nest/voya-ai/voya-ai.service';

type DbStub = {
  get: ReturnType<typeof vi.fn>;
  all: ReturnType<typeof vi.fn>;
  run: ReturnType<typeof vi.fn>;
  transaction: ReturnType<typeof vi.fn>;
};

function serviceWith(db: Partial<DbStub> = {}, days: Record<string, unknown> = {}) {
  const database = {
    get: vi.fn(),
    all: vi.fn(),
    run: vi.fn(),
    transaction: vi.fn((fn: () => unknown) => fn()),
    ...db,
  };
  const dayService = {
    verifyTripAccess: vi.fn(() => ({ user_id: 1 })),
    canEdit: vi.fn(() => true),
    getDay: vi.fn(),
    ...days,
  };

  const service = new VoyaAiService(
    {} as never,
    {} as never,
    database as never,
    {} as never,
    dayService as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );

  return { service, database, dayService };
}

function fingerprintFixture(order = 0, title = 'Museum day') {
  const { service } = serviceWith({
    get: vi.fn((sql: string) => {
      if (sql.includes('SELECT id, title, notes, default_transport_mode FROM days')) {
        return { id: 11, title, notes: 'Balanced day', default_transport_mode: 'walk' };
      }
      return undefined;
    }),
    all: vi.fn((sql: string) => {
      if (sql.includes('SELECT * FROM day_assignments')) {
        return [{
          id: 101,
          day_id: 11,
          place_id: 501,
          order_index: order,
          notes: null,
          assignment_time: '10:00',
          assignment_end_time: '11:30',
        }];
      }
      if (sql.includes('assignment_participants')) return [{ assignment_id: 101, user_id: 1 }];
      if (sql.includes('FROM reservations')) return [];
      return [];
    }),
  });

  const compute = (service as unknown as {
    editStateFingerprint: (tripId: number, dayIds: number[]) => string
  }).editStateFingerprint.bind(service);

  return compute(7, [11]);
}

describe('Voya edit-history safety', () => {
  it('produces a deterministic fingerprint for the same itinerary state', () => {
    expect(fingerprintFixture()).toBe(fingerprintFixture());
  });

  it('changes the fingerprint when editable itinerary state changes', () => {
    expect(fingerprintFixture(0, 'Museum day')).not.toBe(fingerprintFixture(1, 'Museum day'));
    expect(fingerprintFixture(0, 'Museum day')).not.toBe(fingerprintFixture(0, 'Food day'));
  });

  it('blocks restoring an old snapshot after the affected itinerary changed', () => {
    const snapshot = {
      version: 1,
      postFingerprint: '00000000',
      days: [{
        day: { id: 11, title: 'Before Voya' },
        assignments: [],
        participants: [],
        reservationLinks: [],
      }],
    };

    const { service, database } = serviceWith({
      get: vi.fn((sql: string) => {
        if (sql.includes('FROM voya_edit_snapshots')) {
          return {
            id: 9,
            trip_id: 7,
            scope: 'day',
            label: 'Before Voya day edit',
            affected_day_ids: '[11]',
            snapshot_json: JSON.stringify(snapshot),
          };
        }
        if (sql.includes('SELECT id, title, notes, default_transport_mode FROM days')) {
          return { id: 11, title: 'Changed manually', notes: null, default_transport_mode: 'walk' };
        }
        return undefined;
      }),
      all: vi.fn((sql: string) => {
        if (sql.includes('SELECT * FROM day_assignments')) return [];
        return [];
      }),
    });

    expect(() => service.restoreEditSnapshot(
      { id: 1, role: 'user' } as never,
      { tripId: 7, snapshotId: 9 },
    )).toThrow(VoyaAiInvalidDraftError);
    expect(database.transaction).not.toHaveBeenCalled();
  });

  it('treats hotel-linked and reservation-linked assignments as protected', () => {
    const { service } = serviceWith({
      get: vi.fn((sql: string, assignmentId: number) => {
        if (sql.includes('FROM reservations') && assignmentId === 33) return { id: 700 };
        return undefined;
      }),
    });

    const protect = (service as unknown as {
      assignmentProtectedFromAiEdit: (assignment: {
        id: number;
        accommodation_id?: number | null;
        reservation_status?: string | null;
        reservation_datetime?: string | null;
      }) => boolean
    }).assignmentProtectedFromAiEdit.bind(service);

    expect(protect({ id: 10, accommodation_id: 44 })).toBe(true);
    expect(protect({ id: 20, reservation_status: 'confirmed' })).toBe(true);
    expect(protect({ id: 21, reservation_datetime: '2026-10-01T20:00:00' })).toBe(true);
    expect(protect({ id: 33 })).toBe(true);
    expect(protect({ id: 34 })).toBe(false);
  });
});
