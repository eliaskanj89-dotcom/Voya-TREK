import { voyaAiApi } from '../api/client'
import { getApiErrorMessage } from '../types'
import { useBackgroundTasksStore } from '../store/backgroundTasksStore'

export function startVoyaEnrichment(tripId: number): void {
  const id = `voya-enrich-${tripId}-${Date.now()}`
  const store = useBackgroundTasksStore.getState()

  store.addVoyaTask({
    id,
    tripId: String(tripId),
    label: 'Voya is verifying places and optimizing routes',
  })

  void voyaAiApi
    .verifyTrip({ tripId })
    .then(result => {
      useBackgroundTasksStore.getState().setVoyaDone(id, {
        verified: result.verified,
        unresolved: result.unresolved,
        optimizedDays: result.optimizedDays,
      })
    })
    .catch(error => {
      useBackgroundTasksStore.getState().setVoyaError(
        id,
        getApiErrorMessage(error, 'Voya could not finish place verification. You can retry from Places.'),
      )
    })
}
