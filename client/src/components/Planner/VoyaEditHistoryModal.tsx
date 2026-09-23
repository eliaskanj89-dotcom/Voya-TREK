import { useEffect, useMemo, useState } from 'react'
import { Check, Clock3, RotateCcw, Sparkles } from 'lucide-react'
import type { Day, VoyaEditSnapshotSummary } from '@trek/shared'
import Modal from '../shared/Modal'
import { voyaAiApi } from '../../api/client'
import { getApiErrorMessage } from '../../types'

interface VoyaEditHistoryModalProps {
  isOpen: boolean
  onClose: () => void
  tripId: number
  days: Day[]
  onRestored: () => Promise<void> | void
}

export default function VoyaEditHistoryModal({
  isOpen,
  onClose,
  tripId,
  days,
  onRestored,
}: VoyaEditHistoryModalProps) {
  const [snapshots, setSnapshots] = useState<VoyaEditSnapshotSummary[]>([])
  const [loading, setLoading] = useState(false)
  const [restoringId, setRestoringId] = useState<number | null>(null)
  const [confirmId, setConfirmId] = useState<number | null>(null)
  const [error, setError] = useState('')

  const dayById = useMemo(() => new Map(days.map(day => [day.id, day])), [days])

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const result = await voyaAiApi.editHistory({ tripId })
      setSnapshots(result.snapshots)
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, 'Voya could not load version history.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!isOpen) return
    void load()
  }, [isOpen, tripId])

  const close = () => {
    if (restoringId != null) return
    setConfirmId(null)
    setError('')
    onClose()
  }

  const restore = async (snapshot: VoyaEditSnapshotSummary) => {
    setRestoringId(snapshot.id)
    setError('')
    try {
      await voyaAiApi.restoreEditSnapshot({ tripId, snapshotId: snapshot.id })
      await onRestored()
      await load()
      setConfirmId(null)
    } catch (err: unknown) {
      setError(getApiErrorMessage(
        err,
        'Voya could not restore this version. The itinerary may have changed in a way that makes this snapshot unsafe to restore.',
      ))
    } finally {
      setRestoringId(null)
    }
  }

  const dayLabel = (dayId: number) => {
    const day = dayById.get(dayId)
    const index = days.findIndex(candidate => candidate.id === dayId)
    return day?.title || `Day ${day?.day_number ?? index + 1}`
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={close}
      size="xl"
      title={
        <span className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#377CF6] text-white shadow-[0_8px_20px_rgba(55,124,246,.24)]">
            <Clock3 size={14} strokeWidth={2.2} />
          </span>
          <span className="voya-editorial text-[22px] font-medium tracking-[-.035em]">Voya version history</span>
        </span>
      }
    >
      <div className="mb-5 rounded-[22px] border border-[#BDD6F7]/35 bg-[linear-gradient(145deg,rgba(242,248,255,.92),rgba(255,255,255,.78))] p-4 dark:border-white/8 dark:bg-white/4">
        <div className="flex items-start gap-3">
          <Sparkles size={16} className="mt-0.5 flex-none text-[#377CF6]" />
          <div>
            <div className="text-body font-semibold text-content">AI edits are reversible</div>
            <p className="mt-1 text-caption leading-relaxed text-content-muted">
              Voya saves a version immediately before each AI day edit or whole-trip edit. Restoring affects only those itinerary days. If those days changed afterward, Voya blocks the restore rather than overwriting newer work. A new snapshot is created before every successful restore.
            </p>
          </div>
        </div>
      </div>

      {loading && snapshots.length === 0 ? (
        <div className="flex min-h-[220px] items-center justify-center">
          <div className="flex items-center gap-2 text-caption text-content-muted">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#377CF6]/25 border-t-[#377CF6]" />
            Loading Voya history…
          </div>
        </div>
      ) : snapshots.length === 0 ? (
        <div className="flex min-h-[220px] flex-col items-center justify-center text-center">
          <div className="voya-empty-orb mb-4 flex h-[68px] w-[68px] items-center justify-center rounded-full">
            <span className="voya-wordmark text-[28px] text-white">V</span>
          </div>
          <div className="voya-editorial text-[22px] font-medium tracking-[-.035em] text-content">No Voya edits yet</div>
          <p className="mt-1 max-w-sm text-caption leading-relaxed text-content-muted">
            Your first snapshot will appear automatically before Voya changes a day or the whole trip.
          </p>
        </div>
      ) : (
        <div className="max-h-[520px] space-y-2.5 overflow-y-auto pr-1">
          {snapshots.map((snapshot, index) => {
            const confirming = confirmId === snapshot.id
            const restoring = restoringId === snapshot.id
            return (
              <article
                key={snapshot.id}
                className="overflow-hidden rounded-[20px] border border-edge-faint bg-surface-card"
              >
                <div className="flex items-start gap-3 px-4 py-3.5">
                  <span className={`flex h-9 w-9 flex-none items-center justify-center rounded-full ${
                    index === 0
                      ? 'bg-[#377CF6] text-white shadow-[0_8px_18px_rgba(55,124,246,.20)]'
                      : 'bg-[#377CF6]/8 text-[#377CF6]'
                  }`}>
                    <Clock3 size={14} strokeWidth={2.2} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-body font-semibold text-content">{snapshot.label}</span>
                      <span className="rounded-full bg-surface-hover px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[.08em] text-content-faint">
                        {snapshot.scope === 'trip' ? 'Whole trip' : 'Day edit'}
                      </span>
                      {snapshot.restoredAt && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[.08em] text-emerald-600 dark:text-emerald-400">
                          <Check size={9} strokeWidth={2.5} />
                          Restored
                        </span>
                      )}
                    </div>
                    <div className="mt-1 text-[11px] text-content-faint">
                      {formatSnapshotDate(snapshot.createdAt)}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {snapshot.affectedDayIds.map(dayId => (
                        <span key={dayId} className="rounded-full border border-edge-faint bg-surface-tertiary px-2.5 py-1 text-[10px] font-medium text-content-muted">
                          {dayLabel(dayId)}
                        </span>
                      ))}
                    </div>
                  </div>
                  {!confirming && (
                    <button
                      type="button"
                      onClick={() => setConfirmId(snapshot.id)}
                      disabled={restoringId != null}
                      className="inline-flex flex-none items-center gap-1.5 rounded-full border border-[#377CF6]/20 px-3 py-1.5 text-[11px] font-semibold text-[#377CF6] transition-all hover:bg-[#377CF6]/6 disabled:opacity-45"
                    >
                      <RotateCcw size={12} />
                      Restore
                    </button>
                  )}
                </div>

                {confirming && (
                  <div className="border-t border-edge-faint bg-surface-tertiary px-4 py-3.5">
                    <p className="text-caption leading-relaxed text-content-muted">
                      Restore this itinerary version? Voya will save the current state first. If the affected days changed after this Voya edit, restore will stop with a conflict instead of overwriting the newer itinerary.
                    </p>
                    <div className="mt-3 flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setConfirmId(null)}
                        disabled={restoring}
                        className="rounded-full border border-edge px-3.5 py-2 text-caption font-medium text-content-muted disabled:opacity-50"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => { void restore(snapshot) }}
                        disabled={restoring}
                        className="inline-flex items-center gap-2 rounded-full bg-[#377CF6] px-4 py-2 text-caption font-semibold text-white shadow-[0_8px_20px_rgba(55,124,246,.20)] disabled:opacity-60"
                      >
                        {restoring ? (
                          <>
                            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/35 border-t-white" />
                            Restoring…
                          </>
                        ) : (
                          <>
                            <RotateCcw size={12} />
                            Restore version
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </article>
            )
          })}
        </div>
      )}

      {error && (
        <div className="mt-4 rounded-2xl border border-danger/20 bg-danger-soft px-4 py-3 text-caption text-danger">
          {error}
        </div>
      )}
    </Modal>
  )
}

function formatSnapshotDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}
