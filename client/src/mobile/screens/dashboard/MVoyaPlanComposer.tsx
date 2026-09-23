import { useEffect, useMemo, useState } from 'react'
import { ArrowDown, ArrowRight, ArrowUp, Check, ChevronDown, MapPin, Plus, Sparkles, Trash2 } from 'lucide-react'
import type { Trip, VoyaMultiCityPlanDraft, VoyaMultiCityPlanRequest, VoyaPlanDraftRequest, VoyaPlanDraftResponse } from '@trek/shared'
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
  initialBudgetStyle?: VoyaPlanDraftRequest['budgetStyle']
  initialInterests?: string
  initialNotes?: string
  onCreated: (trip: Trip) => Promise<void> | void
}

export default function MVoyaPlanComposer({
  destination: initialDestination,
  startDate,
  endDate,
  dayCount,
  currency,
  autoExpand = false,
  initialBudgetStyle,
  initialInterests = '',
  initialNotes = '',
  onCreated,
}: MVoyaPlanComposerProps) {
  const dna = useSettingsStore(state => state.settings.voya_traveler_dna)
  const [expanded, setExpanded] = useState(autoExpand)
  const [tripMode, setTripMode] = useState<'single' | 'multi'>('single')
  const [destination, setDestination] = useState(initialDestination)
  const [multiDestinations, setMultiDestinations] = useState<string[]>([initialDestination, ''])
  const [pace, setPace] = useState<VoyaPlanDraftRequest['pace']>(dna?.pace ?? 'balanced')
  const [budgetStyle, setBudgetStyle] = useState<VoyaPlanDraftRequest['budgetStyle']>(initialBudgetStyle ?? dna?.budgetStyle ?? 'moderate')
  const [interests, setInterests] = useState(initialInterests)
  const [notes, setNotes] = useState(initialNotes)
  const [draft, setDraft] = useState<VoyaPlanDraftResponse | null>(null)
  const [multiDraft, setMultiDraft] = useState<VoyaMultiCityPlanDraft | null>(null)
  const [request, setRequest] = useState<VoyaPlanDraftRequest | null>(null)
  const [multiRequest, setMultiRequest] = useState<VoyaMultiCityPlanRequest | null>(null)
  const [generating, setGenerating] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setDestination(initialDestination)
    if (initialDestination.trim()) setMultiDestinations(current => [initialDestination, ...current.slice(1)])
    if (autoExpand && initialDestination.trim()) setExpanded(true)
  }, [initialDestination, autoExpand])

  useEffect(() => {
    if (draft || multiDraft) return
    setPace(dna?.pace ?? 'balanced')
    setBudgetStyle(initialBudgetStyle ?? dna?.budgetStyle ?? 'moderate')
    setInterests(initialInterests)
    setNotes(initialNotes)
  }, [
    dna?.pace,
    dna?.budgetStyle,
    initialBudgetStyle,
    initialInterests,
    initialNotes,
    draft,
    multiDraft,
  ])

  const days = useMemo(
    () => startDate && endDate ? tripSpanDays(startDate, endDate) : Math.max(1, dayCount || 7),
    [startDate, endDate, dayCount],
  )

  const generate = async () => {
    setGenerating(true)
    setError('')
    setDraft(null)
    setMultiDraft(null)
    try {
      const interestList = interests.split(',').map(value => value.trim()).filter(Boolean).slice(0, 12)
      if (tripMode === 'multi') {
        const cleaned = multiDestinations.map(value => value.trim()).filter(Boolean)
        const unique = cleaned.filter((value, index) =>
          cleaned.findIndex(other => other.toLowerCase() === value.toLowerCase()) === index
        )
        if (unique.length < 2) {
          setError('Add at least two destinations.')
          return
        }
        if (days < unique.length) {
          setError('The trip needs at least one day per destination.')
          return
        }
        const payload: VoyaMultiCityPlanRequest = {
          destinations: unique.map(name => ({ name })),
          startDate: startDate || undefined,
          endDate: endDate || undefined,
          days,
          travelers: 1,
          currency: currency || 'USD',
          pace,
          budgetStyle,
          interests: interestList,
          notes: notes.trim() || undefined,
          allowReorder: true,
        }
        const result = await voyaAiApi.planMultiCityDraft(payload)
        setMultiRequest(payload)
        setMultiDraft(result.draft)
      } else {
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
          interests: interestList,
          notes: notes.trim() || undefined,
        }
        const result = await voyaAiApi.planDraft(payload)
        setRequest(payload)
        setDraft(result.draft)
      }
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, tripMode === 'multi'
        ? 'Voya could not generate this journey right now.'
        : 'Voya could not generate this trip right now.'))
    } finally {
      setGenerating(false)
    }
  }

  const createTrip = async () => {
    setCreating(true)
    setError('')
    try {
      if (multiDraft && multiRequest) {
        const result = await voyaAiApi.materializeMultiCityDraft({ request: multiRequest, draft: multiDraft, reminderDays: 0 })
        startVoyaEnrichment(result.trip.id)
        await onCreated(result.trip)
        return
      }
      if (!draft || !request) return
      const result = await voyaAiApi.materializeDraft({ request, draft, reminderDays: 0 })
      startVoyaEnrichment(result.trip.id)
      await onCreated(result.trip)
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, 'Voya could not create this trip.'))
    } finally {
      setCreating(false)
    }
  }

  const previewDraft = multiDraft ?? draft

  const updateMultiDestination = (index: number, value: string) =>
    setMultiDestinations(current => current.map((item, i) => i === index ? value : item))
  const moveMultiDestination = (index: number, direction: -1 | 1) =>
    setMultiDestinations(current => {
      const target = index + direction
      if (target < 0 || target >= current.length) return current
      const next = [...current]
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })

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
          onClick={() => { setExpanded(false); setDraft(null); setMultiDraft(null); setError('') }}
          className="font-geist text-[0.625rem] font-semibold text-m-faint"
        >
          Manual
        </button>
      </div>

      {!previewDraft ? (
        <div className="space-y-3 p-3.5">
          <div className="flex rounded-full bg-[color:var(--m-ic)] p-1">
            {(['single','multi'] as const).map(modeValue => (
              <button
                type="button"
                key={modeValue}
                onClick={() => {
                  setTripMode(modeValue)
                  if (modeValue === 'multi') setMultiDestinations(current => {
                    const next=[...current]
                    if (!next[0] && destination.trim()) next[0]=destination.trim()
                    return next.length >= 2 ? next : [...next,'']
                  })
                  setError('')
                }}
                className={`flex-1 rounded-full px-3 py-2 font-geist text-[0.625rem] font-bold ${tripMode === modeValue ? 'bg-m-act text-m-actfg' : 'text-m-muted'}`}
              >
                {modeValue === 'single' ? 'Single city' : 'Multi-city'}
              </button>
            ))}
          </div>

          {tripMode === 'single' ? (
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
          ) : (
            <MobileField label="Journey order">
              <div className="space-y-1.5">
                {multiDestinations.map((value,index)=>(
                  <div key={index} className="flex items-center gap-1.5 rounded-[14px] border border-[color:var(--m-rowbr)] bg-[color:var(--m-ic)] p-1.5">
                    <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-m-act font-geist text-[0.5rem] font-bold text-m-actfg">{index+1}</span>
                    <input value={value} onChange={event=>updateMultiDestination(index,event.target.value)} placeholder={index===0?'Rome, Italy':index===1?'Florence, Italy':'Another city'} className="min-w-0 flex-1 bg-transparent px-1 py-1.5 text-[0.75rem] font-semibold text-m-ink outline-none"/>
                    <button type="button" onClick={()=>moveMultiDestination(index,-1)} disabled={index===0} className="p-1 text-m-faint disabled:opacity-25"><ArrowUp size={11}/></button>
                    <button type="button" onClick={()=>moveMultiDestination(index,1)} disabled={index===multiDestinations.length-1} className="p-1 text-m-faint disabled:opacity-25"><ArrowDown size={11}/></button>
                    <button type="button" onClick={()=>setMultiDestinations(current=>current.length<=2?current:current.filter((_,i)=>i!==index))} disabled={multiDestinations.length<=2} className="p-1 text-m-faint disabled:opacity-25"><Trash2 size={11}/></button>
                  </div>
                ))}
              </div>
              {multiDestinations.length < 6 && (
                <button type="button" onClick={()=>setMultiDestinations(current=>[...current,''])} className="mt-2 flex items-center gap-1 rounded-full border border-[color:var(--m-rowbr)] px-2.5 py-1.5 font-geist text-[0.5625rem] font-bold text-m-act">
                  <Plus size={10}/> Add destination
                </button>
              )}
            </MobileField>
          )}

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
              <div className="mt-2 text-[1rem] font-bold leading-tight text-m-ink">{previewDraft!.title}</div>
              <p className="mt-1 font-geist text-[0.65625rem] leading-relaxed text-m-muted">{previewDraft!.summary}</p>
            </div>
            <button type="button" onClick={() => { setDraft(null); setMultiDraft(null) }} className="font-geist text-[0.625rem] font-semibold text-m-faint">Adjust</button>
          </div>

          {multiDraft && (
            <div className="mt-3 overflow-x-auto pb-1">
              <div className="flex w-max items-center gap-1.5">
                {multiDraft.legs.map((leg,index)=>(
                  <div key={`${leg.order}-${leg.destination}`} className="flex items-center gap-1.5">
                    {index>0 && <span className="rounded-full bg-[color:var(--m-ic)] px-2 py-1 font-geist text-[0.5rem] text-m-muted">{leg.transportFromPrevious || 'Transfer'}</span>}
                    <div className="rounded-[12px] bg-[color:var(--m-ic)] px-2.5 py-2">
                      <div className="font-geist text-[0.45rem] font-bold uppercase tracking-[.08em] text-m-faint">Stop {leg.order}</div>
                      <div className="text-[0.6875rem] font-semibold text-m-ink">{leg.destination}</div>
                      <div className="font-geist text-[0.5rem] text-m-muted">{leg.allocatedDays}d</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mt-3 max-h-[300px] space-y-2 overflow-y-auto">
            {previewDraft!.days.map(day => (
              <details key={day.dayNumber} className="overflow-hidden rounded-[14px] border border-[color:var(--m-rowbr)] bg-[color:var(--m-ic)]">
                <summary className="flex list-none items-center gap-2 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="font-geist text-[0.5rem] font-bold uppercase tracking-[.09em] text-m-act">Day {day.dayNumber}{day.destination ? ` · ${day.destination}` : ''}</div>
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
