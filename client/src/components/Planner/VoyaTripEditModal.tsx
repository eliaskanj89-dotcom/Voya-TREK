import { useMemo, useState } from 'react'
import { Check, ChevronDown, ChevronRight, Sparkles } from 'lucide-react'
import type { Day, VoyaDayEditDraft, VoyaTripEditPlan } from '@trek/shared'
import Modal from '../shared/Modal'
import { voyaAiApi } from '../../api/client'
import { getApiErrorMessage, type AssignmentsMap } from '../../types'

interface VoyaTripEditModalProps {
  isOpen: boolean
  onClose: () => void
  tripId: number
  tripTitle: string
  days: Day[]
  assignments: AssignmentsMap
  onDayApplied: (dayId: number) => Promise<void> | void
}

const EXAMPLES = [
  'Make the whole trip less rushed',
  'Add more local food and fewer touristy stops',
  'Reduce backtracking across the trip',
  'Give the evenings more personality',
]

export default function VoyaTripEditModal({
  isOpen,
  onClose,
  tripId,
  tripTitle,
  days,
  assignments,
  onDayApplied,
}: VoyaTripEditModalProps) {
  const [instruction, setInstruction] = useState('')
  const [plan, setPlan] = useState<VoyaTripEditPlan | null>(null)
  const [drafts, setDrafts] = useState<Record<number, VoyaDayEditDraft>>({})
  const [openDays, setOpenDays] = useState<Set<number>>(new Set())
  const [planning, setPlanning] = useState(false)
  const [previewingDay, setPreviewingDay] = useState<number | null>(null)
  const [previewingAll, setPreviewingAll] = useState(false)
  const [previewProgress, setPreviewProgress] = useState({ current: 0, total: 0 })
  const [applyingAll, setApplyingAll] = useState(false)
  const [error, setError] = useState('')

  const dayById = useMemo(() => new Map(days.map(day => [day.id, day])), [days])
  const busy = planning || previewingDay != null || previewingAll || applyingAll
  const allReady = !!plan && plan.affectedDays.every(item => drafts[item.dayId] != null)
  const readyCount = plan ? plan.affectedDays.filter(item => drafts[item.dayId] != null).length : 0

  const reset = () => {
    if (busy) return
    setInstruction('')
    setPlan(null)
    setDrafts({})
    setOpenDays(new Set())
    setPreviewProgress({ current: 0, total: 0 })
    setError('')
    onClose()
  }

  const planTrip = async () => {
    const text = instruction.trim()
    if (text.length < 3) {
      setError('Tell Voya what you want to change across the trip.')
      return
    }
    setPlanning(true)
    setError('')
    setPlan(null)
    setDrafts({})
    try {
      const result = await voyaAiApi.planTripEdit({ tripId, instruction: text })
      setPlan(result.plan)
      setOpenDays(new Set(result.plan.affectedDays.slice(0, 1).map(item => item.dayId)))
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, 'Voya could not plan this trip edit right now.'))
    } finally {
      setPlanning(false)
    }
  }

  const previewDay = async (dayId: number, dayInstruction: string) => {
    setPreviewingDay(dayId)
    setError('')
    try {
      const result = await voyaAiApi.planDayEdit({
        tripId,
        dayId,
        instruction: dayInstruction,
      })
      setDrafts(current => ({ ...current, [dayId]: result.draft }))
      setOpenDays(current => new Set(current).add(dayId))
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, 'Voya could not preview this day edit.'))
    } finally {
      setPreviewingDay(null)
    }
  }

  const previewAll = async () => {
    if (!plan) return
    setPreviewingAll(true)
    setError('')
    const missing = plan.affectedDays.filter(item => drafts[item.dayId] == null)
    setPreviewProgress({ current: 0, total: missing.length })
    const nextDrafts = { ...drafts }

    try {
      for (let index = 0; index < missing.length; index++) {
        const item = missing[index]
        setPreviewProgress({ current: index + 1, total: missing.length })
        const result = await voyaAiApi.planDayEdit({
          tripId,
          dayId: item.dayId,
          instruction: item.instruction,
        })
        nextDrafts[item.dayId] = result.draft
        setDrafts({ ...nextDrafts })
      }
      setOpenDays(new Set(plan.affectedDays.map(item => item.dayId)))
    } catch (err: unknown) {
      setError(getApiErrorMessage(
        err,
        'Voya could not finish every day preview. Completed previews were kept; try the remaining days again.',
      ))
    } finally {
      setPreviewingAll(false)
      setPreviewProgress({ current: 0, total: 0 })
    }
  }

  const applyAll = async () => {
    if (!plan || !allReady) return
    setApplyingAll(true)
    setError('')
    try {
      const orderedDrafts = plan.affectedDays.map(item => drafts[item.dayId]).filter(Boolean)
      await voyaAiApi.applyTripEdit({ plan, drafts: orderedDrafts })
      await onDayApplied(plan.affectedDays[0]?.dayId ?? days[0]?.id ?? 0)
      setInstruction('')
      setPlan(null)
      setDrafts({})
      setOpenDays(new Set())
      onClose()
    } catch (err: unknown) {
      setError(getApiErrorMessage(
        err,
        'The trip changed after these previews were created. Nothing was applied. Refresh the affected previews and try again.',
      ))
    } finally {
      setApplyingAll(false)
    }
  }

  const toggleDay = (dayId: number) => {
    setOpenDays(current => {
      const next = new Set(current)
      if (next.has(dayId)) next.delete(dayId)
      else next.add(dayId)
      return next
    })
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={reset}
      size="2xl"
      title={
        <span className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#377CF6] text-white shadow-[0_8px_20px_rgba(55,124,246,.24)]">
            <Sparkles size={14} strokeWidth={2.3} />
          </span>
          <span className="voya-editorial text-[23px] font-medium tracking-[-.04em]">Ask Voya · Whole trip</span>
        </span>
      }
    >
      {!plan ? (
        <div className="space-y-5">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[.14em] text-[#377CF6]">{tripTitle}</div>
            <h3 className="voya-editorial mt-1 text-[30px] font-medium tracking-[-.045em] text-content">What should feel different?</h3>
            <p className="mt-2 max-w-2xl text-body leading-relaxed text-content-muted">
              Voya first decides which days actually need changes. Good days stay untouched.
            </p>
          </div>

          <textarea
            autoFocus
            value={instruction}
            onChange={event => setInstruction(event.target.value)}
            rows={5}
            placeholder="Make the trip less rushed, cut unnecessary backtracking, keep the must-see places, and make the food choices more local."
            className="w-full resize-none rounded-[20px] border border-edge bg-surface-input px-4 py-3 text-body leading-relaxed text-content outline-none placeholder:text-content-faint focus:border-[#377CF6] focus:ring-4 focus:ring-[#377CF6]/10"
          />

          <div className="flex flex-wrap gap-2">
            {EXAMPLES.map(example => (
              <button
                key={example}
                type="button"
                onClick={() => setInstruction(example)}
                className="rounded-full border border-edge px-3 py-1.5 text-caption font-medium text-content-muted hover:border-[#377CF6]/35 hover:bg-[#377CF6]/5 hover:text-[#377CF6]"
              >
                {example}
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between gap-4 border-t border-edge-faint pt-4">
            <p className="text-caption leading-relaxed text-content-faint">
              Planning does not modify the trip. You review every affected day before anything is applied.
            </p>
            <button
              type="button"
              onClick={() => { void planTrip() }}
              disabled={planning}
              className="inline-flex items-center gap-2 rounded-full bg-[#377CF6] px-5 py-2.5 text-body font-semibold text-white shadow-[0_10px_24px_rgba(55,124,246,.24)] hover:bg-[#286CE4] disabled:opacity-60"
            >
              {planning ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/35 border-t-white" />
                  Reading trip…
                </>
              ) : (
                <>
                  <Sparkles size={15} />
                  Plan changes
                </>
              )}
            </button>
          </div>
        </div>
      ) : (
        <div>
          <div className="mb-5 rounded-[22px] border border-[#BBD5F6]/35 bg-[linear-gradient(145deg,rgba(242,248,255,.92),rgba(255,255,255,.78))] p-4 dark:border-white/8 dark:bg-white/4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-[11px] font-semibold uppercase tracking-[.14em] text-[#377CF6]">
                {plan.affectedDays.length} day{plan.affectedDays.length === 1 ? '' : 's'} affected
              </div>
              <div className="rounded-full bg-[#377CF6]/8 px-2.5 py-1 text-[10px] font-semibold text-[#377CF6]">
                {readyCount}/{plan.affectedDays.length} reviewed
              </div>
            </div>
            <p className="mt-2 text-body leading-relaxed text-content-muted">{plan.summary}</p>
            <p className="mt-2 text-[10px] font-medium text-content-faint">
              Whole-trip apply is atomic: if any reviewed day is stale or invalid, Voya applies nothing.
            </p>
          </div>

          <div className="space-y-2.5">
            {plan.affectedDays.map(item => {
              const day = dayById.get(item.dayId)
              const dayIndex = days.findIndex(candidate => candidate.id === item.dayId)
              const label = day?.title || `Day ${day?.day_number ?? dayIndex + 1}`
              const draft = drafts[item.dayId]
              const open = openDays.has(item.dayId)
              const existing = assignments[String(item.dayId)] || []

              return (
                <section key={item.dayId} className="overflow-hidden rounded-[20px] border border-edge-faint bg-surface-card">
                  <button
                    type="button"
                    onClick={() => toggleDay(item.dayId)}
                    className="flex w-full items-center gap-3 px-4 py-3.5 text-left"
                  >
                    <span className={`flex h-8 w-8 flex-none items-center justify-center rounded-full text-[11px] font-bold ${
                      draft ? 'bg-emerald-500 text-white' : 'bg-[#377CF6]/10 text-[#377CF6]'
                    }`}>
                      {draft ? <Check size={14} strokeWidth={2.6} /> : (day?.day_number ?? dayIndex + 1)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="voya-editorial block truncate text-[19px] font-medium tracking-[-.03em] text-content">{label}</span>
                      <span className="mt-0.5 block text-caption text-content-muted">{item.reason}</span>
                    </span>
                    {open ? <ChevronDown size={16} className="text-content-faint" /> : <ChevronRight size={16} className="text-content-faint" />}
                  </button>

                  {open && (
                    <div className="border-t border-edge-faint px-4 pb-4 pt-3">
                      <div className="rounded-2xl bg-surface-tertiary px-3.5 py-3 text-caption leading-relaxed text-content-muted">
                        {item.instruction}
                      </div>

                      {!draft && (
                        <button
                          type="button"
                          onClick={() => { void previewDay(item.dayId, item.instruction) }}
                          disabled={busy}
                          className="mt-3 inline-flex items-center gap-2 rounded-full border border-[#377CF6]/25 bg-[#377CF6]/7 px-4 py-2 text-caption font-semibold text-[#377CF6] disabled:opacity-50"
                        >
                          {previewingDay === item.dayId ? (
                            <>
                              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#377CF6]/25 border-t-[#377CF6]" />
                              Designing day…
                            </>
                          ) : (
                            <>
                              <Sparkles size={13} />
                              Preview this day
                            </>
                          )}
                        </button>
                      )}

                      {draft && (
                        <div className="mt-3">
                          <div className="space-y-1.5">
                            {draft.sequence.map((sequenceItem, index) => {
                              const old = sequenceItem.kind === 'existing'
                                ? existing.find(assignment => assignment.id === sequenceItem.assignmentId)
                                : null
                              const name = sequenceItem.kind === 'existing'
                                ? old?.place?.name || 'Existing stop'
                                : sequenceItem.activity.name
                              const time = sequenceItem.kind === 'existing'
                                ? sequenceItem.startTime ?? old?.place?.place_time
                                : sequenceItem.activity.startTime
                              return (
                                <div key={sequenceItem.kind === 'existing' ? sequenceItem.assignmentId : `${index}-${name}`} className="flex items-center gap-2.5 rounded-xl bg-surface-tertiary px-3 py-2.5">
                                  <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-[#377CF6] text-[10px] font-bold text-white">{index + 1}</span>
                                  <span className="min-w-0 flex-1 truncate text-caption font-semibold text-content">{name}</span>
                                  {sequenceItem.kind === 'new' && <span className="rounded-full bg-[#377CF6]/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[.07em] text-[#377CF6]">New</span>}
                                  {time && <span className="text-[10px] font-medium text-content-faint">{time}</span>}
                                </div>
                              )
                            })}
                          </div>

                          {draft.removedAssignmentIds.length > 0 && (
                            <p className="mt-2 text-[10px] text-content-faint">
                              {draft.removedAssignmentIds.length} stop{draft.removedAssignmentIds.length === 1 ? '' : 's'} will be removed from this day, but remain saved in Places.
                            </p>
                          )}

                          <div className="mt-3 flex justify-end">
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => setDrafts(current => {
                                const next = { ...current }
                                delete next[item.dayId]
                                return next
                              })}
                              className="rounded-full border border-edge px-3 py-1.5 text-caption font-medium text-content-muted disabled:opacity-50"
                            >
                              Regenerate
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </section>
              )
            })}
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-edge-faint pt-4">
            <button
              type="button"
              onClick={() => {
                if (busy) return
                setPlan(null)
                setDrafts({})
                setOpenDays(new Set())
                setError('')
              }}
              disabled={busy}
              className="rounded-full border border-edge px-4 py-2 text-caption font-medium text-content-secondary hover:bg-surface-hover disabled:opacity-50"
            >
              New trip request
            </button>

            <div className="flex flex-wrap items-center gap-2">
              {!allReady && (
                <button
                  type="button"
                  onClick={() => { void previewAll() }}
                  disabled={busy}
                  className="inline-flex items-center gap-2 rounded-full border border-[#377CF6]/25 bg-[#377CF6]/7 px-4 py-2 text-caption font-semibold text-[#377CF6] disabled:opacity-50"
                >
                  {previewingAll ? (
                    <>
                      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#377CF6]/25 border-t-[#377CF6]" />
                      Previewing {previewProgress.current}/{previewProgress.total}
                    </>
                  ) : (
                    <>
                      <Sparkles size={13} />
                      Preview remaining days
                    </>
                  )}
                </button>
              )}

              <button
                type="button"
                onClick={() => { void applyAll() }}
                disabled={!allReady || busy}
                className="inline-flex items-center gap-2 rounded-full bg-[#377CF6] px-5 py-2.5 text-caption font-semibold text-white shadow-[0_8px_20px_rgba(55,124,246,.22)] disabled:cursor-not-allowed disabled:opacity-45"
              >
                {applyingAll ? (
                  <>
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/35 border-t-white" />
                    Applying all…
                  </>
                ) : (
                  <>
                    <Check size={13} strokeWidth={2.5} />
                    Apply all changes
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="mt-4 rounded-2xl border border-danger/20 bg-danger-soft px-4 py-3 text-caption text-danger">
          {error}
        </div>
      )}
    </Modal>
  )
}
