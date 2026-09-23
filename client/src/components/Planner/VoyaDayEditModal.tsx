import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowRight, Sparkles } from 'lucide-react'
import type { Assignment, VoyaDayEditDraft } from '@trek/shared'
import Modal from '../shared/Modal'
import { voyaAiApi } from '../../api/client'
import { getApiErrorMessage } from '../../types'

interface VoyaDayEditModalProps {
  isOpen: boolean
  onClose: () => void
  tripId: number
  dayId: number
  dayLabel: string
  assignments: Assignment[]
  onApplied: () => Promise<void> | void
  initialInstruction?: string
  autoPreview?: boolean
}

const EXAMPLES = [
  'Make this day more relaxed',
  'Focus more on food and local neighborhoods',
  'Reduce walking and group nearby stops',
  'Give me a stronger evening plan',
]

export default function VoyaDayEditModal({
  isOpen,
  onClose,
  tripId,
  dayId,
  dayLabel,
  assignments,
  onApplied,
  initialInstruction = '',
  autoPreview = false,
}: VoyaDayEditModalProps) {
  const [instruction, setInstruction] = useState('')
  const [draft, setDraft] = useState<VoyaDayEditDraft | null>(null)
  const [generating, setGenerating] = useState(false)
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState('')
  const seededRef = useRef<string>('')

  const assignmentById = useMemo(
    () => new Map(assignments.map(assignment => [assignment.id, assignment])),
    [assignments],
  )

  const resetAndClose = () => {
    if (generating || applying) return
    setDraft(null)
    setInstruction('')
    setError('')
    onClose()
  }

  const generate = async (override?: string) => {
    const text = (override ?? instruction).trim()
    if (text.length < 3) {
      setError('Tell Voya what you want to change first.')
      return
    }
    setGenerating(true)
    setError('')
    setDraft(null)
    try {
      const result = await voyaAiApi.planDayEdit({
        tripId,
        dayId,
        instruction: text,
      })
      setDraft(result.draft)
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, 'Voya could not redesign this day right now.'))
    } finally {
      setGenerating(false)
    }
  }

  useEffect(() => {
    if (!isOpen || !initialInstruction.trim()) {
      if (!isOpen) seededRef.current = ''
      return
    }
    const seedKey = `${dayId}:${initialInstruction}`
    if (seededRef.current === seedKey) return
    seededRef.current = seedKey
    setInstruction(initialInstruction)
    setDraft(null)
    setError('')
    if (autoPreview) {
      void generate(initialInstruction)
    }
  }, [isOpen, dayId, initialInstruction, autoPreview])

  const apply = async () => {
    if (!draft) return
    setApplying(true)
    setError('')
    try {
      await voyaAiApi.applyDayEdit({ draft })
      await onApplied()
      resetAndClose()
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, 'This day changed before Voya could apply the edit. Generate a fresh preview and try again.'))
    } finally {
      setApplying(false)
    }
  }

  const removed = draft
    ? draft.removedAssignmentIds
        .map(id => assignmentById.get(id))
        .filter((value): value is Assignment => !!value)
    : []

  return (
    <Modal
      isOpen={isOpen}
      onClose={resetAndClose}
      title={
        <span className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#377CF6] text-white shadow-[0_8px_20px_rgba(55,124,246,.25)]">
            <Sparkles size={14} strokeWidth={2.3} />
          </span>
          <span className="voya-editorial text-[22px] font-medium tracking-[-.035em]">Ask Voya · {dayLabel}</span>
        </span>
      }
      size="xl"
      footer={draft ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-md text-caption leading-relaxed text-content-faint">
            Applying changes updates this day only. Removed stops stay saved in the trip’s Places pool.
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={applying}
              onClick={() => { setDraft(null); setError('') }}
              className="rounded-full border border-edge px-4 py-2 text-body font-medium text-content-secondary hover:bg-surface-hover disabled:opacity-50"
            >
              Adjust request
            </button>
            <button
              type="button"
              disabled={applying}
              onClick={() => { void apply() }}
              className="inline-flex items-center gap-2 rounded-full bg-[#377CF6] px-5 py-2.5 text-body font-semibold text-white shadow-[0_10px_24px_rgba(55,124,246,.24)] hover:bg-[#286CE4] disabled:opacity-60"
            >
              {applying ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/35 border-t-white" />
                  Applying…
                </>
              ) : (
                <>
                  Apply this edit
                  <ArrowRight size={14} />
                </>
              )}
            </button>
          </div>
        </div>
      ) : undefined}
    >
      {!draft ? (
        <div className="space-y-5">
          <div className="rounded-[22px] border border-[#BCD5F6]/40 bg-[linear-gradient(145deg,rgba(241,248,255,.95),rgba(255,255,255,.78))] p-4 dark:border-white/8 dark:bg-[linear-gradient(145deg,rgba(18,40,68,.78),rgba(10,25,44,.72))]">
            <div className="text-[11px] font-semibold uppercase tracking-[.14em] text-[#377CF6]">Edit this day with Voya</div>
            <p className="mt-1.5 text-body leading-relaxed text-content-muted">
              Describe the outcome you want. Voya can reorder existing stops, adjust times, remove stops from this day, and suggest new places.
            </p>
          </div>

          <textarea
            value={instruction}
            onChange={event => setInstruction(event.target.value)}
            rows={5}
            autoFocus
            placeholder="Make this day less rushed, keep the main sights, add a good dinner area, and reduce backtracking."
            className="w-full resize-none rounded-[20px] border border-edge bg-surface-input px-4 py-3 text-body leading-relaxed text-content outline-none placeholder:text-content-faint focus:border-[#377CF6] focus:ring-4 focus:ring-[#377CF6]/10"
          />

          <div className="flex flex-wrap gap-2">
            {EXAMPLES.map(example => (
              <button
                type="button"
                key={example}
                onClick={() => setInstruction(example)}
                className="rounded-full border border-edge px-3 py-1.5 text-caption font-medium text-content-muted hover:border-[#377CF6]/35 hover:bg-[#377CF6]/5 hover:text-[#377CF6]"
              >
                {example}
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-edge-faint pt-4">
            <p className="text-caption text-content-faint">
              Nothing changes until you review the proposal and press Apply.
            </p>
            <button
              type="button"
              disabled={generating}
              onClick={() => { void generate() }}
              className="inline-flex items-center gap-2 rounded-full bg-[#377CF6] px-5 py-2.5 text-body font-semibold text-white shadow-[0_10px_24px_rgba(55,124,246,.24)] hover:bg-[#286CE4] disabled:opacity-60"
            >
              {generating ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/35 border-t-white" />
                  Reworking day…
                </>
              ) : (
                <>
                  <Sparkles size={15} />
                  Preview edit
                </>
              )}
            </button>
          </div>
        </div>
      ) : (
        <div>
          <div className="mb-5 rounded-[22px] border border-[#BCD5F6]/35 bg-[#F6FAFF]/85 p-4 dark:border-white/8 dark:bg-white/4">
            <div className="text-[11px] font-semibold uppercase tracking-[.14em] text-[#377CF6]">Voya’s proposal</div>
            <h3 className="voya-editorial mt-1 text-[26px] font-medium tracking-[-.04em] text-content">{draft.title || dayLabel}</h3>
            <p className="mt-2 text-body leading-relaxed text-content-muted">{draft.summary}</p>
            {draft.objective && <p className="mt-2 text-caption leading-relaxed text-content-faint">{draft.objective}</p>}
          </div>

          <div className="space-y-2">
            {draft.sequence.map((item, index) => {
              const existing = item.kind === 'existing' ? assignmentById.get(item.assignmentId) : null
              const name = item.kind === 'existing' ? existing?.place?.name || 'Existing stop' : item.activity.name
              const description = item.kind === 'existing'
                ? existing?.place?.description
                : item.activity.description
              const time = item.kind === 'existing'
                ? item.startTime ?? existing?.place?.place_time
                : item.activity.startTime
              return (
                <div key={item.kind === 'existing' ? `existing-${item.assignmentId}` : `new-${index}-${name}`} className="flex gap-3 rounded-[18px] border border-edge-faint bg-surface-card px-3.5 py-3">
                  <div className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-[#377CF6] text-[11px] font-bold text-white">{index + 1}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-content">{name}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[.08em] ${
                        item.kind === 'new'
                          ? 'bg-[#377CF6]/10 text-[#377CF6]'
                          : 'bg-surface-hover text-content-faint'
                      }`}>
                        {item.kind === 'new' ? 'New suggestion' : 'Keep'}
                      </span>
                      {time && <span className="text-[11px] font-medium text-[#377CF6]">{time}</span>}
                    </div>
                    {description && <p className="mt-1 text-caption leading-relaxed text-content-muted">{description}</p>}
                    {item.kind === 'new' && (
                      <p className="mt-1.5 text-[10px] font-medium text-content-faint">
                        Suggested · price unverified · place details need verification
                      </p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {removed.length > 0 && (
            <div className="mt-5 rounded-[18px] border border-edge-faint bg-surface-tertiary p-3.5">
              <div className="text-[11px] font-semibold uppercase tracking-[.12em] text-content-faint">Remove from this day</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {removed.map(assignment => (
                  <span key={assignment.id} className="rounded-full border border-edge px-2.5 py-1 text-caption text-content-muted">
                    {assignment.place?.name || `Stop ${assignment.id}`}
                  </span>
                ))}
              </div>
            </div>
          )}
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
