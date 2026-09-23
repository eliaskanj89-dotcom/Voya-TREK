import { useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, Compass, Sparkles, X } from 'lucide-react'
import { useNavigate } from 'react-router'
import type {
  VoyaDestinationDiscoveryRequest,
  VoyaDestinationDiscoveryResult,
  VoyaDestinationSuggestion,
} from '@trek/shared'
import Navbar from '../components/Layout/Navbar'
import { voyaAiApi } from '../api/client'
import { getApiErrorMessage } from '../types'
import { useIsPhone } from '../mobile/useIsPhone'
import MGlassBar from '../mobile/components/MGlassBar'
import MIconBtn from '../mobile/components/MIconBtn'
import { useDestinationVisual } from '../hooks/useDestinationVisual'

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

const STYLE_OPTIONS: Array<[VoyaDestinationDiscoveryRequest['travelStyle'], string]> = [
  ['balanced', 'A bit of everything'],
  ['culture', 'Culture'],
  ['food', 'Food'],
  ['nature', 'Nature'],
  ['beach', 'Beach'],
  ['city', 'City'],
  ['nightlife', 'Nightlife'],
  ['slow', 'Slow travel'],
]

const CLIMATE_OPTIONS: Array<[VoyaDestinationDiscoveryRequest['climate'], string]> = [
  ['any', 'Any climate'],
  ['warm', 'Warm'],
  ['mild', 'Mild'],
  ['cool', 'Cool'],
]

const BUDGET_OPTIONS: Array<[VoyaDestinationDiscoveryRequest['budgetStyle'], string]> = [
  ['budget', 'Budget'],
  ['moderate', 'Moderate'],
  ['premium', 'Premium'],
  ['luxury', 'Luxury'],
]

const EFFORT_OPTIONS: Array<[VoyaDestinationDiscoveryRequest['travelEffort'], string, string]> = [
  ['easy', 'Keep it easy', 'Simple trip shape, fewer geographic demands'],
  ['open', 'Open', 'Balance convenience with interesting options'],
  ['adventurous', 'Adventure is fine', 'Longer or more complex trips are okay'],
]

const CARD_WASHES = [
  'linear-gradient(145deg, rgba(230,242,255,.96), rgba(255,255,255,.86))',
  'linear-gradient(145deg, rgba(239,246,255,.96), rgba(233,242,255,.82))',
  'linear-gradient(145deg, rgba(247,250,255,.98), rgba(229,240,255,.84))',
  'linear-gradient(145deg, rgba(235,246,255,.96), rgba(250,252,255,.90))',
]

