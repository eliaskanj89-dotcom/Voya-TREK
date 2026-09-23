import { useMemo, useState } from 'react'
import { Car, FileText, Pencil, Sparkles, TrainFront, Trash2 } from 'lucide-react'
import { RES_ICONS } from '../../../../components/Planner/DayPlanSidebar.constants'
import { splitReservationDateTime, formatTime, cleanAmountText } from '../../../../utils/formatters'
import { openFile } from '../../../../utils/fileDownload'
import { useTranslation } from '../../../../i18n'
import type { VoyaTransportAdviceResult } from '@trek/shared'
import type { Reservation } from '../../../../types'
import { voyaAiApi } from '../../../../api/client'
import { voyaJourneySegments } from '../../../../components/Planner/VoyaJourneyStrip'
import MConfirmSheet from '../../settings/MConfirmSheet'
import { ConfirmationCode, Field, ReservationPluginSlots, SectionHeader, StatusDot, TabScroller, TravelerAvatars, TravelerFilterRow } from './tabChrome'
import { STATUS_COLOR, type MTabScreenProps } from './tabModel'
import {
  TRANSPORT_TYPE_COLOR,
  groupTransports,
  orderedEndpoints,
  parseTransportMeta,
} from './transportsModel'

/**
 * Tab 1 — Transporte. Real `planner.reservations` filtered to the 10 transport
 * types, grouped Confirmed / Pending / Automated-Transit like the desktop
 * panel. The shell owns the header (Add transport / import / AirTrail / compact
 * toggle); this panel is the list. A row tap opens the existing transport
 * detail sheet; the status dot, edit and delete are gated on `day_edit` (the
 * convention MTransportSheet / MDaySheet already use for transports).
 */
