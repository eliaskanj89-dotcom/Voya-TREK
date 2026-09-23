import { useEffect, useMemo, useState } from 'react'
import { Check, CheckCircle2, Circle, RefreshCw, ShieldCheck, Sparkles } from 'lucide-react'
import type { VoyaReadinessItem, VoyaReadinessResult, VoyaReadinessStatus } from '@trek/shared'
import MSheet from '../../../components/MSheet'
import { TileHeader, INNER_CLS } from './MTripSheetUi'
import type { MTripSheetsProps } from '../MTripShell'
import { voyaAiApi } from '../../../../api/client'

export default function MVoyaReadinessSheet({ planner, shell }: MTripSheetsProps) {
  const open = shell.sheet?.id === 'readiness'
  const [data, setData] = useState<VoyaReadinessResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [updatingId, setUpdatingId] = useState<number | null>(null)
  const [error, setError] = useState('')

  const load = async () => {
    if (!open) return
    setLoading(true)
    try {
      setData(await voyaAiApi.readiness({ tripId: planner.tripId }))
      setError('')
    } catch {
      setError('Voya could not load trip readiness.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [open, planner.tripId])

  const refresh = async () => {
    setRefreshing(true)
    setError('')
    try {
      setData(await voyaAiApi.refreshReadiness({ tripId: planner.tripId }))
      window.dispatchEvent(new CustomEvent('voya:readiness-updated', { detail: { tripId: planner.tripId } }))
    } catch {
      setError('Voya could not refresh this checklist.')
    } finally {
      setRefreshing(false)
    }
  }

  const setStatus = async (item: VoyaReadinessItem, status: VoyaReadinessStatus) => {
    if (updatingId != null) return
    setUpdatingId(item.id)
    setError('')
    try {
      setData(await voyaAiApi.updateReadinessStatus({
        tripId: planner.tripId,
        itemId: item.id,
        status,
      }))
      window.dispatchEvent(new CustomEvent('voya:readiness-updated', { detail: { tripId: planner.tripId } }))
    } catch {
      setError('Voya could not update this item.')
    } finally {
      setUpdatingId(null)
    }
  }

  const generated = data?.fingerprint != null
  const openItems = useMemo(() => data?.items.filter(item => item.status === 'To do') ?? [], [data])

  return (
    <MSheet
      open={open}
      onClose={shell.closeSheet}
      variant="bottom"
      material="glass"
      ariaLabel="Before You Go"
      className="max-h-[78dvh]"
    >
      <div className="flex min-h-0 flex-col">
        <div className="px-4 pb-3 pt-4">
          <TileHeader
            icon={<ShieldCheck size={18} strokeWidth={2.2} className="text-m-act" />}
            title="Before You Go"
            sub="Readiness from the facts already saved in this trip."
            subWrap
            onClose={shell.closeSheet}
            closeLabel="Close"
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-5">
          {loading && !data ? (
            <div className="flex min-h-[260px] flex-col items-center justify-center">
              <RefreshCw size={20} className="animate-spin text-m-act" />
              <p className="mt-3 font-geist text-[0.75rem] text-m-muted">Loading readiness…</p>
            </div>
          ) : !generated ? (
            <div className="flex min-h-[320px] flex-col items-center justify-center px-5 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-m-act text-m-actfg">
                <Sparkles size={21} strokeWidth={2.2} />
              </div>
              <h3 className="mt-4 text-[1.15rem] font-bold text-m-ink">Make the trip feel ready</h3>
              <p className="mt-2 font-geist text-[0.75rem] leading-relaxed text-m-muted">
                Voya reviews the itinerary, reservations, hotels and transport already saved in this trip and turns supported follow-ups into a short checklist.
              </p>
              <p className="mt-2 font-geist text-[0.65625rem] leading-relaxed text-m-faint">
                No invented visa rules, opening hours, live availability or prices.
              </p>
              <button
                type="button"
                disabled={refreshing}
                onClick={() => { void refresh() }}
                className="mt-5 flex items-center gap-2 rounded-full bg-m-act px-4 py-2.5 text-[0.75rem] font-semibold text-m-actfg disabled:opacity-60"
              >
                {refreshing ? <RefreshCw size={14} className="animate-spin" /> : <Sparkles size={14} />}
                {refreshing ? 'Building…' : 'Build readiness'}
              </button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-[110px_1fr] gap-3">
                <div className={`flex min-h-[116px] flex-col items-center justify-center rounded-[20px] ${INNER_CLS}`}>
                  <div className="text-[1.9rem] font-bold leading-none tracking-[-.04em] text-m-act">{data?.score ?? 0}%</div>
                  <div className="mt-1 font-geist text-[0.5625rem] font-bold uppercase tracking-[.1em] text-m-faint">ready</div>
                  <div className="mt-2 font-geist text-[0.59375rem] text-m-muted">
                    {openItems.length === 0 ? 'No open tasks' : `${openItems.length} open`}
                  </div>
                </div>

                <div className={`rounded-[20px] p-3.5 ${INNER_CLS}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-geist text-[0.59375rem] font-bold uppercase tracking-[.09em] text-m-faint">Readiness snapshot</div>
                      <p className="mt-1 font-geist text-[0.6875rem] leading-relaxed text-m-muted">
                        High-priority blockers count more heavily than convenience items.
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={refreshing}
                      onClick={() => { void refresh() }}
                      className="flex h-8 w-8 flex-none items-center justify-center rounded-full border border-[color:var(--m-gbr)] bg-[color:var(--m-ic)] text-m-muted disabled:opacity-50"
                      aria-label="Refresh readiness"
                    >
                      <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
                    </button>
                  </div>
                  {data?.stale && (
                    <div className="mt-2 rounded-[12px] bg-[rgba(245,158,11,.10)] px-2.5 py-2 font-geist text-[0.625rem] leading-relaxed text-[#B7791F]">
                      Your trip changed after this checklist was built. Refresh before relying on the score.
                    </div>
                  )}
                </div>
              </div>

              {data?.items.length === 0 ? (
                <div className={`mt-3 rounded-[20px] px-4 py-7 text-center ${INNER_CLS}`}>
                  <CheckCircle2 size={22} className="mx-auto text-m-act" />
                  <div className="mt-2 text-[0.8125rem] font-semibold text-m-ink">Nothing concrete to chase right now</div>
                  <div className="mt-1 font-geist text-[0.65625rem] text-m-muted">Voya did not find any supported pre-trip tasks.</div>
                </div>
              ) : (
                <div className="mt-3 space-y-2">
                  {data?.items.map(item => (
                    <MobileReadinessRow
                      key={item.id}
                      item={item}
                      busy={updatingId === item.id}
                      onStatus={status => { void setStatus(item, status) }}
                    />
                  ))}
                </div>
              )}
            </>
          )}

          {error && (
            <div className="mt-3 rounded-[14px] bg-[rgba(239,68,68,.10)] px-3 py-2.5 font-geist text-[0.6875rem] text-[color:var(--m-st-danger)]">
              {error}
            </div>
          )}
        </div>
      </div>
    </MSheet>
  )
}

function MobileReadinessRow({
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
      ? 'bg-[rgba(239,68,68,.10)] text-[color:var(--m-st-danger)]'
      : item.priority === 'Medium'
        ? 'bg-[rgba(245,158,11,.10)] text-[#B7791F]'
        : 'bg-[rgba(55,124,246,.10)] text-m-act'

  return (
    <div className={`rounded-[18px] p-3 ${INNER_CLS} ${resolved ? 'opacity-65' : ''}`}>
      <div className="flex items-start gap-2.5">
        <button
          type="button"
          disabled={busy}
          onClick={() => onStatus(item.status === 'Done' ? 'To do' : 'Done')}
          className={`mt-px flex h-7 w-7 flex-none items-center justify-center rounded-full border disabled:opacity-50 ${
            item.status === 'Done'
              ? 'border-transparent bg-m-act text-m-actfg'
              : 'border-[color:var(--m-gbr)] bg-[color:var(--m-ic)] text-m-faint'
          }`}
          aria-label={item.status === 'Done' ? 'Mark to do' : 'Mark done'}
        >
          {item.status === 'Done' ? <Check size={12} strokeWidth={3} /> : <Circle size={10} strokeWidth={2} />}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={`text-[0.75rem] font-semibold text-m-ink ${resolved ? 'line-through' : ''}`}>{item.title}</span>
            <span className={`rounded-full px-2 py-0.5 font-geist text-[0.5rem] font-bold uppercase tracking-[.08em] ${priorityClass}`}>{item.priority}</span>
            <span className="rounded-full bg-[color:var(--m-ic)] px-2 py-0.5 font-geist text-[0.5rem] font-semibold uppercase tracking-[.07em] text-m-faint">{item.kind}</span>
          </div>
          <p className="mt-1 font-geist text-[0.65625rem] leading-relaxed text-m-muted">{item.reason}</p>
          {item.actionLabel && <p className="mt-1 font-geist text-[0.5625rem] font-medium text-m-faint">{item.actionLabel}</p>}
          <button
            type="button"
            disabled={busy}
            onClick={() => onStatus(item.status === 'Not needed' ? 'To do' : 'Not needed')}
            className="mt-1.5 font-geist text-[0.5625rem] font-semibold text-m-faint disabled:opacity-50"
          >
            {item.status === 'Not needed' ? 'Restore' : 'Not needed'}
          </button>
        </div>
      </div>
    </div>
  )
}