export default function DiscoverPage() {
  const navigate = useNavigate()
  const isPhone = useIsPhone()
  const [days, setDays] = useState(7)
  const [budgetStyle, setBudgetStyle] = useState<VoyaDestinationDiscoveryRequest['budgetStyle']>('moderate')
  const [climate, setClimate] = useState<VoyaDestinationDiscoveryRequest['climate']>('any')
  const [travelStyle, setTravelStyle] = useState<VoyaDestinationDiscoveryRequest['travelStyle']>('balanced')
  const [month, setMonth] = useState<number | ''>('')
  const [travelEffort, setTravelEffort] = useState<VoyaDestinationDiscoveryRequest['travelEffort']>('open')
  const [interests, setInterests] = useState('')
  const [notes, setNotes] = useState('')
  const [result, setResult] = useState<VoyaDestinationDiscoveryResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [compare, setCompare] = useState<string[]>([])

  const request = (): VoyaDestinationDiscoveryRequest => ({
    days,
    budgetStyle,
    climate,
    travelStyle,
    month: month === '' ? undefined : month,
    travelEffort,
    interests: interests
      .split(',')
      .map(value => value.trim())
      .filter(Boolean)
      .slice(0, 10),
    notes: notes.trim() || undefined,
  })

  const discover = async () => {
    setLoading(true)
    setError('')
    setCompare([])
    try {
      setResult(await voyaAiApi.discoverDestinations(request()))
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, 'Voya could not discover destinations right now.'))
    } finally {
      setLoading(false)
    }
  }

  const plan = (destination: VoyaDestinationSuggestion) => {
    const params = new URLSearchParams({
      create: '1',
      destination: destination.searchTerm || `${destination.name}, ${destination.country}`,
      days: String(days),
      budgetStyle,
      travelStyle,
      climate,
      travelEffort,
    })
    const interestBrief = interests
      .split(',')
      .map(value => value.trim())
      .filter(Boolean)
      .slice(0, 10)
      .join(', ')
    if (interestBrief) params.set('interests', interestBrief)
    if (notes.trim()) params.set('notes', notes.trim())
    navigate(`/dashboard?${params.toString()}`)
  }

  const compareSuggestions = useMemo(
    () => result?.suggestions.filter(s => compare.includes(keyOf(s))) ?? [],
    [result, compare],
  )

  const toggleCompare = (suggestion: VoyaDestinationSuggestion) => {
    const key = keyOf(suggestion)
    setCompare(current => {
      if (current.includes(key)) return current.filter(item => item !== key)
      if (current.length >= 3) return current
      return [...current, key]
    })
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_12%_0%,rgba(219,237,255,.82),transparent_30%),linear-gradient(180deg,#F8FBFF_0%,#FFFFFF_40%,#F4F8FC_100%)] text-content dark:bg-[radial-gradient(circle_at_12%_0%,rgba(39,76,119,.28),transparent_32%),linear-gradient(180deg,#07111F_0%,#0A1728_45%,#081321_100%)]">
      {isPhone ? (
        <MGlassBar floating>
          <MIconBtn ariaLabel="Back" onClick={() => navigate('/dashboard')}>
            <ArrowLeft size={18} strokeWidth={2.2} />
          </MIconBtn>
          <div className="min-w-0 flex-1 text-center">
            <span className="voya-wordmark text-[22px] text-m-ink">Voya</span>
          </div>
          <span className="w-10" />
        </MGlassBar>
      ) : (
        <Navbar />
      )}

      <main className={isPhone
        ? 'mx-auto max-w-[860px] px-4 pb-24 pt-[calc(var(--m-safe-top,12px)+82px)]'
        : 'mx-auto max-w-[1280px] px-6 pb-24 pt-[calc(var(--nav-h)+54px)] lg:px-10'
      }>
        <section className="mx-auto max-w-4xl text-center">
          <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-[#BBD6FA]/60 bg-white/70 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[.13em] text-[#377CF6] shadow-[0_8px_24px_rgba(31,67,112,.06)] backdrop-blur-xl dark:border-white/10 dark:bg-white/5">
            <Sparkles size={13} />
            Destination Discovery
          </div>
          <h1 className="voya-editorial mt-5 text-[clamp(2.65rem,7vw,5.6rem)] font-medium leading-[.94] tracking-[-.065em] text-content">
            Where should Voya<br className="hidden sm:block" /> take you?
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-[clamp(.95rem,1.8vw,1.15rem)] leading-relaxed text-content-muted">
            Tell Voya how you want the trip to feel. It combines this trip brief with your Traveler DNA and gives you a focused set of places worth planning.
          </p>
        </section>

        <section className="mx-auto mt-10 max-w-5xl overflow-hidden rounded-[30px] border border-[#BFD8F7]/45 bg-white/66 shadow-[0_30px_80px_rgba(31,67,112,.10)] backdrop-blur-[28px] dark:border-white/9 dark:bg-white/4">
          <div className="grid gap-0 lg:grid-cols-[1fr_1.15fr]">
            <div className="border-b border-edge-faint p-5 sm:p-7 lg:border-b-0 lg:border-r">
              <Eyebrow>Trip shape</Eyebrow>
              <div className="mt-4">
                <label className="text-caption font-medium text-content-muted">How many days?</label>
                <div className="mt-2 flex items-center gap-3">
                  <input
                    type="range"
                    min={2}
                    max={30}
                    value={days}
                    onChange={event => setDays(Number(event.target.value))}
                    className="min-w-0 flex-1 accent-[#377CF6]"
                  />
                  <span className="voya-editorial flex h-11 min-w-[74px] items-center justify-center rounded-2xl border border-edge bg-white/74 px-3 text-[19px] font-medium tracking-[-.03em] dark:bg-white/6">
                    {days} days
                  </span>
                </div>
              </div>

              <Field title="When?">
                <div className="flex flex-wrap gap-1.5">
                  <Choice active={month === ''} onClick={() => setMonth('')}>Flexible</Choice>
                  {MONTHS.map((label, index) => (
                    <Choice key={label} active={month === index + 1} onClick={() => setMonth(index + 1)}>
                      {label}
                    </Choice>
                  ))}
                </div>
              </Field>

              <Field title="Budget style">
                <ChoiceGrid>
                  {BUDGET_OPTIONS.map(([value, label]) => (
                    <Choice key={value} active={budgetStyle === value} onClick={() => setBudgetStyle(value)}>
                      {label}
                    </Choice>
                  ))}
                </ChoiceGrid>
              </Field>

              <Field title="Climate">
                <ChoiceGrid>
                  {CLIMATE_OPTIONS.map(([value, label]) => (
                    <Choice key={value} active={climate === value} onClick={() => setClimate(value)}>
                      {label}
                    </Choice>
                  ))}
                </ChoiceGrid>
              </Field>
            </div>

            <div className="p-5 sm:p-7">
              <Eyebrow>How should it feel?</Eyebrow>

              <Field title="Main vibe">
                <div className="flex flex-wrap gap-2">
                  {STYLE_OPTIONS.map(([value, label]) => (
                    <Choice key={value} active={travelStyle === value} onClick={() => setTravelStyle(value)}>
                      {label}
                    </Choice>
                  ))}
                </div>
              </Field>

              <Field title="Travel effort">
                <div className="grid gap-2 sm:grid-cols-3">
                  {EFFORT_OPTIONS.map(([value, label, description]) => (
                    <button
                      type="button"
                      key={value}
                      onClick={() => setTravelEffort(value)}
                      className={`rounded-[18px] border p-3 text-left transition-all ${
                        travelEffort === value
                          ? 'border-[#377CF6]/55 bg-[#377CF6]/7 shadow-[0_8px_20px_rgba(55,124,246,.08)]'
                          : 'border-edge-faint bg-white/48 hover:border-[#377CF6]/25 dark:bg-white/4'
                      }`}
                    >
                      <div className={`text-[12px] font-semibold ${travelEffort === value ? 'text-[#377CF6]' : 'text-content'}`}>{label}</div>
                      <div className="mt-1 text-[10px] leading-relaxed text-content-faint">{description}</div>
                    </button>
                  ))}
                </div>
              </Field>

              <Field title="What are you into?">
                <input
                  value={interests}
                  onChange={event => setInterests(event.target.value)}
                  placeholder="food, architecture, beaches, design, hiking…"
                  className="w-full rounded-[18px] border border-edge bg-white/62 px-4 py-3 text-body text-content outline-none placeholder:text-content-faint focus:border-[#377CF6] focus:ring-4 focus:ring-[#377CF6]/10 dark:bg-white/5"
                />
                <p className="mt-1.5 text-[10px] text-content-faint">Separate interests with commas.</p>
              </Field>

              <Field title="Anything else?">
                <textarea
                  value={notes}
                  onChange={event => setNotes(event.target.value)}
                  rows={3}
                  placeholder="I want somewhere that feels exciting but not exhausting…"
                  className="w-full resize-none rounded-[18px] border border-edge bg-white/62 px-4 py-3 text-body leading-relaxed text-content outline-none placeholder:text-content-faint focus:border-[#377CF6] focus:ring-4 focus:ring-[#377CF6]/10 dark:bg-white/5"
                />
              </Field>

              <button
                type="button"
                disabled={loading}
                onClick={() => { void discover() }}
                className="mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-[#377CF6] px-5 py-3 text-body font-semibold text-white shadow-[0_14px_30px_rgba(55,124,246,.25)] transition-all hover:-translate-y-px hover:bg-[#286CE4] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/35 border-t-white" />
                    Finding your places…
                  </>
                ) : (
                  <>
                    <Compass size={16} strokeWidth={2.2} />
                    Find my trip
                  </>
                )}
              </button>
            </div>
          </div>
        </section>

        {error && (
          <div className="mx-auto mt-5 max-w-5xl rounded-2xl border border-danger/20 bg-danger-soft px-4 py-3 text-caption text-danger">
            {error}
          </div>
        )}

        {loading && !result && <DiscoverySkeleton />}

        {result && (
          <section className="mt-16">
            <div className="mx-auto max-w-3xl text-center">
              <Eyebrow>Voya’s shortlist</Eyebrow>
              <h2 className="voya-editorial mt-2 text-[clamp(2rem,5vw,3.5rem)] font-medium tracking-[-.055em] text-content">
                Places that fit this trip
              </h2>
              <p className="mx-auto mt-3 max-w-2xl text-body leading-relaxed text-content-muted">{result.summary}</p>
              <p className="mt-2 text-[10px] text-content-faint">
                Qualitative planning suggestions · not live pricing, weather, availability, safety, or entry-rule advice.
              </p>
            </div>

            <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {result.suggestions.map((suggestion, index) => (
                <DestinationCard
                  key={keyOf(suggestion)}
                  suggestion={suggestion}
                  index={index}
                  compared={compare.includes(keyOf(suggestion))}
                  compareFull={compare.length >= 3}
                  onCompare={() => toggleCompare(suggestion)}
                  onPlan={() => plan(suggestion)}
                />
              ))}
            </div>
          </section>
        )}

        {compareSuggestions.length > 0 && (
          <div className="sticky bottom-4 z-40 mx-auto mt-6 max-w-4xl rounded-[24px] border border-[#B7D2F6]/60 bg-[rgba(250,253,255,.90)] p-3 shadow-[0_20px_50px_rgba(31,67,112,.18)] backdrop-blur-[28px] dark:border-white/10 dark:bg-[rgba(10,25,44,.88)]">
            <div className="flex flex-wrap items-center gap-2">
              <span className="ml-1 text-[11px] font-semibold uppercase tracking-[.11em] text-content-faint">Compare</span>
              {compareSuggestions.map(suggestion => (
                <span key={keyOf(suggestion)} className="flex items-center gap-1.5 rounded-full bg-[#377CF6]/8 px-3 py-1.5 text-caption font-medium text-[#377CF6]">
                  {suggestion.name}
                  <button type="button" onClick={() => toggleCompare(suggestion)} aria-label={`Remove ${suggestion.name} from compare`}>
                    <X size={11} />
                  </button>
                </span>
              ))}
              <span className="ml-auto text-[10px] text-content-faint">{compare.length}/3</span>
            </div>
            {compareSuggestions.length >= 2 && (
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {compareSuggestions.map(suggestion => (
                  <div key={keyOf(suggestion)} className="rounded-[16px] border border-edge-faint bg-white/60 p-3 dark:bg-white/4">
                    <div className="font-semibold text-content">{suggestion.name}</div>
                    <div className="mt-1 text-[10px] uppercase tracking-[.08em] text-content-faint">{suggestion.budgetBand} · {suggestion.type}</div>
                    <div className="mt-2 text-caption leading-relaxed text-content-muted">{suggestion.fitSummary}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}

function DestinationCard({
  suggestion,
  index,
  compared,
  compareFull,
  onCompare,
  onPlan,
}: {
  suggestion: VoyaDestinationSuggestion
  index: number
  compared: boolean
  compareFull: boolean
  onCompare: () => void
  onPlan: () => void
}) {
  const { visual, loading: visualLoading } = useDestinationVisual(
    suggestion.name,
    suggestion.country,
    suggestion.searchTerm,
  )

  return (
    <article
      className="group flex min-h-[500px] flex-col overflow-hidden rounded-[28px] border border-[#BDD5F4]/42 shadow-[0_20px_54px_rgba(31,67,112,.09)] transition-all hover:-translate-y-1 hover:shadow-[0_28px_68px_rgba(31,67,112,.14)] dark:border-white/9"
      style={{ background: CARD_WASHES[index % CARD_WASHES.length] }}
    >
      <div className="relative min-h-[230px] overflow-hidden border-b border-[#9FC3EF]/13">
        {visual ? (
          <>
            <img
              src={visual.url}
              alt=""
              className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.035]"
            />
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(6,20,39,.12)_0%,rgba(6,20,39,.28)_44%,rgba(6,20,39,.78)_100%)]" />
          </>
        ) : (
          <>
            <div className="absolute inset-0" style={{ background: CARD_WASHES[index % CARD_WASHES.length] }} />
            <div className="absolute -right-10 -top-12 h-40 w-40 rounded-full border-[26px] border-[#377CF6]/7" />
            <div className="absolute -bottom-12 right-16 h-28 w-28 rounded-full bg-[#377CF6]/6 blur-2xl" />
            {visualLoading && (
              <div className="absolute inset-0 animate-pulse bg-[linear-gradient(100deg,transparent_20%,rgba(255,255,255,.48)_44%,transparent_68%)] bg-[length:220%_100%]" />
            )}
          </>
        )}

        <div className="relative z-10 flex min-h-[230px] flex-col justify-between p-5">
          <div className="flex items-center justify-between gap-3">
            <span className={`rounded-full border px-2.5 py-1 text-[9px] font-bold uppercase tracking-[.11em] backdrop-blur-xl ${
              visual
                ? 'border-white/25 bg-black/20 text-white'
                : 'border-[#377CF6]/16 bg-white/58 text-[#377CF6]'
            }`}>
              {suggestion.type}
            </span>
            <button
              type="button"
              onClick={onCompare}
              disabled={!compared && compareFull}
              className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold backdrop-blur-xl transition-all disabled:cursor-not-allowed disabled:opacity-35 ${
                compared
                  ? 'bg-[#377CF6] text-white'
                  : visual
                    ? 'border border-white/25 bg-black/20 text-white hover:bg-black/30'
                    : 'border border-[#377CF6]/16 bg-white/48 text-[#377CF6]'
              }`}
            >
              {compared && <Check size={10} strokeWidth={3} />}
              {compared ? 'Comparing' : 'Compare'}
            </button>
          </div>

          <div>
            <h3 className={`voya-editorial text-[38px] font-medium leading-[.93] tracking-[-.06em] ${visual ? 'text-white drop-shadow-[0_2px_18px_rgba(0,0,0,.32)]' : 'text-content'}`}>
              {suggestion.name}
            </h3>
            <p className={`mt-1 text-[12px] font-medium ${visual ? 'text-white/78' : 'text-content-muted'}`}>
              {suggestion.country}
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {suggestion.vibe.slice(0, 4).map(vibe => (
                <span
                  key={vibe}
                  className={`rounded-full px-2.5 py-1 text-[9px] font-medium backdrop-blur-xl ${
                    visual ? 'border border-white/15 bg-black/18 text-white/88' : 'bg-white/58 text-content-muted'
                  }`}
                >
                  {vibe}
                </span>
              ))}
            </div>
          </div>
        </div>

        {visual && (
          <div className="absolute bottom-2 right-2 z-20 max-w-[72%] truncate rounded-full bg-black/30 px-2 py-1 text-[8px] font-medium text-white/72 backdrop-blur-xl">
            {visual.source === 'google'
              ? 'Google photo'
              : [visual.source === 'wikimedia' ? 'Wikimedia' : visual.source === 'wikipedia' ? 'Wikipedia' : 'Cached photo', visual.attribution].filter(Boolean).join(' · ')}
            {visual.license ? ` · ${visual.license}` : ''}
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col p-5">
        <p className="text-body leading-relaxed text-content-secondary">{suggestion.fitSummary}</p>

        <div className="mt-4">
          <CardLabel>Why it fits</CardLabel>
          <ul className="mt-2 space-y-1.5">
            {suggestion.whyFit.map(reason => (
              <li key={reason} className="flex gap-2 text-caption leading-relaxed text-content-muted">
                <span className="mt-[6px] h-1.5 w-1.5 flex-none rounded-full bg-[#377CF6]" />
                {reason}
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <MiniStat label="Budget" value={suggestion.budgetBand} />
          <MiniStat label="Climate fit" value={suggestion.climateNote} />
        </div>

        <div className="mt-4">
          <CardLabel>Highlights</CardLabel>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {suggestion.highlights.map(highlight => (
              <span key={highlight} className="rounded-full border border-edge-faint bg-white/44 px-2.5 py-1 text-[10px] text-content-muted">{highlight}</span>
            ))}
          </div>
        </div>

        {suggestion.tradeoffs.length > 0 && (
          <div className="mt-4">
            <CardLabel>Worth knowing</CardLabel>
            <p className="mt-1.5 text-caption leading-relaxed text-content-faint">{suggestion.tradeoffs.join(' · ')}</p>
          </div>
        )}

        <button
          type="button"
          onClick={onPlan}
          className="mt-auto flex w-full items-center justify-center gap-2 rounded-full bg-[#377CF6] px-4 py-2.5 text-body font-semibold text-white shadow-[0_10px_22px_rgba(55,124,246,.21)] transition-all hover:bg-[#286CE4]"
        >
          Plan this trip
          <ArrowRight size={14} />
        </button>
      </div>
    </article>
  )
}

function DiscoverySkeleton() {
  return (
    <section className="mt-16">
      <div className="mx-auto h-8 w-64 animate-pulse rounded-full bg-[#377CF6]/8" />
      <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="h-[500px] animate-pulse rounded-[28px] border border-edge-faint bg-white/50 dark:bg-white/4" />
        ))}
      </div>
    </section>
  )
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <div className="text-[10px] font-bold uppercase tracking-[.14em] text-[#377CF6]">{children}</div>
}

function Field({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-5">
      <label className="mb-2 block text-caption font-medium text-content-muted">{title}</label>
      {children}
    </div>
  )
}

function ChoiceGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-2">{children}</div>
}

function Choice({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-2 text-[11px] font-medium transition-all ${
        active
          ? 'border-[#377CF6] bg-[#377CF6] text-white shadow-[0_6px_16px_rgba(55,124,246,.18)]'
          : 'border-edge bg-white/56 text-content-muted hover:border-[#377CF6]/25 hover:text-content dark:bg-white/4'
      }`}
    >
      {children}
    </button>
  )
}

function CardLabel({ children }: { children: React.ReactNode }) {
  return <div className="text-[9px] font-bold uppercase tracking-[.12em] text-content-faint">{children}</div>
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[14px] border border-edge-faint bg-white/48 p-2.5 dark:bg-white/4">
      <div className="text-[8px] font-bold uppercase tracking-[.11em] text-content-faint">{label}</div>
      <div className="mt-1 text-[10px] font-medium capitalize leading-snug text-content-muted">{value}</div>
    </div>
  )
}

function keyOf(suggestion: VoyaDestinationSuggestion): string {
  return `${suggestion.name.toLowerCase()}|${suggestion.country.toLowerCase()}`
}