export default function MTransportsTab({ planner, shell }: MTabScreenProps) {
  const { t, reservations, days } = planner
  const [travelerFilter, setTravelerFilter] = useState<Set<number>>(new Set())
  const journeySegments = useMemo(() => voyaJourneySegments(days), [days])
  const [voyaAdviceLoading, setVoyaAdviceLoading] = useState<string | null>(null)
  const [voyaAdvice, setVoyaAdvice] = useState<VoyaTransportAdviceResult | null>(null)
  const [voyaAdviceError, setVoyaAdviceError] = useState('')

  const compareTransfer = async (index: number) => {
    if (index <= 0 || index >= journeySegments.length) return
    const from = journeySegments[index - 1]
    const to = journeySegments[index]
    const key = `${from.destination}->${to.destination}`
    setVoyaAdviceLoading(key)
    setVoyaAdvice(null)
    setVoyaAdviceError('')
    try {
      const result = await voyaAiApi.transportAdvice({
        tripId: planner.tripId,
        dayId: to.firstDayId,
        origin: [from.destination, from.country].filter(Boolean).join(', '),
        destination: [to.destination, to.country].filter(Boolean).join(', '),
        departureDate: to.firstDayDate,
      })
      setVoyaAdvice(result)
    } catch {
      setVoyaAdviceError('Voya could not compare this transfer right now.')
    } finally {
      setVoyaAdviceLoading(null)
    }
  }

  const addTransportForAdvice = () => {
    if (!voyaAdvice) return
    const destinationName = voyaAdvice.destination.split(',')[0]?.trim().toLowerCase()
    const segment = journeySegments.find(item => item.destination.toLowerCase() === destinationName)
    if (!segment) return
    planner.setEditingTransport(null)
    planner.setTransportModalDayId(segment.firstDayId)
    planner.setShowTransportModal(true)
  }
  const allTransports = reservations.filter(r => planner.TRANSPORT_TYPES.has(r.type))
  const transports = travelerFilter.size === 0 ? allTransports : allTransports.filter(r => (r.travelers || []).some(tv => travelerFilter.has(tv.user_id)))
  const groups = groupTransports(transports, days)
  const canEdit = planner.can('day_edit', planner.trip)
  const showTravelerFilter = planner.tripMembers.length > 1 && allTransports.some(r => (r.travelers || []).length > 0)
  const toggleTravelerFilter = (id: number) => setTravelerFilter(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const toggle = (id: string) => setCollapsed(c => ({ ...c, [id]: !c[id] }))

  const sections = [
    { id: 'confirmed', label: t('reservations.confirmed'), rows: groups.confirmed },
    { id: 'pending', label: t('reservations.pending'), rows: groups.pending },
    { id: 'transit', label: t('reservations.type.transit'), rows: groups.transit },
  ].filter(s => s.rows.length > 0)

  return (
    <TabScroller>
      {journeySegments.length > 1 && (
        <section className="voya-mobile-transfer-intelligence mx-3 mt-2 rounded-[22px] border border-[color:var(--m-rowbr)] bg-[color:var(--m-glass)] p-3.5 backdrop-blur-[24px]">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-m-act text-m-actfg shadow-[0_8px_20px_rgba(55,124,246,.24)]">
              <Sparkles size={15} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[0.8125rem] font-semibold text-m-ink">Voya transfer intelligence</div>
              <p className="mt-0.5 font-geist text-[0.65625rem] leading-relaxed text-m-muted">
                Compare real scheduled transit with TREK road routing between your cities.
              </p>
            </div>
          </div>

          <div className="mt-3 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {journeySegments.slice(1).map((segment, offset) => {
              const index = offset + 1
              const previous = journeySegments[index - 1]
              const key = `${previous.destination}->${segment.destination}`
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => { void compareTransfer(index) }}
                  className="flex flex-none items-center gap-1.5 rounded-full border border-[color:var(--m-rowbr)] bg-m-card px-3 py-2 font-geist text-[0.625rem] font-semibold text-m-muted"
                >
                  {voyaAdviceLoading === key
                    ? <span className="h-3 w-3 animate-spin rounded-full border-2 border-m-act/30 border-t-m-act" />
                    : <TrainFront size={12} className="text-m-act" />}
                  {previous.destination} → {segment.destination}
                </button>
              )
            })}
          </div>

          {voyaAdviceError && (
            <div className="mt-3 rounded-[14px] bg-[rgba(220,65,65,.08)] px-3 py-2 font-geist text-[0.625rem] leading-relaxed text-[color:var(--m-st-danger)]">
              {voyaAdviceError}
            </div>
          )}

          {voyaAdvice && (
            <div className="mt-3 space-y-2">
              {voyaAdvice.options.slice(0, 3).map(option => (
                <div
                  key={option.id}
                  className={`rounded-[16px] border px-3 py-2.5 ${
                    option.recommended
                      ? 'border-m-act/25 bg-[rgba(55,124,246,.08)]'
                      : 'border-[color:var(--m-rowbr)] bg-m-card'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      {option.mode === 'drive'
                        ? <Car size={13} className="flex-none text-m-act" />
                        : <TrainFront size={13} className="flex-none text-m-act" />}
                      <span className="truncate text-[0.6875rem] font-semibold text-m-ink">{option.label}</span>
                      {option.recommended && (
                        <span className="rounded-full bg-m-act px-1.5 py-[2px] font-geist text-[0.46875rem] font-bold uppercase tracking-[.05em] text-m-actfg">
                          Pick
                        </span>
                      )}
                    </div>
                    <span className="flex-none font-geist text-[0.625rem] font-semibold text-m-ink">{option.durationLabel}</span>
                  </div>
                  <div className="mt-1 font-geist text-[0.5625rem] leading-relaxed text-m-faint">
                    {[option.departurePoint && option.arrivalPoint ? `${option.departurePoint} → ${option.arrivalPoint}` : '', option.transfers != null ? `${option.transfers} transfer${option.transfers === 1 ? '' : 's'}` : '', `Source: ${option.source}`].filter(Boolean).join(' · ')}
                  </div>
                  <div className="mt-1 font-geist text-[0.5625rem] text-m-faint">{option.fareLabel}</div>
                </div>
              ))}
              <button
                type="button"
                onClick={addTransportForAdvice}
                className="flex w-full items-center justify-center rounded-full bg-m-act px-3 py-[9px] text-[0.6875rem] font-semibold text-m-actfg shadow-[0_8px_20px_rgba(55,124,246,.20)]"
              >
                Add transport in TREK
              </button>
              <p className="font-geist text-[0.5625rem] leading-relaxed text-m-faint">
                Timings come from TREK’s configured providers. Fares and seat availability are not claimed live.
              </p>
            </div>
          )}
        </section>
      )}

      {showTravelerFilter && (
        <TravelerFilterRow
          members={planner.tripMembers}
          active={travelerFilter}
          onToggle={toggleTravelerFilter}
          onClear={() => setTravelerFilter(new Set())}
          label={t('reservations.travelers.label')}
          allLabel={t('common.all')}
        />
      )}
      {sections.length === 0 ? (
        <div className="flex flex-col items-center justify-center px-8 py-10 text-center">
          <div aria-hidden className="voya-mobile-orb mb-4 flex h-[68px] w-[68px] items-center justify-center rounded-full">
            <span className="voya-wordmark text-[28px] text-white">V</span>
          </div>
          <p className="font-geist text-[0.8125rem] font-medium text-m-muted">{t('mobileTrip.transportsEmpty')}</p>
        </div>
      ) : sections.map(section => (
        <div key={section.id}>
          <SectionHeader
            label={section.label}
            count={section.rows.length}
            open={!collapsed[section.id]}
            onToggle={() => toggle(section.id)}
          />
          {!collapsed[section.id] &&
            section.rows.map(res => (
              <TransportCard
                key={res.id}
                res={res}
                planner={planner}
                shell={shell}
                canEdit={canEdit}
                compact={shell.transportsCompact}
              />
            ))}
        </div>
      ))}
    </TabScroller>
  )
}

function TransportCard({ res, planner, shell, canEdit, compact }: {
  res: Reservation
  planner: MTabScreenProps['planner']
  shell: MTabScreenProps['shell']
  canEdit: boolean
  compact: boolean
}) {
  const { t, days } = planner
  const { locale } = useTranslation()
  const timeFormat = planner.settings.time_format || '24h'
  const blurCodes = planner.settings.blur_booking_codes
  const [codeRevealed, setCodeRevealed] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const meta = parseTransportMeta(res)
  const TypeIcon = RES_ICONS[res.type as keyof typeof RES_ICONS] || RES_ICONS.other
  const typeColor = TRANSPORT_TYPE_COLOR[res.type] || '#6b7280'
  const isTransit = res.type === 'transit'
  const confirmed = res.status === 'confirmed'
  const dotColor = isTransit ? STATUS_COLOR.info : confirmed ? STATUS_COLOR.confirmed : STATUS_COLOR.pending
  const tint = isTransit ? 'rgba(74,125,219,.10)' : confirmed ? 'rgba(47,163,122,.10)' : 'rgba(232,161,58,.12)'

  const startDay = res.day_id != null ? days.find(d => d.id === res.day_id) : undefined
  const endDay = res.end_day_id != null ? days.find(d => d.id === res.end_day_id) : undefined
  const startDt = splitReservationDateTime(res.reservation_time)
  const endDt = splitReservationDateTime(res.reservation_end_time)

  const fmtDate = (date: string) =>
    new Date(`${date}T00:00:00Z`).toLocaleDateString(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' })
  const dayLabel = (day: NonNullable<typeof startDay>) => day.title || t('dayplan.dayN', { n: day.day_number })

  const eps = orderedEndpoints(res)
  const hasEndpoints = eps.some(e => e.role === 'from') && eps.some(e => e.role === 'to')

  const metaCells: { label: string; value: string }[] = []
  if (meta.airline) metaCells.push({ label: t('reservations.meta.airline'), value: meta.airline })
  if (meta.flight_number) metaCells.push({ label: t('reservations.meta.flightNumber'), value: meta.flight_number })
  if (!hasEndpoints && meta.departure_airport) metaCells.push({ label: t('reservations.meta.from'), value: meta.departure_airport })
  if (!hasEndpoints && meta.arrival_airport) metaCells.push({ label: t('reservations.meta.to'), value: meta.arrival_airport })
  if (meta.train_number) metaCells.push({ label: t('reservations.meta.trainNumber'), value: meta.train_number })
  if (meta.platform) metaCells.push({ label: t('reservations.meta.platform'), value: meta.platform })
  if (meta.seat) metaCells.push({ label: t('reservations.meta.seat'), value: meta.seat + (meta.class ? ` · ${meta.class}` : '') })
  if (meta.price != null && meta.price !== '') {
    metaCells.push({ label: t('reservations.price'), value: `${cleanAmountText(meta.price)}${meta.priceCurrency ? ` ${meta.priceCurrency}` : ''}` })
  }

  const files = (planner.files || []).filter(
    f => !f.deleted_at && (f.reservation_id === res.id || (f.linked_reservation_ids || []).includes(res.id)),
  )

  const openDetail = () => shell.openSheet('transport', { reservationId: res.id })
  const toggleStatus = async () => {
    try {
      await planner.tripActions.toggleReservationStatus(planner.tripId, res.id)
    } catch {
      planner.toast.error(t('reservations.toast.updateError'))
    }
  }
  const editTransport = () => {
    planner.setEditingTransport(res)
    planner.setTransportModalDayId(res.day_id ?? null)
    planner.setShowTransportModal(true)
  }

  const timeValue = startDt.time
    ? `${formatTime(startDt.time, locale, timeFormat)}${endDt.time ? ` – ${formatTime(endDt.time, locale, timeFormat)}` : ''}`
    : '—'
  const dayValue = startDay
    ? `${dayLabel(startDay)}${endDay && endDay.id !== startDay.id ? ` – ${dayLabel(endDay)}` : ''}`
    : startDt.date
      ? fmtDate(startDt.date)
      : '—'

  return (
    <div className="mt-2 overflow-hidden rounded-2xl border border-[color:var(--m-rowbr)] bg-[color:var(--m-ic)]">
      {/* Header */}
      <div className="flex items-center gap-[7px] border-b border-[color:var(--m-rowbr)] px-3 py-[10px]" style={{ background: tint }}>
        {canEdit ? (
          <button
            type="button"
            onClick={toggleStatus}
            aria-label={confirmed ? t('reservations.pending') : t('reservations.confirmed')}
            className="-m-1 flex-none p-1"
          >
            <StatusDot color={dotColor} />
          </button>
        ) : (
          <StatusDot color={dotColor} />
        )}
        <button
          type="button"
          onClick={openDetail}
          className="flex min-w-0 flex-1 items-center gap-[7px] text-left"
        >
          <span className="inline-flex flex-none items-center gap-1 rounded-full border border-[color:var(--m-rowbr)] bg-m-card px-2 py-[2px] font-geist text-[0.5625rem] font-bold uppercase tracking-[.06em] text-m-muted">
            <TypeIcon size={10} strokeWidth={2.2} style={{ color: typeColor }} />
            {t(`reservations.type.${res.type}`)}
          </span>
          <span className="min-w-0 flex-1 truncate text-[0.78125rem] font-bold text-m-ink">{res.title}</span>
          {!!res.needs_review && (
            <span className="flex-none rounded-full bg-[rgba(232,161,58,.16)] px-2 py-[2px] font-geist text-[0.5rem] font-bold uppercase tracking-[.03em] text-[color:var(--m-st-pending)]">
              {t('reservations.needsReview')}
            </span>
          )}
        </button>
        {canEdit && (
          <button
            type="button"
            onClick={editTransport}
            aria-label={t('common.edit')}
            className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-full bg-[color:var(--m-ic)] text-m-muted"
          >
            <Pencil size={12} strokeWidth={2} />
          </button>
        )}
        {canEdit && (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            aria-label={t('common.delete')}
            className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-full bg-[color:var(--m-ic)] text-m-muted"
          >
            <Trash2 size={12} strokeWidth={2} />
          </button>
        )}
      </div>

      {/* Body — split around the booking code so the reveal can be its own
          control instead of a click handler buried inside the card button. */}
      {!compact && (
        <div className="px-3 pb-3 pt-[9px]">
          <button type="button" onClick={openDetail} className="block w-full text-left">
            <div className="flex gap-2">
              <Field label={t('reservations.date')} className="flex-[1.4]">{dayValue}</Field>
              <Field label={t('reservations.time')} className="flex-1" tabular>{timeValue}</Field>
            </div>
          </button>

          {res.confirmation_number && (
            <ConfirmationCode
              code={res.confirmation_number}
              label={t('reservations.confirmationCode')}
              blurred={!!blurCodes && !codeRevealed}
              onToggle={blurCodes ? () => setCodeRevealed(v => !v) : undefined}
            />
          )}

          <button type="button" onClick={openDetail} className="block w-full text-left">
            {eps.length >= 2 && (
              <div className="mt-2 flex flex-wrap items-center justify-center gap-2 rounded-[10px] border border-[color:var(--m-rowbr)] bg-m-card px-[10px] py-2 text-[0.71875rem] font-semibold text-m-ink">
                {eps.map((ep, i) => (
                  <span key={i} className="inline-flex min-w-0 items-center gap-2">
                    {i > 0 && <TypeIcon size={12} strokeWidth={2.2} className="flex-none" style={{ color: typeColor }} />}
                    <span className="truncate">{ep.name}</span>
                  </span>
                ))}
              </div>
            )}

            {metaCells.length > 0 && (
              <div className="mt-2 flex gap-2">
                {metaCells.slice(0, 3).map((c, i) => (
                  <Field key={i} label={c.label} className="flex-1">{c.value}</Field>
                ))}
              </div>
            )}

            <TravelerAvatars travelers={res.travelers || []} label={t('reservations.travelers.label')} />

            {files.length > 0 && (
              <div className="mt-2">
                <div className="mb-[3px] font-geist text-[0.5625rem] font-bold uppercase tracking-[.08em] text-m-faint">
                  {t('files.title')}
                </div>
                <div className="flex flex-col gap-1">
                  {files.map(f => (
                    <span
                      key={f.id}
                      role="button"
                      tabIndex={0}
                      onClick={e => { e.stopPropagation(); openFile(f.url, f.original_name) }}
                      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); openFile(f.url, f.original_name) } }}
                      className="flex items-center gap-[6px] rounded-[10px] border border-[color:var(--m-rowbr)] bg-m-card px-[10px] py-[7px]"
                    >
                      <FileText size={12} strokeWidth={2} className="flex-none text-m-muted" />
                      <span className="truncate font-geist text-[0.65625rem] font-semibold text-m-muted">{f.original_name}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </button>
        </div>
      )}
      {!compact && <ReservationPluginSlots tripId={planner.tripId} reservationId={res.id} />}

      <MConfirmSheet
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={t('reservations.confirm.deleteTitle')}
        message={t('reservations.confirm.deleteBody', { name: res.title })}
        confirmLabel={t('common.delete')}
        cancelLabel={t('common.cancel')}
        danger
        onConfirm={() => {
          setConfirmDelete(false)
          Promise.resolve(planner.handleDeleteReservation(res.id)).catch(() =>
            planner.toast.error(t('reservations.toast.deleteError')),
          )
        }}
      />
    </div>
  )
}
