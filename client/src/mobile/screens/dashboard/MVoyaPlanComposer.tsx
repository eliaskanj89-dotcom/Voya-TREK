import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, Check, ChevronDown, MapPin, Sparkles } from 'lucide-react'
import type { Trip, VoyaPlanDraftRequest, VoyaPlanDraftResponse } from '@trek/shared'
import { tripSpanDays } from '@trek/shared'
import { voyaAiApi } from '../../../api/client'
import { getApiErrorMessage } from '../../../types'
import { useSettingsStore } from '../../../store/settingsStore'

interface MVoyaPlanComposerProps {
  destination: string
  startDate: string
  endDate: string
  dayCount: number
  currency: string
  autoExpand?: boolean
  onCreated: (trip: Trip) => Promise<void> | void
}

export default function MVoyaPlanComposer({
  destination: initialDestination,
  startDate,
  endDate,
  dayCount,
  currency,
  autoExpand = false,
  onCreated,
}: MVoyaPlanComposerProps) {
  const dna = useSettingsStore(state => state.settings.voya_traveler_dna)
  const [expanded, setExpanded] = useState(autoExpand)
  const [destination, setDestination] = useState(initialDestination)
  const [pace, setPace] = useState<VoyaPlanDraftRequest['pace']>(dna?.pace ?? 'balanced')
  const [budgetStyle, setBudgetStyle] = useState<VoyaPlanDraftRequest['budgetStyle']>(dna?.budgetStyle ?? 'moderate')
  const [interests, setInterests] = useState('')
  const [notes, setNotes] = useState('')
  const [draft, setDraft] = useState<VoyaPlanDraftResponse | null>(null)
  const [request, setRequest] = useState<VoyaPlanDraftRequest | null>(null)
  const [generating, setGenerating] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setDestination(initialDestination)
    if (autoExpand && initialDestination.trim()) setExpanded(true)
  }, [initialDestination, autoExpand])

  useEffect(() => {
    if (draft) return
    setPace(dna?.pace ?? 'balanced')
    setBudgetStyle(dna?.budgetStyle ?? 'moderate')
  }, [dna?.pace, dna?.budgetStyle, draft])

  const days = useMemo(
    () => startDate && endDate ? tripSpanDays(startDate, endDate) : Math.max(1, dayCount || 7),
    [startDate, endDate, dayCount],
  )

  const generate = async () => {
    if (!destination.trim()) {
      setError('Add a destination first.')
      return
    }
    const payload: VoyaPlanDraftRequest = {
      destination: destination.trim(),
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      days,
      travelers: 1,
      currency: currency || 'USD',
      pace,
      budgetStyle,
      interests: interests.split(',').map(value => value.trim()).filter(Boolean).slice(0, 12),
      notes: notes.trim() || undefined,
    }
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
      const result = await voyaAiApi.materializeDraft({ request, draft, reminderDays: 0 })
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
        onClick={() => setExpanded(true)}
        className="mb-3 flex w-full items-center gap-3 rounded-[18px] border border-[color:var(--m-gbr)] bg-[linear-gradient(145deg,rgba(55,124,246,.10),rgba(255,255,255,.04))] p-3 text-left"
      >
        <span className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-m-act text-m-actfg shadow-[0_8px_20px_rgba(55,124,246,.22)]">
          <Sparkles size={16} strokeWidth={2.2} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[0.8125rem] font-bold text-m-ink">Plan with Voya</span>
          <span className="mt-px block font-geist text-[0.65625rem] leading-snug text-m-muted">Generate the itinerary, review it, then create the trip.</span>
        </span>
        <ArrowRight size={15} className="flex-none text-m-act" />
      </button>
    )
  }

  return (
    <div className="mb-3 overflow-hidden rounded-[20px] border border-[color:var(--m-gbr)] bg-[linear-gradient(145deg,rgba(55,124,246,.09),rgba(255,255,255,.025))]">
      <div className="flex items-start gap-3 border-b border-[color:var(--m-rowbr)] p-3.5">
        <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-m-act text-m-actfg">
          <Sparkles size={15} strokeWidth={2.2} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[0.8125rem] font-bold text-m-ink">Design it with Voya</div>
          <div className="mt-px font-geist text-[0.625rem] leading-relaxed text-m-muted">Suggestions first. Place details, prices and availability stay unverified until checked.</div>
        </div>
        <button
          type="button"
          onClick={() => { setExpanded(false); setDraft(null); setError('') }}
          className="font-geist text-[0.625rem] font-semibold text-m-faint"
        >
          Manual
        </button>
      </div>

      {!draft ? (
        <div className="space-y-3 p-3.5">
          <MobileField label="Destination">
            <div className="relative">
              <MapPin size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-m-act" />
              <input
                value={destination}
                onChange={event => setDestination(event.target.value)}
                placeholder="Tokyo, Japan"
                className="w-full rounded-[14px] border border-[color:var(--m-rowbr)] bg-[color:var(--m-ic)] py-2.5 pl-9 pr-3 text-[0.8125rem] font-semibold text-m-ink outline-none"
              />
            </div>
          </MobileField>

          <div className="grid grid-cols-2 gap-2">
            <MobileChoice
              label="Pace"
              value={pace}
              options={[['relaxed','Relaxed'],['balanced','Balanced'],['packed','Full']] as Array<[string,string]>}
              onChange={value => setPace(value as VoyaPlanDraftRequest['pace'])}
            />
            <MobileChoice
              label="Budget"
              value={budgetStyle}
              options={[['budget','Budget'],['moderate','Mid'],['premium','Premium'],['luxury','Luxury']] as Array<[string,string]>}
              onChange={value => setBudgetStyle(value as VoyaPlanDraftRequest['budgetStyle'])}
            />
          </div>

          <MobileField label="Interests">
            <input
              value={interests}
              onChange={event => setInterests(event.target.value)}
              placeholder="food, design, nightlife…"
              className="w-full rounded-[14px] border border-[color:var(--m-rowbr)] bg-[color:var(--m-ic)] px-3 py-2.5 font-geist text-[0.75rem] text-m-ink outline-none placeholder:text-m-faint"
            />
          </MobileField>

          <MobileField label="Anything Voya should know?">
            <textarea
              value={notes}
              onChange={event => setNotes(event.target.value)}
              rows={2}
              placeholder="Keep walking manageable, one late night…"
              className="w-full resize-none rounded-[14px] border border-[color:var(--m-rowbr)] bg-[color:var(--m-ic)] px-3 py-2.5 font-geist text-[0.75rem] leading-relaxed text-m-ink outline-none placeholder:text-m-faint"
            />
          </MobileField>

          <div className="flex items-center justify-between gap-3 rounded-[14px] bg-[color:var(--m-ic)] px-3 py-2.5">
            <span className="font-geist text-[0.65625rem] text-m-muted"><b className="text-m-ink">{days} days</b> · {currency}</span>
            <button
              type="button"
              disabled={generating}
              onClick={() => { void generate() }}
              className="flex items-center gap-1.5 rounded-full bg-m-act px-3 py-2 text-[0.6875rem] font-semibold text-m-actfg disabled:opacity-60"
            >
              {generating ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current/30 border-t-current" /> : <Sparkles size={12} />}
              {generating ? 'Designing…' : 'Generate'}
            </button>
          </div>
        </div>
      ) : (
        <div className="p-3.5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="inline-flex items-center gap-1 rounded-full bg-[rgba(55,124,246,.10)] px-2 py-1 font-geist text-[0.5rem] font-bold uppercase tracking-[.09em] text-m-act">
                <Check size={9} strokeWidth={3} /> Draft ready
              </div>
              <div className="mt-2 text-[1rem] font-bold leading-tight text-m-ink">{draft.title}</div>
              <p className="mt-1 font-geist text-[0.65625rem] leading-relaxed text-m-muted">{draft.summary}</p>
            </div>
            <button type="button" onClick={() => setDraft(null)} className="font-geist text-[0.625rem] font-semibold text-m-faint">Adjust</button>
          </div>

          <div className="mt-3 max-h-[300px] space-y-2 overflow-y-auto">
            {draft.days.map(day => (
              <details key={day.dayNumber} className="overflow-hidden rounded-[14px] border border-[color:var(--m-rowbr)] bg-[color:var(--m-ic)]">
                <summary className="flex list-none items-center gap-2 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="font-geist text-[0.5rem] font-bold uppercase tracking-[.09em] text-m-act">Day {day.dayNumber}</div>
                    <div className="truncate text-[0.75rem] font-semibold text-m-ink">{day.title}</div>
                  </div>
                  <span className="font-geist text-[0.5625rem] text-m-faint">{day.activities.length} stops</span>
                  <ChevronDown size={12} className="text-m-faint" />
                </summary>
                <div className="border-t border-[color:var(--m-rowbr)] px-3 py-2">
                  {day.activities.map((activity, index) => (
                    <div key={`${day.dayNumber}-${index}-${activity.name}`} className="flex gap-2 py-1.5">
                      <span className="flex h-5 w-5 flex-none items-center justify-center rounded-full bg-m-act font-geist text-[0.5rem] font-bold text-m-actfg">{index + 1}</span>
                      <div className="min-w-0">
                        <div className="text-[0.6875rem] font-semibold text-m-ink">{activity.name}</div>
                        <div className="font-geist text-[0.5625rem] leading-relaxed text-m-muted">{activity.description}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </details>
            ))}
          </div>

          <button
            type="button"
            disabled={creating}
            onClick={() => { void createTrip() }}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-full bg-m-act px-4 py-2.5 text-[0.75rem] font-semibold text-m-actfg disabled:opacity-60"
          >
            {creating ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current/30 border-t-current" /> : null}
            {creating ? 'Creating…' : 'Create this trip'}
            {!creating && <ArrowRight size={13} />}
          </button>
        </div>
      )}

      {error && <div className="mx-3.5 mb-3.5 rounded-[12px] bg-[rgba(239,68,68,.10)] px-3 py-2 font-geist text-[0.625rem] text-[color:var(--m-st-danger)]">{error}</div>}
    </div>
  )
}

function MobileField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 font-geist text-[0.5rem] font-bold uppercase tracking-[.1em] text-m-faint">{label}</div>
      {children}
    </div>
  )
}

function MobileChoice({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: Array<[string, string]>
  onChange: (value: string) => void
}) {
  return (
    <div>
      <div className="mb-1.5 font-geist text-[0.5rem] font-bold uppercase tracking-[.1em] text-m-faint">{label}</div>
      <div className="flex flex-wrap gap-1 rounded-[12px] bg-[color:var(--m-ic)] p-1">
        {options.map(([optionValue, optionLabel]) => (
          <button
            type="button"
            key={optionValue}
            onClick={() => onChange(optionValue)}
            className={`flex-1 rounded-[9px] px-1.5 py-1.5 font-geist text-[0.5625rem] font-semibold ${
              value === optionValue ? 'bg-m-act text-m-actfg' : 'text-m-muted'
            }`}
          >
            {optionLabel}
          </button>
        ))}
      </div>
    </div>
  )
}
