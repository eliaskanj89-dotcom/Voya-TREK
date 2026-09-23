import { beforeEach, describe, expect, it, vi } from 'vitest'

type EnrichmentModule = typeof import('../../../src/services/voyaEnrichment')

let enrichment: EnrichmentModule
let verifyTrip: ReturnType<typeof vi.fn>
let refreshReadiness: ReturnType<typeof vi.fn>
let tripHealth: ReturnType<typeof vi.fn>
let addVoyaTask: ReturnType<typeof vi.fn>
let setVoyaDone: ReturnType<typeof vi.fn>
let setVoyaError: ReturnType<typeof vi.fn>

async function freshImports() {
  vi.resetModules()

  verifyTrip = vi.fn()
  refreshReadiness = vi.fn()
  tripHealth = vi.fn()
  addVoyaTask = vi.fn()
  setVoyaDone = vi.fn()
  setVoyaError = vi.fn()

  vi.doMock('../../../src/api/client', () => ({
    voyaAiApi: {
      verifyTrip,
      refreshReadiness,
      tripHealth,
    },
  }))

  vi.doMock('../../../src/types', () => ({
    getApiErrorMessage: (_error: unknown, fallback: string) => fallback,
  }))

  vi.doMock('../../../src/store/backgroundTasksStore', () => ({
    useBackgroundTasksStore: {
      getState: () => ({
        addVoyaTask,
        setVoyaDone,
        setVoyaError,
      }),
    },
  }))

  enrichment = await import('../../../src/services/voyaEnrichment')
}

beforeEach(async () => {
  vi.restoreAllMocks()
  vi.clearAllMocks()
  await freshImports()
})

describe('startVoyaEnrichment', () => {
  it('VOYA-ENRICH-001: verifies places, refreshes readiness, then records Trip Health', async () => {
    verifyTrip.mockResolvedValue({
      verified: 5,
      unresolved: 2,
      optimizedDays: 2,
    })
    refreshReadiness.mockResolvedValue({ score: 82 })
    tripHealth.mockResolvedValue({
      score: 91,
      label: 'Excellent',
    })

    const dispatch = vi.spyOn(window, 'dispatchEvent')

    enrichment.startVoyaEnrichment(42)

    await vi.waitFor(() => expect(setVoyaDone).toHaveBeenCalledTimes(1))

    expect(verifyTrip).toHaveBeenCalledWith({ tripId: 42 })
    expect(refreshReadiness).toHaveBeenCalledWith({ tripId: 42 })
    expect(tripHealth).toHaveBeenCalledWith({ tripId: 42 })

    expect(verifyTrip.mock.invocationCallOrder[0]).toBeLessThan(refreshReadiness.mock.invocationCallOrder[0])
    expect(refreshReadiness.mock.invocationCallOrder[0]).toBeLessThan(tripHealth.mock.invocationCallOrder[0])

    const taskId = addVoyaTask.mock.calls[0][0].id as string
    expect(setVoyaDone).toHaveBeenCalledWith(taskId, {
      verified: 5,
      unresolved: 2,
      optimizedDays: 2,
      readinessRefreshed: true,
      healthScore: 91,
      healthLabel: 'Excellent',
    })

    const eventTypes = dispatch.mock.calls.map(([event]) => event.type)
    expect(eventTypes).toContain('voya:readiness-updated')
    expect(eventTypes).toContain('voya:trip-health-updated')
    expect(eventTypes).toContain('voya:enrichment-complete')
    expect(setVoyaError).not.toHaveBeenCalled()
  })

  it('VOYA-ENRICH-002: readiness generation failure is non-fatal', async () => {
    verifyTrip.mockResolvedValue({
      verified: 3,
      unresolved: 1,
      optimizedDays: 1,
    })
    refreshReadiness.mockRejectedValue(new Error('No configured LLM'))
    tripHealth.mockResolvedValue({
      score: 76,
      label: 'Strong',
    })

    enrichment.startVoyaEnrichment(7)

    await vi.waitFor(() => expect(setVoyaDone).toHaveBeenCalledTimes(1))

    const taskId = addVoyaTask.mock.calls[0][0].id as string
    expect(setVoyaDone).toHaveBeenCalledWith(taskId, {
      verified: 3,
      unresolved: 1,
      optimizedDays: 1,
      readinessRefreshed: false,
      healthScore: 76,
      healthLabel: 'Strong',
    })
    expect(tripHealth).toHaveBeenCalledWith({ tripId: 7 })
    expect(setVoyaError).not.toHaveBeenCalled()
  })

  it('VOYA-ENRICH-004: resume reuses the persisted task id without adding a duplicate task', async () => {
    verifyTrip.mockResolvedValue({
      verified: 1,
      unresolved: 0,
      optimizedDays: 0,
    })
    refreshReadiness.mockRejectedValue(new Error('No configured LLM'))
    tripHealth.mockResolvedValue({
      score: 100,
      label: 'Excellent',
    })

    enrichment.resumeVoyaEnrichment('persisted-voya-task', 12)

    await vi.waitFor(() => expect(setVoyaDone).toHaveBeenCalledTimes(1))

    expect(addVoyaTask).not.toHaveBeenCalled()
    expect(setVoyaDone).toHaveBeenCalledWith('persisted-voya-task', {
      verified: 1,
      unresolved: 0,
      optimizedDays: 0,
      readinessRefreshed: false,
      healthScore: 100,
      healthLabel: 'Excellent',
    })
  })

  it('VOYA-ENRICH-003: provider verification failure marks the background task as error', async () => {
    verifyTrip.mockRejectedValue(new Error('Provider unavailable'))

    enrichment.startVoyaEnrichment(99)

    await vi.waitFor(() => expect(setVoyaError).toHaveBeenCalledTimes(1))

    expect(refreshReadiness).not.toHaveBeenCalled()
    expect(tripHealth).not.toHaveBeenCalled()
    expect(setVoyaDone).not.toHaveBeenCalled()

    const taskId = addVoyaTask.mock.calls[0][0].id as string
    expect(setVoyaError).toHaveBeenCalledWith(
      taskId,
      'Voya could not finish place verification. You can retry from Places.',
    )
  })
})
