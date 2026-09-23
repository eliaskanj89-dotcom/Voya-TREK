import { useEffect, useMemo, useState } from 'react'
import { Clock, Hotel, MapPin, Navigation, TimerReset } from 'lucide-react'
import type { Accommodation, Assignment, AssignmentsMap, Day, Reservation } from '../../types'
import { assignmentsApi } from '../../api/client'
import { useToast } from '../shared/Toast'
import { useTripStore } from '../../store/tripStore'
import { findTodayDayId } from './today'
import { getDayBookendHotels } from '../../utils/dayOrder'
import { getNavigationTargets, openNavigationTarget } from './placeNavigation'

interface VoyaLiveTripCardProps {
  tripId: number
  days: Day[]
  assignments: AssignmentsMap
  accommodations: Accommodation[]
  reservations: Reservation[]
  selectedDayId: number | null
  onOpenToday?: (dayId: number) => void
  onRouteRefresh?: () => void
  compact?: boolean
}

const parseTime = (value?: string | null): number | null => {
  if (!value) return null
  const match = value.match(/^(\d{1,2}):(\d{2})/)
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || hours > 23 || minutes > 59) return null
  return hours * 60 + minutes
}

const formatClock = (minutes: number): string => {
  const value = ((Math.round(minutes) % 1440) + 1440) % 1440
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`
}

const effectiveStart = (assignment: Assignment): string | null =>
  assignment.assignment_time ?? assignment.place?.place_time ?? null

const effectiveEnd = (assignment: Assignment): string | null =>
  assignment.assignment_end_time ?? assignment.place?.end_time ?? null

export default function VoyaLiveTripCard({
  tripId,
  days,
  assignments,
  accommodations,
  reservations,
  selectedDayId,
  onOpenToday,
  onRouteRefresh,
  compact = false,
}: VoyaLiveTripCardProps) {
  const toast = useToast()
  const [clock, setClock] = useState(() => new Date())
  const [shifting, setShifting] = useState(false)

  useEffect(() => {
    const timer = window.setInterval(() => setClock(new Date()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  const todayDayId = useMemo(() => findTodayDayId(days, clock), [days, clock])
  const todayDay = todayDayId == null ? null : days.find(day => day.id === todayDayId) ?? null
  const nowMinutes = clock.getHours() * 60 + clock.getMinutes()
  const todayAssignments = todayDayId == null ? [] : assignments[String(todayDayId)] ?? []

  const timedAssignments = useMemo(
    () => todayAssignments
      .map(assignment => ({ assignment, start: parseTime(effectiveStart(assignment)) }))
      .filter((row): row is { assignment: Assignment; start: number } => row.start != null)
      .sort((a, b) => a.start - b.start || a.assignment.order_index - b.assignment.order_index),
    [todayAssignments],
  )

  const next = timedAssignments.find(row => row.start >= nowMinutes) ?? null

  const bookends = useMemo(
    () => todayDay ? getDayBookendHotels(todayDay, days, accommodations) : {},
    [todayDay, days, accommodations],
  )

  const transportToday = useMemo(() => {
    if (todayDayId == null) return null
    const candidates = reservations
      .filter(reservation => {
        if (reservation.accommodation_id != null) return false
        if (reservation.day_id !== todayDayId && reservation.end_day_id !== todayDayId) return false
        const kind = String(reservation.type || '').toLowerCase()
        return !!reservation.endpoints?.length || /(flight|train|rail|bus|ferry|transport|transfer)/.test(kind)
      })
      .map(reservation => ({
        reservation,
        start: parseTime(reservation.reservation_time),
      }))
      .sort((a, b) => (a.start ?? 9999) - (b.start ?? 9999))
    return candidates.find(row => row.start == null || row.start >= nowMinutes) ?? candidates[0] ?? null
  }, [todayDayId, reservations, nowMinutes])
  const morning = bookends.morning
  const evening = bookends.evening
  const stayChanged = morning && evening && morning.id !== evening.id

  if (!todayDay) return null

  const minutesUntil = next ? Math.max(0, next.start - nowMinutes) : null
  const navigationTarget = next ? getNavigationTargets(next.assignment.place)[0] : undefined

  const shiftRemaining = async (minutes: number) => {
    const remaining = timedAssignments.filter(row =>
      row.start >= nowMinutes && row.assignment.accommodation_id == null,
    )
    if (!remaining.length) {
      toast.info('No remaining timed stops to move.')
      return
    }

    setShifting(true)
    try {
      await Promise.all(remaining.map(({ assignment, start }) => {
        const end = parseTime(effectiveEnd(assignment))
        return assignmentsApi.updateTime(tripId, assignment.id, {
          place_time: formatClock(start + minutes),
          end_time: end == null ? null : formatClock(end + minutes),
        })
      }))
      await useTripStore.getState().refreshDays(tripId)
      onRouteRefresh?.()
      toast.success(`Remaining timed stops moved ${minutes} minutes later.`)
    } catch {
      toast.error('Voya could not move the remaining stops.')
    } finally {
      setShifting(false)
    }
  }

  const dayLabel = todayDay.title || `Day ${todayDay.day_number ?? days.indexOf(todayDay) + 1}`
  const stayLabel = stayChanged
    ? `${morning?.place_name || 'Morning stay'} → ${evening?.place_name || 'Tonight’s stay'}`
    : evening?.place_name || morning?.place_name || 'No stay linked today'
  const stayTiming = [
    morning?.end_day_id === todayDay.id && morning.check_out ? `Check out ${morning.check_out.slice(0, 5)}` : '',
    evening?.start_day_id === todayDay.id && evening.check_in ? `Check in ${evening.check_in.slice(0, 5)}` : '',
  ].filter(Boolean).join(' · ')
  const transportEndpoints = transportToday?.reservation.endpoints
    ?.filter(endpoint => endpoint.role === 'from' || endpoint.role === 'to')
    .sort((a, b) => a.sequence - b.sequence)
    .map(endpoint => endpoint.name)
    .filter(Boolean)
  const transportTime = transportToday?.reservation.reservation_time?.slice(0, 5) || ''

  return (
    <section className={`voya-live-card ${compact ? 'voya-live-card-compact' : ''} rounded-[22px] border border-[#B9D5FA]/35 bg-[linear-gradient(145deg,rgba(10,32,60,.97),rgba(7,23,44,.95))] p-4 text-white shadow-[0_18px_46px_rgba(12,43,82,.22)]`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#79AEFF]/14 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[.12em] text-[#9DCAFF]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#79AEFF] shadow-[0_0_0_4px_rgba(121,174,255,.10)]" />
              Live today
            </span>
            <span className="text-[10px] text-white/42">device-local time</span>
          </div>
          <h3 className="voya-editorial mt-2 truncate text-[22px] font-medium tracking-[-.04em] text-white">{dayLabel}</h3>
        </div>
        {selectedDayId !== todayDayId && onOpenToday && (
          <button
            type="button"
            onClick={() => onOpenToday(todayDayId)}
            className="flex-none rounded-full bg-white px-3 py-1.5 text-[11px] font-semibold text-[#10213A]"
          >
            Open today
          </button>
        )}
      </div>

      <div className={`mt-3 grid gap-2.5 ${compact ? 'grid-cols-1' : transportToday ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
        <div className="rounded-[16px] border border-white/8 bg-white/7 px-3.5 py-3">
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[.11em] text-white/42">
            <Clock size={12} /> Up next
          </div>
          {next ? (
            <>
              <div className="mt-1.5 flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-white">{next.assignment.place?.name || 'Next stop'}</span>
                <span className="rounded-full bg-[#79AEFF]/12 px-2 py-0.5 text-[10px] font-semibold text-[#9DCAFF]">{formatClock(next.start)}</span>
              </div>
              <div className="mt-1 text-[11px] text-white/52">
                {minutesUntil === 0 ? 'Starting now' : `in ${minutesUntil} min`}
                {next.assignment.place?.address ? ` · ${next.assignment.place.address}` : ''}
              </div>
            </>
          ) : (
            <div className="mt-1.5 text-[12px] text-white/56">No later timed stops are scheduled.</div>
          )}
        </div>

        <div className="rounded-[16px] border border-white/8 bg-white/7 px-3.5 py-3">
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[.11em] text-white/42">
            <Hotel size={12} /> Stay context
          </div>
          <div className="mt-1.5 truncate text-[13px] font-semibold text-white">{stayLabel}</div>
          <div className="mt-1 text-[11px] text-white/52">
            {stayTiming || evening?.place_address || morning?.place_address || 'Add a stay to make Voya base-aware.'}
          </div>
        </div>

        {transportToday && (
          <div className="rounded-[16px] border border-white/8 bg-white/7 px-3.5 py-3">
            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[.11em] text-white/42">
              <Navigation size={12} /> Booked transport
            </div>
            <div className="mt-1.5 truncate text-[13px] font-semibold text-white">{transportToday.reservation.title}</div>
            <div className="mt-1 text-[11px] text-white/52">
              {[transportTime, transportEndpoints?.length ? transportEndpoints.join(' → ') : transportToday.reservation.location].filter(Boolean).join(' · ') || 'Check reservation details'}
            </div>
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {navigationTarget && (
          <button
            type="button"
            onClick={() => openNavigationTarget(navigationTarget)}
            className="inline-flex items-center gap-1.5 rounded-full bg-[#377CF6] px-3.5 py-2 text-[11px] font-semibold text-white shadow-[0_8px_18px_rgba(55,124,246,.24)]"
          >
            <Navigation size={13} />
            Navigate
          </button>
        )}
        <button
          type="button"
          disabled={shifting}
          onClick={() => { void shiftRemaining(30) }}
          className="inline-flex items-center gap-1.5 rounded-full border border-white/12 bg-white/8 px-3.5 py-2 text-[11px] font-semibold text-white/88 disabled:opacity-50"
        >
          {shifting ? <TimerReset size={13} className="animate-pulse" /> : <TimerReset size={13} />}
          Running 30 min late
        </button>
        {stayChanged && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#F4C978]/15 bg-[#F4C978]/8 px-3 py-2 text-[10px] font-semibold text-[#F5D898]">
            <MapPin size={11} />
            Transfer day
          </span>
        )}
      </div>
    </section>
  )
}
