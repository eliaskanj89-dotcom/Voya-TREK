import { describe, expect, it, vi } from 'vitest';
import { VoyaAiService } from '../../../src/nest/voya-ai/voya-ai.service';

function makeService(options: {
  readiness?: { id: number; trip_id: number; title: string; kind: string; priority: 'High' | 'Medium' | 'Low'; status: string; reason: string; action_label?: string | null };
  todos?: any[];
} = {}) {
  const readiness = options.readiness ?? {
    id: 42,
    trip_id: 7,
    title: 'Verify Florence train',
    kind: 'Transport',
    priority: 'High' as const,
    status: 'To do',
    reason: 'The transfer exists in the plan but the current schedule still needs checking.',
    action_label: 'Check the operator schedule',
  };
  const db = {
    canAccessTrip: vi.fn(() => ({ id: 7, user_id: 1 })),
    get: vi.fn((sql: string) => sql.includes('voya_readiness_items') ? readiness : undefined),
  };
  const todo = {
    verifyTripAccess: vi.fn(() => ({ id: 7, user_id: 1 })),
    canEdit: vi.fn(() => true),
    listItems: vi.fn(() => options.todos ?? []),
    createItem: vi.fn((_tripId: number, data: any) => ({ id: 99, ...data, checked: 0 })),
    broadcast: vi.fn(),
  };
  const service = new VoyaAiService(
    {} as never,
    {} as never,
    db as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    todo as never,
  );
  return { service, db, todo, readiness };
}

describe('Voya readiness → TREK task bridge', () => {
  it('creates a P1 task for a high-priority readiness item without inventing a due date', () => {
    const { service, todo } = makeService();

    const result = service.readinessToTodo(
      { id: 1, role: 'user' } as never,
      { tripId: 7, itemId: 42 },
    );

    expect(result).toEqual({ created: true, todoItemId: 99 });
    expect(todo.createItem).toHaveBeenCalledTimes(1);
    expect(todo.createItem).toHaveBeenCalledWith(7, expect.objectContaining({
      name: 'Verify Florence train',
      category: 'Voya · Before You Go',
      priority: 1,
    }));
    const payload = todo.createItem.mock.calls[0][1];
    expect(payload).not.toHaveProperty('due_date');
    expect(payload.description).toContain('[voya-readiness:42]');
    expect(payload.description).toContain('The transfer exists in the plan');
    expect(todo.broadcast).toHaveBeenCalledWith('7', 'todo:created', expect.objectContaining({
      item: expect.objectContaining({ id: 99 }),
    }), undefined);
  });

  it.each([
    ['High', 1],
    ['Medium', 2],
    ['Low', 3],
  ] as const)('maps %s readiness priority to TREK P%s', (priority, expected) => {
    const { service, todo } = makeService({
      readiness: {
        id: 42,
        trip_id: 7,
        title: 'Task',
        kind: 'Other',
        priority,
        status: 'To do',
        reason: 'Supported follow-up.',
      },
    });

    service.readinessToTodo({ id: 1, role: 'user' } as never, { tripId: 7, itemId: 42 });
    expect(todo.createItem.mock.calls[0][1].priority).toBe(expected);
  });

  it('deduplicates repeated promotion using the hidden readiness marker', () => {
    const { service, todo } = makeService({
      todos: [{
        id: 55,
        name: 'Verify Florence train',
        description: 'Existing task\n\n[voya-readiness:42]',
      }],
    });

    const result = service.readinessToTodo(
      { id: 1, role: 'user' } as never,
      { tripId: 7, itemId: 42 },
    );

    expect(result).toEqual({ created: false, todoItemId: 55 });
    expect(todo.createItem).not.toHaveBeenCalled();
    expect(todo.broadcast).not.toHaveBeenCalled();
  });
});
