import { useEffect, useMemo, useState } from 'react'
import { Check, CheckCircle2, Circle, RefreshCw, ShieldCheck, Sparkles, X } from 'lucide-react'
import type { VoyaReadinessItem, VoyaReadinessResult, VoyaReadinessStatus } from '@trek/shared'
import Modal from '../shared/Modal'
import { voyaAiApi } from '../../api/client'
import { getApiErrorMessage } from '../../types'

interface VoyaReadinessPanelProps {
  tripId: number
}

export default function VoyaReadinessPanel({ tripId }: VoyaReadinessPanelProps) {
  const [open, setOpen] = useState(false)
  const [data, setData] = useState<VoyaReadinessResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [updatingId, setUpdatingId] = useState<number | null>(null)
  const [error, setError] = useState('')

  const load = async () => {
    setLoading(true)
    try {
      const result = await voyaAiApi.readiness({ tripId })
      setData(result)
      setError('')
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, 'Voya could not load trip readiness.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [tripId])

  const refresh = async () => {
    if (refreshing) return
    setRefreshing(true)
    setError('')
    try {
      const result = await voyaAiApi.refreshReadiness({ tripId })
      setData(result)
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, 'Voya could not refresh the readiness checklist.'))
    } finally {
      setRefreshing(false)
    }
  }

  const setStatus = async (item: VoyaReadinessItem, status: VoyaReadinessStatus) => {
    if (updatingId != null) return
    setUpdatingId(item.id)
    setError('')
    try {
      const result = await voyaAiApi.updateReadinessStatus({
        tripId,
        itemId: item.id,
        status,
      })
      setData(result)
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, 'Voya could not update this checklist item.'))
    } finally {
      setUpdatingId(null)
    }
  }

  const generated = data?.fingerprint != null
  const actionable = useMemo(
    () => data?.items.filter(item => item.status === 'To do') ?? [],
    [data],
  )
  const highOpen = actionable.filter(item => item.priority === 'High').length

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="voya-readiness-pill absolute right-4 top-3 z-[80] flex items-center gap-2 rounded-full border border-[#B9D3F7]/45 bg-[rgba(248,252,255,.88)] px-3 py-2 text-left shadow-[0_12px_30px_rgba(31,67,112,.12)] backdrop-blur-[22px] transition-all hover:-translate-y-px hover:border-[#377CF6]/30 hover:shadow-[0_16px_38px_rgba(31,67,112,.16)] dark:border-white/10 dark:bg-[rgba(10,25,44,.78)]"
        aria-label="Open Before You Go readiness"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#377CF6] text-white shadow-[0_7px_16px_rgba(55,124,246,.24)]">
          <ShieldCheck size={13} strokeWidth={2.4} />
        </span>
        <span>
          <span className="block text-[10px] font-semibold uppercase tracking-[.12em] text-content-faint">Before You Go</span>
          <span className="block text-[12px] font-semibold text-content">
            {loading
              ? 'Checking…'
              : !generated
                ? 'Build readiness'
                : data?.stale
                  ? 'Needs refresh'
                  : `${data?.score ?? 0}% ready`}
          </span>
        </span>
        {highOpen > 0 && (
          <span className="ml-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#EF4444]/10 px-1.5 text-[10px] font-bold text-[#DC2626]">
            {highOpen}
          </span>
        )}
      </button>

      <Modal
        isOpen={open}
        onClose={() => setOpen(false)}
        size="2xl"
        title={
          <span className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#377CF6] text-white shadow-[0_8px_20px_rgba(55,124,246,.24)]">
              <ShieldCheck size={16} strokeWidth={2.3} />
            </span>
            <span>
              <span className="voya-editorial block text-[24px] font-medium tracking-[-.04em]">Before You Go</span>
              <span className="block text-[11px] font-normal text-content-faint">Trip readiness, based on the facts already in your plan.</span>
            </span>
          </span>
        }
      >
        {loading && !data ? (
          <div className="flex min-h-[260px] flex-col items-center justify-center text-center">
            <span className="h-7 w-7 animate-spin rounded-full border-2 border-[#377CF6]/20 border-t-[#377CF6]" />
            <p className="mt-3 text-caption text-content-muted">Loading readiness…</p>
          </div>
        ) : !generated ? (
          <div className="flex min-h-[320px] flex-col items-center justify-center px-6 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#377CF6]/10 text-[#377CF6]">
              <Sparkles size={24} strokeWidth={2} />
            </div>
            <h3 className="voya-editorial mt-5 text-[28px] font-medium tracking-[-.04em] text-content">Make the trip feel ready</h3>
            <p className="mt-2 max-w-lg text-body leading-relaxed text-content-muted">
              Voya will review the itinerary, reservations, hotels and transport already saved in this trip and turn concrete follow-ups into a short checklist.
            </p>
            <p className="mt-3 max-w-lg text-caption leading-relaxed text-content-faint">
              It will not invent visa rules, opening hours, live availability, prices or travel policies.
            </p>
            <button
              type="button"
              disabled={refreshing}
              onClick={() => { void refresh() }}
              className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#377CF6] px-5 py-2.5 text-body font-semibold text-white shadow-[0_10px_24px_rgba(55,124,246,.24)] hover:bg-[#286CE4] disabled:opacity-60"
            >
              {refreshing ? <RefreshCw size={15} className="animate-spin" /> : <Sparkles size={15} />}
              {refreshing ? 'Building checklist…' : 'Build readiness'}
            </button>
          </div>
        ) : (
          <div>
            <div className="grid gap-3 sm:grid-cols-[150px_1fr]">
              <div className="flex min-h-[142px] flex-col items-center justify-center rounded-[24px] border border-[#BBD5F7]/35 bg-[linear-gradient(145deg,rgba(239,247,255,.92),rgba(255,255,255,.74))] text-center dark:border-white/8 dark:bg-white/4">
                <div className="voya-editorial text-[42px] font-medium leading-none tracking-[-.06em] text-[#377CF6]">{data?.score ?? 0}%</div>
                <div className="mt-1 text-[11px] font-semibold uppercase tracking-[.12em] text-content-faint">ready</div>
                <div className="mt-2 text-[10px] text-content-muted">
                  {actionable.length === 0 ? 'No open tasks' : `${actionable.length} open`}
                </div>
              </div>

              <div className="rounded-[24px] border border-edge-faint bg-surface-tertiary p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[.12em] text-content-faint">
                      Readiness snapshot
                    </div>
                    <p className="mt-1.5 text-body leading-relaxed text-content-muted">
                      High-priority blockers count more heavily than convenience items. Mark tasks done as you handle them.
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={refreshing}
                    onClick={() => { void refresh() }}
                    className="inline-flex flex-none items-center gap-1.5 rounded-full border border-edge bg-surface-card px-3 py-1.5 text-caption font-medium text-content-secondary hover:bg-surface-hover disabled:opacity-50"
                  >
                    <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />
                    Refresh
                  </button>
                </div>
                {data?.stale && (
                  <div className="mt-3 rounded-2xl border border-[#F59E0B]/20 bg-[#F59E0B]/8 px-3 py-2 text-caption leading-relaxed text-[#A16207] dark:text-[#FBBF24]">
                    Your itinerary changed after this checklist was created. Refresh it before relying on the score.
                  </div>
                )}
              </div>
            </div>

            {data?.items.length === 0 ? (
              <div className="mt-5 rounded-[22px] border border-edge-faint bg-surface-card px-5 py-8 text-center">
                <CheckCircle2 size={24} className="mx-auto text-[#377CF6]" />
                <h4 className="mt-3 font-semibold text-content">Nothing concrete to chase right now</h4>
                <p className="mt-1 text-caption text-content-muted">Voya did not find any supported pre-trip tasks in the current plan.</p>
              </div>
            ) : (
              <div className="mt-5 space-y-2.5">
                {data?.items.map(item => (
                  <ReadinessRow
                    key={item.id}
                    item={item}
                    busy={updatingId === item.id}
                    onStatus={status => { void setStatus(item, status) }}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="mt-4 rounded-2xl border border-danger/20 bg-danger-soft px-4 py-3 text-caption text-danger">
            {error}
          </div>
        )}
      </Modal>
    </>
  )
}

function ReadinessRow({
  item,
  busy,
  onStatus,
}: {
  item: VoyaReadinessItem
  busy: boolean
  onStatus: (status: VoyaReadinessStatus) => void
}) {
  const resolved = item.status !== 'To do'
  const priorityClass =
    item.priority === 'High'
      ? 'bg-[#EF4444]/10 text-[#DC2626]'
      : item.priority === 'Medium'
        ? 'bg-[#F59E0B]/10 text-[#A16207] dark:text-[#FBBF24]'
        : 'bg-[#377CF6]/8 text-[#377CF6]'

  return (
    <div className={`rounded-[20px] border px-4 py-3.5 transition-opacity ${
      resolved ? 'border-edge-faint bg-surface-tertiary opacity-70' : 'border-edge bg-surface-card'
    }`}>
      <div className="flex items-start gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={() => onStatus(item.status === 'Done' ? 'To do' : 'Done')}
          className={`mt-0.5 flex h-7 w-7 flex-none items-center justify-center rounded-full border transition-all disabled:opacity-50 ${
            item.status === 'Done'
              ? 'border-[#377CF6] bg-[#377CF6] text-white'
              : 'border-edge bg-surface-card text-content-faint hover:border-[#377CF6]/50'
          }`}
          aria-label={item.status === 'Done' ? 'Mark to do' : 'Mark done'}
        >
          {item.status === 'Done' ? <Check size={13} strokeWidth={3} /> : <Circle size={11} strokeWidth={2} />}
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`font-semibold text-content ${resolved ? 'line-through' : ''}`}>{item.title}</span>
            <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-[.09em] ${priorityClass}`}>{item.priority}</span>
            <span className="rounded-full bg-surface-hover px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[.08em] text-content-faint">{item.kind}</span>
          </div>
          <p className="mt-1 text-caption leading-relaxed text-content-muted">{item.reason}</p>
          {item.actionLabel && <p className="mt-1 text-[10px] font-medium text-content-faint">{item.actionLabel}</p>}
        </div>

        <button
          type="button"
          disabled={busy}
          onClick={() => onStatus(item.status === 'Not needed' ? 'To do' : 'Not needed')}
          className="flex-none rounded-full px-2.5 py-1 text-[10px] font-medium text-content-faint hover:bg-surface-hover hover:text-content-muted disabled:opacity-50"
        >
          {item.status === 'Not needed' ? 'Restore' : 'Not needed'}
        </button>
      </div>
    </div>
  )
}
