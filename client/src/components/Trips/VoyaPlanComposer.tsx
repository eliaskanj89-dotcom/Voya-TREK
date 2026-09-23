import { useMemo, useState } from 'react'
import { ArrowRight, Check, MapPin, Sparkles } from 'lucide-react'
import type { Trip, VoyaPlanDraftRequest, VoyaPlanDraftResponse } from '@trek/shared'
import { tripSpanDays } from '@trek/shared'
import { voyaAiApi } from '../../api/client'
import { getApiErrorMessage } from '../../types'

interface VoyaPlanComposerProps {
  initialDestination: string
  startDate: string
  endDate: string
  dayCount: number | ''
  currency: string
  travelers: number
  reminderDays: number
  onCreated: (trip: Trip) => Promise<void> | void
}

export default function VoyaPlanComposer({
  initialDestination,
  startDate,
  endDate,
  dayCount,
  currency,
  travelers,
  reminderDays,
  onCreated,
}: VoyaPlanComposerProps) {
  const [expanded, setExpanded] = useState(false)
  const [destination, setDestination] = useState(initialDestination)
  const [pace, setPace] = useState<VoyaPlanDraftRequest['pace']>('balanced')
  const [budgetStyle, setBudgetStyle] = useState<VoyaPlanDraftRequest['budgetStyle']>('moderate')
  const [interests, setInterests] = useState('')
  const [notes, setNotes] = useState('')
  const [draft, setDraft] = useState<VoyaPlanDraftResponse | null>(null)
  const [request, setRequest] = useState<VoyaPlanDraftRequest | null>(null)
  const [generating, setGenerating] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  const days = useMemo(() => {
    if (startDate && endDate) return tripSpanDays(startDate, endDate)
    return typeof dayCount === 'number' && dayCount > 0 ? dayCount : 7
  }, [startDate, endDate, dayCount])

  const buildRequest = (): VoyaPlanDraftRequest | null => {
    const resolvedDestination = (destination || initialDestination).trim()
    if (!resolvedDestination) {
      setError('Add a destination before asking Voya to plan the trip.')
      return null
    }
    const interestList = interests
      .split(',')
      .map(value => value.trim())
      .filter(Boolean)
      .slice(0, 12)

    return {
      destination: resolvedDestination,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      days,
      travelers: Math.max(1, travelers),
      currency: currency || 'USD',
      pace,
      budgetStyle,
      interests: interestList,
      notes: notes.trim() || undefined,
    }
  }

  const generate = async () => {
    const payload = buildRequest()
    if (!payload) return
    setGenerating(true)
    setError('')
    setDraft(null)
    try {
      const result = await voyaAiApi.planDraft(payload)
      setRequest(payload)
      setDraft(result.draft)
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, 'Voya could not generate this trip right now.'))
    } finally {
      setGenerating(false)
    }
  }

  const createTrip = async () => {
    if (!draft || !request) return
    setCreating(true)
    setError('')
    try {
      const result = await voyaAiApi.materializeDraft({
        request,
        draft,
        reminderDays,
      })
      await onCreated(result.trip)
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, 'Voya could not create this trip.'))
    } finally {
      setCreating(false)
    }
  }

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => {
          setDestination(initialDestination)
          setExpanded(true)
        }}
        className="voya-ai-entry group flex w-full items-center justify-between gap-4 rounded-[22px] border border-[#BFD7FF]/70 bg-[linear-gradient(135deg,rgba(236,246,255,.92),rgba(255,255,255,.88))] px-5 py-4 text-left shadow-[0_14px_36px_rgba(55,124,246,.10)] transition-all hover:-translate-y-0.5 hover:shadow-[0_20px_44px_rgba(55,124,246,.15)] dark:border-white/10 dark:bg-[linear-gradient(135deg,rgba(25,53,88,.78),rgba(11,27,47,.92))]"
      >
        <span className="flex min-w-0 items-center gap-3.5">
          <span className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-[#377CF6] text-white shadow-[0_10px_24px_rgba(55,124,246,.28)]">
            <Sparkles size={19} strokeWidth={2.3} />
          </span>
          <span className="min-w-0">
            <span className="voya-editorial block text-[20px] font-medium tracking-[-.035em] text-content">Plan with Voya</span>
            <span className="mt-0.5 block text-caption text-content-muted">Generate a complete day-by-day trip, review it, then create it.</span>
          </span>
        </span>
        <ArrowRight size={18} className="flex-none text-[#377CF6] transition-transform group-hover:translate-x-1" />
      </button>
    )
  }

  return (
    <section className="voya-ai-composer overflow-hidden rounded-[26px] border border-[#C8DFFF]/70 bg-[linear-gradient(145deg,rgba(247,251,255,.96),rgba(233,244,255,.82))] shadow-[0_22px_58px_rgba(31,67,112,.12)] dark:border-white/10 dark:bg-[linear-gradient(145deg,rgba(15,34,58,.94),rgba(8,22,39,.90))]">
      <div className="flex items-start justify-between gap-4 border-b border-[#94B8E8]/15 px-5 py-5 dark:border-white/8">
        <div className="flex min-w-0 items-start gap-3.5">
          <span className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-[#377CF6] text-white shadow-[0_10px_24px_rgba(55,124,246,.28)]">
            <Sparkles size={19} strokeWidth={2.2} />
          </span>
          <div>
            <h3 className="voya-editorial text-[23px] font-medium tracking-[-.04em] text-content">Design the trip with Voya</h3>
            <p className="mt-1 max-w-2xl text-caption leading-relaxed text-content-muted">
              Voya creates suggestions only. Prices, opening hours, availability and venue details stay unverified until checked.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => { setExpanded(false); setDraft(null); setError('') }}
          className="rounded-full px-3 py-1.5 text-caption font-medium text-content-muted hover:bg-surface-hover"
        >
          Manual
        </button>
      </div>

      {!draft ? (
        <div className="space-y-4 p-5">
          <div>
            <label className="mb-2 block text-caption font-semibold uppercase tracking-[.14em] text-content-faint">Destination</label>
            <div className="relative">
              <MapPin size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#377CF6]" />
              <input
                value={destination}
                onChange={event => setDestination(event.target.value)}
                placeholder="Tokyo, Japan"
                className="w-full rounded-2xl border border-edge bg-white/75 py-3 pl-10 pr-4 text-body text-content outline-none placeholder:text-content-faint focus:border-[#377CF6] focus:ring-4 focus:ring-[#377CF6]/10 dark:bg-white/5"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Choice
              label="Pace"
              value={pace}
              options={[
                ['relaxed', 'Relaxed'],
                ['balanced', 'Balanced'],
                ['packed', 'Full days'],
              ]}
              onChange={value => setPace(value as VoyaPlanDraftRequest['pace'])}
            />
            <Choice
              label="Style"
              value={budgetStyle}
              options={[
                ['budget', 'Budget'],
                ['moderate', 'Moderate'],
                ['premium', 'Premium'],
                ['luxury', 'Luxury'],
              ]}
              onChange={value => setBudgetStyle(value as VoyaPlanDraftRequest['budgetStyle'])}
            />
          </div>

          <div>
            <label className="mb-2 block text-caption font-semibold uppercase tracking-[.14em] text-content-faint">What are you into?</label>
            <input
              value={interests}
              onChange={event => setInterests(event.target.value)}
              placeholder="food, architecture, local neighborhoods, nightlife"
              className="w-full rounded-2xl border border-edge bg-white/75 px-4 py-3 text-body text-content outline-none placeholder:text-content-faint focus:border-[#377CF6] focus:ring-4 focus:ring-[#377CF6]/10 dark:bg-white/5"
            />
            <p className="mt-1.5 text-caption text-content-faint">Separate interests with commas.</p>
          </div>

          <div>
            <label className="mb-2 block text-caption font-semibold uppercase tracking-[.14em] text-content-faint">Anything Voya should know?</label>
            <textarea
              value={notes}
              onChange={event => setNotes(event.target.value)}
              rows={3}
              placeholder="I want one late night, I hate rushing museums, keep walking manageable…"
              className="w-full resize-none rounded-2xl border border-edge bg-white/75 px-4 py-3 text-body text-content outline-none placeholder:text-content-faint focus:border-[#377CF6] focus:ring-4 focus:ring-[#377CF6]/10 dark:bg-white/5"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white/55 px-4 py-3 dark:bg-white/4">
            <div className="text-caption text-content-muted">
              <span className="font-semibold text-content">{days} days</span>
              <span className="mx-2 text-content-faint">·</span>
              {Math.max(1, travelers)} traveler{Math.max(1, travelers) === 1 ? '' : 's'}
              <span className="mx-2 text-content-faint">·</span>
              {currency}
            </div>
            <button
              type="button"
              onClick={generate}
              disabled={generating}
              className="inline-flex items-center gap-2 rounded-full bg-[#377CF6] px-5 py-2.5 text-body font-semibold text-white shadow-[0_10px_24px_rgba(55,124,246,.24)] transition-all hover:bg-[#286CE4] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {generating ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/35 border-t-white" />
                  Designing…
                </>
              ) : (
                <>
                  <Sparkles size={15} />
                  Generate trip
                </>
              )}
            </button>
          </div>
        </div>
      ) : (
        <div className="p-5">
          <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-2xl">
              <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-[#377CF6]/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[.12em] text-[#377CF6]">
                <Check size={12} /> Draft ready
              </div>
              <h3 className="voya-editorial text-[31px] font-medium leading-[1.02] tracking-[-.045em] text-content">{draft.title}</h3>
              <p className="mt-2 text-body leading-relaxed text-content-muted">{draft.summary}</p>
            </div>
            <button type="button" onClick={() => setDraft(null)} className="rounded-full border border-edge px-3.5 py-2 text-caption font-medium text-content-secondary hover:bg-surface-hover">
              Adjust
            </button>
          </div>

          <div className="max-h-[390px] space-y-2.5 overflow-y-auto pr-1">
            {draft.days.map(day => (
              <details key={day.dayNumber} className="group overflow-hidden rounded-[18px] border border-[#9CBDE6]/15 bg-white/62 open:bg-white/88 dark:bg-white/4 dark:open:bg-white/6">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5">
                  <div className="min-w-0">
                    <div className="text-[11px] font-semibold uppercase tracking-[.14em] text-[#377CF6]">Day {day.dayNumber}{day.date ? ` · ${day.date}` : ''}</div>
                    <div className="voya-editorial mt-0.5 truncate text-[19px] font-medium tracking-[-.03em] text-content">{day.title}</div>
                  </div>
                  <span className="flex-none rounded-full bg-[#377CF6]/8 px-2.5 py-1 text-[11px] font-medium text-content-muted">{day.activities.length} stops</span>
                </summary>
                <div className="border-t border-[#9CBDE6]/12 px-4 pb-4 pt-3 dark:border-white/7">
                  <p className="mb-3 text-caption leading-relaxed text-content-muted">{day.objective}</p>
                  <div className="space-y-2">
                    {day.activities.map((activity, index) => (
                      <div key={`${day.dayNumber}-${activity.name}-${index}`} className="flex gap-3 rounded-2xl bg-[#F5F9FF]/90 px-3.5 py-3 dark:bg-white/4">
                        <div className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-[#377CF6] text-[11px] font-bold text-white">{index + 1}</div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="font-semibold text-content">{activity.name}</span>
                            {activity.startTime && <span className="text-[11px] font-medium text-[#377CF6]">{activity.startTime}</span>}
                          </div>
                          <div className="mt-0.5 text-caption text-content-muted">{activity.description}</div>
                          <div className="mt-1.5 flex flex-wrap gap-1.5 text-[10px] font-medium text-content-faint">
                            <span>{activity.durationMin} min</span>
                            <span>·</span>
                            <span>{activity.category}</span>
                            <span>·</span>
                            <span>{activity.priceKnown ? activity.priceLabel || 'Price supplied' : activity.priceLabel || 'Price unverified'}</span>
                            <span>·</span>
                            <span>Suggested</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </details>
            ))}
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[#9CBDE6]/14 pt-4 dark:border-white/8">
            <p className="max-w-lg text-caption leading-relaxed text-content-faint">
              Creating the trip stores these as Voya suggestions. TREK can enrich locations, routes and current details afterward.
            </p>
            <button
              type="button"
              onClick={createTrip}
              disabled={creating}
              className="inline-flex items-center gap-2 rounded-full bg-[#377CF6] px-5 py-2.5 text-body font-semibold text-white shadow-[0_10px_26px_rgba(55,124,246,.26)] transition-all hover:bg-[#286CE4] disabled:opacity-60"
            >
              {creating ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/35 border-t-white" />
                  Creating…
                </>
              ) : (
                <>
                  Create this trip
                  <ArrowRight size={15} />
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {error && <div className="mx-5 mb-5 rounded-2xl border border-danger/20 bg-danger-soft px-4 py-3 text-caption text-danger">{error}</div>}
    </section>
  )
}

function Choice({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: [string, string][]
  onChange: (value: string) => void
}) {
  return (
    <div>
      <label className="mb-2 block text-caption font-semibold uppercase tracking-[.14em] text-content-faint">{label}</label>
      <div className="flex flex-wrap gap-1.5 rounded-2xl bg-white/55 p-1.5 dark:bg-white/4">
        {options.map(([optionValue, optionLabel]) => (
          <button
            type="button"
            key={optionValue}
            onClick={() => onChange(optionValue)}
            className={`flex-1 rounded-xl px-3 py-2 text-caption font-medium transition-all ${
              value === optionValue
                ? 'bg-white text-[#377CF6] shadow-[0_5px_14px_rgba(31,67,112,.10)] dark:bg-white/10 dark:text-[#79AEFF]'
                : 'text-content-muted hover:text-content'
            }`}
          >
            {optionLabel}
          </button>
        ))}
      </div>
    </div>
  )
}
