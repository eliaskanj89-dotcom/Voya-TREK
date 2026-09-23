import { voyaAiApi } from '../api/client'
import { getApiErrorMessage } from '../types'
import { useBackgroundTasksStore } from '../store/backgroundTasksStore'

/**
 * Runs the post-create trust pipeline for Voya-generated trips.
 *
 * Order matters:
 * 1) verify provider identities / coordinates and optimize verified route order;
 * 2) best-effort refresh Before You Go from the now-current itinerary;
 * 3) compute deterministic Trip Health after enrichment.
 *
 * Readiness generation depends on the user's configured LLM and is intentionally
 * non-fatal. Place verification remains the core required enrichment step.
 */
export function startVoyaEnrichment(tripId: number): void {
  const id = `voya-enrich-${tripId}-${Date.now()}`
  const store = useBackgroundTasksStore.getState()

  store.addVoyaTask({
    id,
    tripId: String(tripId),
    label: 'Voya is verifying places, optimizing routes and checking readiness',
  })

  void (async () => {
    const verification = await voyaAiApi.verifyTrip({ tripId })

    let readinessRefreshed = false
    try {
      await voyaAiApi.refreshReadiness({ tripId })
      readinessRefreshed = true
    } catch {
      // Readiness refresh needs a configured LLM. Verification and route
      // optimization are still useful and must not be downgraded to an error.
    }

    let healthScore: number | undefined
    let healthLabel: 'Excellent' | 'Strong' | 'Needs attention' | 'At risk' | undefined
    try {
      const health = await voyaAiApi.tripHealth({ tripId })
      healthScore = health.score
      healthLabel = health.label
    } catch {
      // Trip Health is deterministic, but enrichment completion should not fail
      // solely because the summary audit could not be loaded afterward.
    }

    useBackgroundTasksStore.getState().setVoyaDone(id, {
      verified: verification.verified,
      unresolved: verification.unresolved,
      optimizedDays: verification.optimizedDays,
      readinessRefreshed,
      healthScore,
      healthLabel,
    })

    window.dispatchEvent(new CustomEvent('voya:enrichment-complete', {
      detail: {
        tripId,
        verified: verification.verified,
        unresolved: verification.unresolved,
        optimizedDays: verification.optimizedDays,
        readinessRefreshed,
        healthScore,
        healthLabel,
      },
    }))
  })().catch(error => {
    useBackgroundTasksStore.getState().setVoyaError(
      id,
      getApiErrorMessage(error, 'Voya could not finish place verification. You can retry from Places.'),
    )
  })
}
