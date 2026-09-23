import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Sparkles,
  MapPin,
  RefreshCw,
  Route,
  ShieldCheck,
  Ticket,
  Clock,
} from 'lucide-react'
import type { VoyaTripHealthIssue, VoyaTripHealthResult } from '@trek/shared'
import Modal from '../shared/Modal'
import { voyaAiApi } from '../../api/client'
import { getApiErrorMessage } from '../../types'

interface VoyaTripHealthPanelProps {
  tripId: number
  mobile?: boolean
}

export default function VoyaTripHealthPanel({ tripId, mobile = false }: VoyaTripHealthPanelProps) {
  const [open, setOpen] = useState(false)
  const [data, setData] = useState<VoyaTripHealthResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [repairingId, setRepairingId] = useState<string | null>(null)
  const [error, setError] = useState('')

  const load = async (silent = false) => {
    if (!silent) setLoading(true)
    else setRefreshing(true)
    try {
      const result = await voyaAiApi.tripHealth({ tripId })
      setData(result)
      setError('')
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, 'Voya could not audit this trip.'))
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    void load()
  }, [tripId])

  const repairIssue = async (issue: VoyaTripHealthIssue) => {
    if (repairingId) return
    setRepairingId(issue.id)
    setError('')
    try {
      if (issue.category === 'Verification') {
        await voyaAiApi.verifyTrip({ tripId })
        window.dispatchEvent(new CustomEvent('voya:places-verified', { detail: { tripId } }))
        await load(true)
        return
      }

      if ((issue.category === 'Schedule' || issue.category === 'Route') && issue.dayId) {
        const instruction =
          issue.category === 'Route'
            ? 'Optimize this day to reduce unnecessary backtracking while preserving timed, booked and important stops.'
            : issue.id.startsWith('overloaded-day-')
              ? 'Make this day realistically paced. Keep the most important stops, reduce overload, preserve booked or timed items, and leave normal travel and meal buffers.'
              : 'Fix the timing conflicts in this day while preserving booked or timed commitments and keeping the day realistic.'
        window.dispatchEvent(new CustomEvent('voya:trip-health-repair', {
          detail: { tripId, dayId: issue.dayId, category: issue.category, instruction },
        }))
        setOpen(false)
        return
      }

      if (issue.category === 'Readiness') {
        window.dispatchEvent(new CustomEvent('voya:open-readiness', { detail: { tripId } }))
        setOpen(false)
        return
      }

      if (issue.category === 'Reservation') {
        window.dispatchEvent(new CustomEvent('voya:open-reservations', { detail: { tripId, dayId: issue.dayId ?? null } }))
        setOpen(false)
      }
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, 'Voya could not repair this issue right now.'))
    } finally {
      setRepairingId(null)
    }
  }

  const highIssues = useMemo(
    () => data?.issues.filter(issue => issue.severity === 'High').length ?? 0,
    [data],
  )

  const scoreTone =
    (data?.score ?? 100) >= 90
      ? 'text-[#198754]'
      : (data?.score ?? 100) >= 75
        ? 'text-[#377CF6]'
        : (data?.score ?? 100) >= 55
          ? 'text-[#A16207] dark:text-[#FBBF24]'
          : 'text-[#DC2626]'

  const trigger = mobile ? (
    <button
      type="button"
      onClick={() => { setOpen(true); void load(true) }}
      aria-label="Open Voya Trip Health"
      className="relative flex h-10 w-10 flex-none items-center justify-center rounded-full border border-[color:var(--m-gbr)] bg-[color:var(--m-glass)] text-m-muted backdrop-blur-[24px] backdrop-saturate-[1.7]"
    >
      <Sparkles size={17} strokeWidth={2.1} />
      {highIssues > 0 && (
        <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#EF4444] px-1 text-[8px] font-bold text-white">
          {highIssues}
        </span>
      )}
    </button>
  ) : (
    <button
      type="button"
      onClick={() => { setOpen(true); void load(true) }}
      className="voya-health-pill absolute right-4 top-[76px] z-[80] flex items-center gap-2 rounded-full border border-[#B9D3F7]/45 bg-[rgba(248,252,255,.88)] px-3 py-2 text-left shadow-[0_12px_30px_rgba(31,67,112,.12)] backdrop-blur-[22px] transition-all hover:-translate-y-px hover:border-[#377CF6]/30 hover:shadow-[0_16px_38px_rgba(31,67,112,.16)] dark:border-white/10 dark:bg-[rgba(10,25,44,.78)]"
      aria-label="Open Voya Trip Health"
    >
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#377CF6] text-white shadow-[0_7px_16px_rgba(55,124,246,.24)]">
        <Sparkles size={13} strokeWidth={2.4} />
      </span>
      <span>
        <span className="block text-[10px] font-semibold uppercase tracking-[.12em] text-content-faint">Trip Health</span>
        <span className="block text-[12px] font-semibold text-content">
          {loading && !data ? 'Auditing…' : data ? `${data.score}% · ${data.label}` : 'Check trip'}
        </span>
      </span>
      {highIssues > 0 && (
        <span className="ml-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#EF4444]/10 px-1.5 text-[10px] font-bold text-[#DC2626]">
          {highIssues}
        </span>
      )}
    </button>
  )

  return (
    <>
      {trigger}

      <Modal
        isOpen={open}
        onClose={() => setOpen(false)}
        size="2xl"
        title={
          <span className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#377CF6] text-white shadow-[0_8px_20px_rgba(55,124,246,.24)]">
              <Sparkles size={16} strokeWidth={2.3} />
            </span>
            <span>
              <span className="voya-editorial block text-[24px] font-medium tracking-[-.04em]">Trip Health</span>
              <span className="block text-[11px] font-normal text-content-faint">A deterministic audit of the facts already stored in this trip.</span>
            </span>
          </span>
        }
      >
        {loading && !data ? (
          <div className="flex min-h-[280px] flex-col items-center justify-center text-center">
            <span className="h-7 w-7 animate-spin rounded-full border-2 border-[#377CF6]/20 border-t-[#377CF6]" />
            <p className="mt-3 text-caption text-content-muted">Auditing the itinerary…</p>
          </div>
        ) : data ? (
          <div>
            <div className="grid gap-3 sm:grid-cols-[170px_1fr]">
              <div className="flex min-h-[154px] flex-col items-center justify-center rounded-[24px] border border-[#BBD5F7]/35 bg-[linear-gradient(145deg,rgba(239,247,255,.92),rgba(255,255,255,.74))] text-center dark:border-white/8 dark:bg-white/4">
                <div className={`voya-editorial text-[48px] font-medium leading-none tracking-[-.06em] ${scoreTone}`}>{data.score}%</div>
                <div className="mt-1 text-[11px] font-semibold uppercase tracking-[.12em] text-content-faint">{data.label}</div>
                <div className="mt-2 text-[10px] text-content-muted">{data.issues.length} issue{data.issues.length === 1 ? '' : 's'} found</div>
              </div>

              <div className="rounded-[24px] border border-edge-faint bg-surface-tertiary p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[.12em] text-content-faint">Explainable score</div>
                    <p className="mt-1.5 text-body leading-relaxed text-content-muted">
                      Voya only deducts points for concrete problems it can derive from stored itinerary, map-provider, reservation and readiness data.
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={refreshing}
                    onClick={() => { void load(true) }}
                    className="inline-flex flex-none items-center gap-1.5 rounded-full border border-edge bg-surface-card px-3 py-1.5 text-caption font-medium text-content-secondary hover:bg-surface-hover disabled:opacity-50"
                  >
                    <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />
                    Refresh
                  </button>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
                  <Breakdown label="Verified" value={data.breakdown.verification} icon={MapPin} />
                  <Breakdown label="Timing" value={data.breakdown.schedule} icon={Clock} />
                  <Breakdown label="Route" value={data.breakdown.route} icon={Route} />
                  <Breakdown label="Ready" value={data.breakdown.readiness} icon={ShieldCheck} />
                  <Breakdown label="Bookings" value={data.breakdown.reservation} icon={Ticket} />
                </div>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Metric label="Verified stops" value={`${data.metrics.verifiedStops}/${data.metrics.assignedStops}`} />
              <Metric label="Unresolved suggestions" value={data.metrics.unresolvedSuggestions} />
              <Metric label="Route issues" value={data.metrics.inefficientRouteDays} />
              <Metric label="High readiness" value={data.metrics.openHighReadiness} />
            </div>

            {data.issues.length === 0 ? (
              <div className="mt-5 rounded-[22px] border border-edge-faint bg-surface-card px-5 py-9 text-center">
                <CheckCircle2 size={26} className="mx-auto text-[#198754]" />
                <h4 className="mt-3 font-semibold text-content">No supported problems found</h4>
                <p className="mt-1 text-caption text-content-muted">The current deterministic checks did not find a route, timing, verification, readiness or reservation issue.</p>
              </div>
            ) : (
              <div className="mt-5 space-y-2.5">
                {data.issues.map(issue => (
                  <HealthIssueRow
                    key={issue.id}
                    issue={issue}
                    busy={repairingId === issue.id}
                    onRepair={() => { void repairIssue(issue) }}
                  />
                ))}
              </div>
            )}

            <p className="mt-4 text-[10px] leading-relaxed text-content-faint">
              Checked {new Date(data.checkedAt).toLocaleString()}. Trip Health does not infer visa status, current opening hours, live availability, safety conditions or undocumented travel facts.
            </p>
          </div>
        ) : (
          <div className="flex min-h-[260px] flex-col items-center justify-center text-center">
            <AlertTriangle size={24} className="text-[#A16207] dark:text-[#FBBF24]" />
            <p className="mt-3 text-body text-content-muted">Trip Health is unavailable right now.</p>
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

function Breakdown({
  label,
  value,
  icon: Icon,
}: {
  label: string
  value: number
  icon: typeof Sparkles
}) {
  const tone = value >= 85 ? 'text-[#198754]' : value >= 65 ? 'text-[#377CF6]' : value >= 45 ? 'text-[#A16207] dark:text-[#FBBF24]' : 'text-[#DC2626]'
  return (
    <div className="rounded-2xl border border-edge-faint bg-surface-card px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[10px] font-medium text-content-faint">
        <Icon size={11} />
        {label}
      </div>
      <div className={`mt-1 text-[18px] font-semibold ${tone}`}>{value}</div>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-[18px] border border-edge-faint bg-surface-card px-3.5 py-3">
      <div className="text-[10px] font-semibold uppercase tracking-[.09em] text-content-faint">{label}</div>
      <div className="mt-1 text-[18px] font-semibold text-content">{value}</div>
    </div>
  )
}

function HealthIssueRow({
  issue,
  busy,
  onRepair,
}: {
  issue: VoyaTripHealthIssue
  busy: boolean
  onRepair: () => void
}) {
  const severityClass =
    issue.severity === 'High'
      ? 'bg-[#EF4444]/10 text-[#DC2626]'
      : issue.severity === 'Medium'
        ? 'bg-[#F59E0B]/10 text-[#A16207] dark:text-[#FBBF24]'
        : 'bg-[#377CF6]/8 text-[#377CF6]'

  return (
    <div className="rounded-[20px] border border-edge bg-surface-card px-4 py-3.5">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-content">{issue.title}</span>
            <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-[.09em] ${severityClass}`}>{issue.severity}</span>
            <span className="rounded-full bg-surface-hover px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[.08em] text-content-faint">{issue.category}</span>
            <span className="text-[9px] font-semibold text-content-faint">−{issue.deduction}</span>
          </div>
          <p className="mt-1 text-caption leading-relaxed text-content-muted">{issue.reason}</p>
          {issue.actionLabel && (
            <button
              type="button"
              onClick={onRepair}
              disabled={busy}
              className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-[#377CF6]/15 bg-[#377CF6]/6 px-2.5 py-1 text-[10px] font-semibold text-[#377CF6] hover:bg-[#377CF6]/10 disabled:opacity-60"
            >
              {busy && <RefreshCw size={10} className="animate-spin" />}
              {busy ? 'Working…' : issue.actionLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
