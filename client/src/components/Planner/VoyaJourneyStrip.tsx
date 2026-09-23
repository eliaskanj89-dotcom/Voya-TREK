import { Navigation } from 'lucide-react'
import type { Day } from '../../types'

interface JourneySegment {
  destination: string
  country?: string
  firstDayId: number
  dayCount: number
  transfer?: string
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
      dayCount: 1,
      transfer,
    })
  }
  return segments
}

export default function VoyaJourneyStrip({
  days,
  selectedDayId,
  onSelectDay,
  compact = false,
}: {
  days: Day[]
  selectedDayId: number | null
  onSelectDay: (dayId: number) => void
  compact?: boolean
}) {
  const segments = voyaJourneySegments(days)
  if (segments.length < 2) return null

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
                <div className="flex max-w-[130px] items-center gap-1 rounded-full bg-[#377CF6]/6 px-2 py-1 text-[9px] font-medium text-content-faint">
                  <Navigation size={9} className="flex-none text-[#377CF6]" />
                  <span className="truncate">{segment.transfer?.replace(/\.\s*$/, '') || 'Transfer'}</span>
                </div>
              )}
              <button
                type="button"
                onClick={() => onSelectDay(segment.firstDayId)}
                className={`rounded-[14px] border px-3 py-2 text-left transition-all ${
                  active
                    ? 'border-[#377CF6]/25 bg-[#377CF6] text-white shadow-[0_8px_18px_rgba(55,124,246,.20)]'
                    : 'border-edge-faint bg-white/60 text-content hover:border-[#377CF6]/20 dark:bg-white/4'
                }`}
              >
                <div className={`text-[8px] font-semibold uppercase tracking-[.1em] ${active ? 'text-white/55' : 'text-content-faint'}`}>
                  Stop {index + 1}
                </div>
                <div className="max-w-[120px] truncate text-[11px] font-semibold">{segment.destination}</div>
                <div className={`text-[9px] ${active ? 'text-white/65' : 'text-content-faint'}`}>
                  {segment.dayCount} day{segment.dayCount === 1 ? '' : 's'}
                </div>
              </button>
            </div>
          )
        })}
      </div>
    </section>
  )
}
