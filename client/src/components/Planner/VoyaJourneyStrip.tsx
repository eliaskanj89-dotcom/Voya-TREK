import { useState } from 'react'
import { Car, Navigation, Sparkles, TrainFront, X } from 'lucide-react'
import type { VoyaTransportAdviceResult } from '@trek/shared'
import type { Day } from '../../types'
import { voyaAiApi } from '../../api/client'
import { getApiErrorMessage } from '../../types'
import { useDestinationVisual } from '../../hooks/useDestinationVisual'

interface JourneySegment {
  destination: string
  country?: string
  firstDayId: number
  dayCount: number
  transfer?: string
  firstDayDate?: string
}

const CITY_RE = /(?:^|\n)Voya city:\s*([^,\n.]+?)(?:,\s*([^\n.]+))?\.(?:\n|$)/i
const TRANSFER_RE = /(?:^|\n)Voya transfer suggestion:\s*([^\n]+)/i

export function voyaJourneySegments(days: Day[]): JourneySegment[] {
  const segments: JourneySegment[] = []
  for (const day of days) {
    const notes = day.notes || ''
    const city = notes.match(CITY_RE)
    if (!city?.[1]) continue
    const destination = city[1].trim()
    const country = city[2]?.trim()
    const transfer = notes.match(TRANSFER_RE)?.[1]?.trim()
    const previous = segments[segments.length - 1]
    if (previous && previous.destination.toLowerCase() === destination.toLowerCase()) {
      previous.dayCount += 1
      continue
    }
    segments.push({
      destination,
      country,
      firstDayId: day.id,
      firstDayDate: day.date || undefined,
      dayCount: 1,
      transfer,
    })
  }
  return segments
}

