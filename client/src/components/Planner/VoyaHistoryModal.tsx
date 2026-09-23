import { useEffect, useState } from 'react'
import { History, RotateCcw, Sparkles } from 'lucide-react'
import type { VoyaEditSnapshotSummary } from '@trek/shared'
import Modal from '../shared/Modal'
import { voyaAiApi } from '../../api/client'
import { getApiErrorMessage } from '../../types'

interface Props {
  isOpen: boolean
  onClose: () => void
  tripId: number
  onRestored: () => Promise<void> | void
}

export default function VoyaHistoryModal({ isOpen, onClose, tripId, onRestored }: Props) {
  const [snapshots, setSnapshots] = useState<VoyaEditSnapshotSummary[]>([])
  const [loading, setLoading] = useState(false)
  const [restoringId, setRestoringId] = useState<number | null>(null)
  const [confirmId, setConfirmId] = useState<number | null>(null)
  const [error, setError] = useState('')

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const result = await voyaAiApi.editHistory({ tripId })
      setSnapshots(result.snapshots)
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, 'Voya could not load edit history.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!isOpen) return
    void load()
  }, [isOpen, tripId])

  const restore = async (snapshot: VoyaEditSnapshotSummary) => {
    setRestoringId(snapshot.id)
    setError('')
    try {
      await voyaAiApi.restoreEditSnapshot({ tripId, snapshotId: snapshot.id })
      await onRestored()
      setConfirmId(null)
      await load()
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, 'Voya could not restore this version.'))
    } finally {
      setRestoringId(null)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="xl"
      title={
        <span className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#377CF6] text-white shadow-[0_8px_20px_rgba(55,124,246,.24)]">
            <History size={14} strokeWidth={2.3} />
          </span>
          <span className="voya-editorial text-[23px] font-medium tracking-[-.04em]">Voya history</span>
        </span>
      }
    >
      <div className="mb-4 rounded-[20px] border border-[#BCD5F6]/35 bg-[linear-gradient(145deg,rgba(242,248,255,.92),rgba(255,255,255,.78))] p-4 dark:border-white/8 dark:bg-white/4">
        <div className="flex items-start gap-3">
          <Sparkles size={16} className="mt-0.5 flex-none text-[#377CF6]" />
          <div>
            <div className="text-body font-semibold text-content">Undo Voya edits safely</div>
            <p className="mt-1 text-caption leading-relaxed text-content-muted">
              Voya saves a version before AI edits. Restoring changes itinerary structure only; protected booked and hotel-linked stops remain protected.
            </p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex min-h-[180px] items-center justify-center">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#377CF6]/20 border-t-[#377CF6]" />
        </div>
      ) : snapshots.length === 0 ? (
        <div className="flex min-h-[180px] flex-col items-center justify-center rounded-[20px] border border-dashed border-edge px-6 text-center">
          <span className="voya-empty-orb mb-4 flex h-16 w-16 items-center justify-center rounded-full">
            <span className="voya-wordmark text-[27px] text-white">V</span>
          </span>
          <div className="text-body font-semibold text-content">No Voya edits yet</div>
          <p className="mt-1 max-w-sm text-caption text-content-muted">
            Versions will appear here after you apply day-level or whole-trip Voya edits.
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {snapshots.map(snapshot => {
            const restored = !!snapshot.restoredAt
            const confirming = confirmId === snapshot.id
            return (
              <article key={snapshot.id} className="rounded-[18px] border border-edge-faint bg-surface-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[.1em] ${
                        snapshot.scope === 'trip'
                          ? 'bg-[#377CF6]/10 text-[#377CF6]'
                          : 'bg-surface-tertiary text-content-muted'
                      }`}>
                        {snapshot.scope === 'trip' ? 'Whole trip' : 'Day edit'}
                      </span>
                      <span className="text-[10px] font-medium text-content-faint">
                        {snapshot.affectedDayIds.length} day{snapshot.affectedDayIds.length === 1 ? '' : 's'}
                      </span>
                      {restored && <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">Restored</span>}
                    </div>
                    <div className="mt-2 text-body font-semibold text-content">{snapshot.label}</div>
                    <div className="mt-1 text-caption text-content-faint">{formatDate(snapshot.createdAt)}</div>
                  </div>

                  {!confirming ? (
                    <button
                      type="button"
                      onClick={() => setConfirmId(snapshot.id)}
                      disabled={restoringId != null}
                      className="inline-flex items-center gap-1.5 rounded-full border border-edge px-3.5 py-2 text-caption font-semibold text-content-secondary hover:border-[#377CF6]/30 hover:bg-[#377CF6]/5 hover:text-[#377CF6] disabled:opacity-50"
                    >
                      <RotateCcw size={13} />
                      Restore
                    </button>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setConfirmId(null)}
                        disabled={restoringId != null}
                        className="rounded-full border border-edge px-3 py-2 text-caption font-medium text-content-muted disabled:opacity-50"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => { void restore(snapshot) }}
                        disabled={restoringId != null}
                        className="inline-flex items-center gap-1.5 rounded-full bg-[#377CF6] px-3.5 py-2 text-caption font-semibold text-white shadow-[0_8px_18px_rgba(55,124,246,.20)] disabled:opacity-60"
                      >
                        {restoringId === snapshot.id ? (
                          <>
                            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/35 border-t-white" />
                            Restoring…
                          </>
                        ) : (
                          <>
                            <RotateCcw size={13} />
                            Confirm restore
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>
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

function formatDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}
