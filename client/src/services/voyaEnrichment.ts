import { voyaAiApi } from '../api/client'
import { getApiErrorMessage } from '../types'
import { useBackgroundTasksStore } from '../store/backgroundTasksStore'

interface RunOptions {
  taskId?: string
  announce?: boolean
}

/**
 * Runs the post-create trust pipeline for Voya-generated trips.
 *
 * The operations are deliberately repeatable: provider verification skips
 * already-identified places, route optimization is stable, readiness is rebuilt
 * from the current fingerprint, and Trip Health is read-only. That makes it safe
 * to resume a task after a hard reload.
 */
function runVoyaEnrichment(tripId: number, options: RunOptions = {}): void {
  const id = options.taskId ?? `voya-enrich-${tripId}-${Date.now()}`
  const announce = options.announce !== false
  const store = useBackgroundTasksStore.getState()

  if (announce) {
    store.addVoyaTask({
      id,
      tripId: String(tripId),
      label: 'Voya is verifying places, optimizing routes and checking readiness',
    })
  }

  void (async () => {
    const verification = await voyaAiApi.verifyTrip({ tripId })

    let readinessRefreshed = false
    try {
      await voyaAiApi.refreshReadiness({ tripId })
      readinessRefreshed = true
      window.dispatchEvent(new CustomEvent('voya:readiness-updated', { detail: { tripId } }))
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
      window.dispatchEvent(new CustomEvent('voya:trip-health-updated', {
        detail: { tripId, score: health.score, label: health.label },
      }))
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

export function startVoyaEnrichment(tripId: number): void {
  runVoyaEnrichment(tripId)
}

export function resumeVoyaEnrichment(taskId: string, tripId: number): void {
  runVoyaEnrichment(tripId, { taskId, announce: false })
}