export default function VoyaJourneyStrip({
  tripId,
  days,
  selectedDayId,
  onSelectDay,
  onAddTransport,
  compact = false,
}: {
  tripId: number
  days: Day[]
  selectedDayId: number | null
  onSelectDay: (dayId: number) => void
  onAddTransport?: (dayId: number) => void
  compact?: boolean
}) {
  const segments = voyaJourneySegments(days)
  const [transportLoading, setTransportLoading] = useState<string | null>(null)
  const [transportResult, setTransportResult] = useState<VoyaTransportAdviceResult | null>(null)
  const [transportError, setTransportError] = useState('')
  if (segments.length < 2) return null

  const compareTransfer = async (index: number) => {
    if (index <= 0 || index >= segments.length) return
    const from = segments[index - 1]
    const to = segments[index]
    const key = `${from.destination}->${to.destination}`
    setTransportLoading(key)
    setTransportError('')
    setTransportResult(null)
    try {
      const result = await voyaAiApi.transportAdvice({
        tripId,
        dayId: to.firstDayId,
        origin: [from.destination, from.country].filter(Boolean).join(', '),
        destination: [to.destination, to.country].filter(Boolean).join(', '),
        departureDate: to.firstDayDate,
      })
      setTransportResult(result)
    } catch (error: unknown) {
      setTransportError(getApiErrorMessage(error, 'Voya could not compare this transfer right now.'))
    } finally {
      setTransportLoading(null)
    }
  }

  const activeIndex = Math.max(
    0,
    segments.findIndex((segment, index) => {
      const start = days.findIndex(day => day.id === segment.firstDayId)
      const nextStart = segments[index + 1]
        ? days.findIndex(day => day.id === segments[index + 1].firstDayId)
        : days.length
      const selected = days.findIndex(day => day.id === selectedDayId)
      return selected >= start && selected < nextStart
    }),
  )

  return (
    <section className={`voya-journey-strip ${compact ? 'px-0 py-1' : 'px-3 py-2'}`}>
      {!compact && (
        <div className="mb-2 flex items-center justify-between">
          <div>
            <div className="text-[9px] font-semibold uppercase tracking-[.14em] text-[#377CF6]">Journey</div>
            <div className="text-[10px] text-content-faint">{segments.length} destinations · tap a city to jump</div>
          </div>
        </div>
      )}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {segments.map((segment, index) => {
          const active = index === activeIndex
          return (
            <div key={`${segment.destination}-${segment.firstDayId}`} className="flex flex-none items-center gap-1.5">
              {index > 0 && (
                <button
                  type="button"
                  onClick={() => { void compareTransfer(index) }}
                  className="group flex max-w-[150px] items-center gap-1 rounded-full bg-[#377CF6]/6 px-2 py-1 text-[9px] font-medium text-content-faint transition-all hover:bg-[#377CF6]/10 hover:text-[#377CF6]"
                  title="Compare this transfer with TREK's real transit and road providers"
                >
                  {transportLoading === `${segments[index - 1].destination}->${segment.destination}`
                    ? <span className="h-2.5 w-2.5 animate-spin rounded-full border border-[#377CF6]/30 border-t-[#377CF6]" />
                    : <Navigation size={9} className="flex-none text-[#377CF6]" />}
                  <span className="truncate">{segment.transfer?.replace(/\.\s*$/, '') || 'Compare transfer'}</span>
                </button>
              )}
              <JourneyStopCard
                segment={segment}
                index={index}
                active={active}
                onSelect={() => onSelectDay(segment.firstDayId)}
              />
            </div>
          )
        })}
      </div>

      {(transportResult || transportError) && (
        <div className="mt-2 rounded-[18px] border border-[#AFCBF0]/25 bg-[linear-gradient(145deg,rgba(245,250,255,.92),rgba(255,255,255,.72))] p-3 dark:border-white/8 dark:bg-white/4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[.13em] text-[#377CF6]">
                <Sparkles size={10} />
                Provider-backed transfer comparison
              </div>
              {transportResult && (
                <div className="mt-1 text-[11px] font-semibold text-content">
                  {transportResult.origin} → {transportResult.destination}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => { setTransportResult(null); setTransportError('') }}
              className="rounded-full p-1 text-content-faint hover:bg-surface-hover"
              aria-label="Close transfer comparison"
            >
              <X size={12} />
            </button>
          </div>

          {transportError ? (
            <p className="mt-2 text-[10px] leading-relaxed text-danger">{transportError}</p>
          ) : transportResult ? (
            <>
              <div className="mt-2 grid gap-2">
                {transportResult.options.slice(0, 4).map(option => (
                  <div
                    key={option.id}
                    className={`rounded-[14px] border px-3 py-2.5 ${
                      option.recommended
                        ? 'border-[#377CF6]/25 bg-[#377CF6]/7'
                        : 'border-edge-faint bg-white/60 dark:bg-white/4'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        {option.mode === 'drive'
                          ? <Car size={12} className="flex-none text-[#377CF6]" />
                          : <TrainFront size={12} className="flex-none text-[#377CF6]" />}
                        <span className="truncate text-[10px] font-semibold text-content">{option.label}</span>
                        {option.recommended && (
                          <span className="rounded-full bg-[#377CF6] px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-[.06em] text-white">
                            Recommended
                          </span>
                        )}
                      </div>
                      <span className="flex-none text-[10px] font-semibold text-content">{option.durationLabel}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-[9px] text-content-faint">
                      {option.departurePoint && option.arrivalPoint && <span>{option.departurePoint} → {option.arrivalPoint}</span>}
                      {option.transfers != null && <span>{option.transfers} transfer{option.transfers === 1 ? '' : 's'}</span>}
                      {option.distanceKm != null && <span>{option.distanceKm} km</span>}
                      <span>{option.sourceBacked ? `Source: ${option.source}` : option.source}</span>
                    </div>
                    <div className="mt-1 text-[9px] text-content-faint">{option.fareLabel}</div>
                  </div>
                ))}
              </div>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <p className="max-w-[420px] text-[9px] leading-relaxed text-content-faint">
                  {transportResult.summary} Times can change; Voya does not claim live fare or seat availability.
                </p>
                {onAddTransport && (
                  <button
                    type="button"
                    onClick={() => {
                      const target = segments.find(segment =>
                        segment.destination.toLowerCase() === transportResult.destination.split(',')[0].trim().toLowerCase()
                      )
                      if (target) onAddTransport(target.firstDayId)
                    }}
                    className="rounded-full bg-[#377CF6] px-3 py-1.5 text-[9px] font-semibold text-white shadow-[0_6px_16px_rgba(55,124,246,.20)]"
                  >
                    Add transport in TREK
                  </button>
                )}
              </div>
            </>
          ) : null}
        </div>
      )}
    </section>
  )
}


function JourneyStopCard({
  segment,
  index,
  active,
  onSelect,
}: {
  segment: JourneySegment
  index: number
  active: boolean
  onSelect: () => void
}) {
  const { visual, loading } = useDestinationVisual(
    segment.destination,
    segment.country || '',
    [segment.destination, segment.country].filter(Boolean).join(', '),
  )

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`group relative min-w-[132px] overflow-hidden rounded-[16px] border text-left transition-all ${
        active
          ? 'border-[#377CF6]/30 shadow-[0_9px_22px_rgba(55,124,246,.22)]'
          : 'border-edge-faint hover:-translate-y-px hover:border-[#377CF6]/20'
      }`}
    >
      {visual ? (
        <>
          <img
            src={visual.url}
            alt=""
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
          />
          <div className={`absolute inset-0 ${
            active
              ? 'bg-[linear-gradient(180deg,rgba(18,64,132,.22),rgba(24,84,187,.80))]'
              : 'bg-[linear-gradient(180deg,rgba(4,17,33,.18),rgba(4,17,33,.76))]'
          }`} />
        </>
      ) : (
        <>
          <div className={`absolute inset-0 ${
            active
              ? 'bg-[linear-gradient(145deg,#4D8DF9,#286CE4)]'
              : 'bg-[linear-gradient(145deg,rgba(243,249,255,.96),rgba(230,241,255,.88))] dark:bg-[linear-gradient(145deg,rgba(18,38,64,.94),rgba(9,24,42,.90))]'
          }`} />
          {loading && !active && (
            <div className="absolute inset-0 animate-pulse bg-[linear-gradient(100deg,transparent_15%,rgba(255,255,255,.45)_44%,transparent_72%)] bg-[length:220%_100%]" />
          )}
        </>
      )}

      <div className="relative z-10 px-3 py-2.5">
        <div className={`text-[8px] font-semibold uppercase tracking-[.1em] ${
          visual || active ? 'text-white/58' : 'text-content-faint'
        }`}>
          Stop {index + 1}
        </div>
        <div className={`mt-0.5 max-w-[118px] truncate text-[11px] font-semibold ${
          visual || active ? 'text-white' : 'text-content'
        }`}>
          {segment.destination}
        </div>
        <div className={`mt-0.5 text-[9px] ${
          visual || active ? 'text-white/68' : 'text-content-faint'
        }`}>
          {segment.dayCount} day{segment.dayCount === 1 ? '' : 's'}
        </div>
      </div>

      {visual && (
        <div
          className="absolute bottom-1.5 right-1.5 z-20 h-1.5 w-1.5 rounded-full bg-white/65 shadow-[0_0_0_2px_rgba(0,0,0,.16)]"
          title={visual.source === 'google' ? 'Google photo' : `${visual.source} photo`}
        />
      )}
    </button>
  )
}
