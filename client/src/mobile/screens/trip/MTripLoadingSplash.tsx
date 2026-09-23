import { useEffect, useState } from 'react'
import { useTranslation } from '../../../i18n'

/**
 * Trip-open splash — the TREK mascot acts out a little journey while the trip
 * and its place photos load: packing the bags, hitting the road, cruising in
 * (paper plane) and dropping the destination pin. Each beat the mascot travels
 * in from the right (fade + slide) and pops in, the caption cross-fades and the
 * progress dots track which beat is on. Under reduced motion it holds a single
 * frame (the real "loading photos" one) with no transitions.
 */
const STEPS = [
  { phase: 'pack', key: 'trip.loadingSteps.pack' },
  { phase: 'route', key: 'trip.loadingSteps.road' },
  { phase: 'visual', key: 'trip.loadingPhotos' },
  { phase: 'arrive', key: 'trip.loadingSteps.arrive' },
] as const

const STEP_MS = 1400
// Reduced motion parks on the paper-plane / "loading photos" beat.
const STILL_INDEX = 2
const REDUCE_MOTION = '(prefers-reduced-motion: reduce)'

export default function MTripLoadingSplash({ title }: { title: string }) {
  const { t } = useTranslation()
  const [reduceMotion, setReduceMotion] = useState(() => window.matchMedia?.(REDUCE_MOTION)?.matches ?? false)
  // The splash can be up long enough for the OS setting to be flipped under it.
  useEffect(() => {
    const mq = window.matchMedia?.(REDUCE_MOTION)
    if (!mq) return
    const sync = () => setReduceMotion(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])

  const [index, setIndex] = useState(0)
  useEffect(() => {
    if (reduceMotion) return
    const id = setInterval(() => setIndex(n => (n + 1) % STEPS.length), STEP_MS)
    return () => clearInterval(id)
  }, [reduceMotion])

  const activeIndex = reduceMotion ? STILL_INDEX : index
  const step = STEPS[activeIndex]

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[color:var(--m-bg)] bg-[image:var(--m-scr)] text-m-ink">
      <div className="mb-7 flex h-[140px] w-[150px] items-center justify-center overflow-visible">
        <div
          key={step.phase}
          className="voya-loading-mark relative flex h-[112px] w-[112px] items-center justify-center rounded-full"
          style={reduceMotion ? undefined : { animation: 'voya-loading-beat 520ms cubic-bezier(.16,1,.3,1) both' }}
        >
          <span className="voya-loading-ring absolute inset-[-10px] rounded-full" />
          <span className="voya-wordmark relative z-10 text-[44px] text-white">V</span>
        </div>
      </div>

      <div className="voya-editorial mb-2 max-w-[82vw] truncate text-[1.5rem] font-medium tracking-[-.035em]">{title || 'Voya'}</div>

      <div className="mb-8 flex h-4 items-center justify-center">
        <span key={step.key} className="m-fade-in text-[0.75rem] font-medium uppercase tracking-[2px] text-m-faint">
          {t(step.key)}
        </span>
      </div>

      {/* Beat dots — the active stage widens into an accent pill. */}
      <div className="flex items-center gap-1.5">
        {STEPS.map((_, i) => (
          <span
            key={i}
            className={`h-[6px] rounded-full transition-all duration-[400ms] ease-out ${
              i === activeIndex ? 'w-5 bg-m-ink' : 'w-[6px] bg-[color:var(--m-faint)]'
            }`}
          />
        ))}
      </div>

      <style>{`
        @keyframes voya-loading-beat {
          from { opacity: 0; transform: translateY(10px) scale(.92); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  )
}
