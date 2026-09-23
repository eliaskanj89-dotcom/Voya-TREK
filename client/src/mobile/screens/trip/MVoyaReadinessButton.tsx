import { useEffect, useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import MIconBtn from '../../components/MIconBtn'
import { voyaAiApi } from '../../../api/client'

export default function MVoyaReadinessButton({
  tripId,
  onOpen,
}: {
  tripId: number
  onOpen: () => void
}) {
  const [score, setScore] = useState<number | null>(null)
  const [stale, setStale] = useState(false)
  const [generated, setGenerated] = useState(false)

  useEffect(() => {
    let alive = true
    voyaAiApi.readiness({ tripId })
      .then(result => {
        if (!alive) return
        setScore(result.score)
        setStale(result.stale)
        setGenerated(result.fingerprint != null)
      })
      .catch(() => {})
    return () => { alive = false }
  }, [tripId])

  return (
    <div className="relative flex-none">
      <MIconBtn
        ariaLabel="Before You Go"
        onClick={onOpen}
        className="text-m-muted backdrop-blur-[24px] backdrop-saturate-[1.7]"
      >
        <ShieldCheck size={17} strokeWidth={2.2} />
      </MIconBtn>
      {generated && (
        <span className={`pointer-events-none absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 font-geist text-[0.5rem] font-bold ${
          stale ? 'bg-[#F59E0B] text-white' : 'bg-m-act text-m-actfg'
        }`}>
          {stale ? '!' : score}
        </span>
      )}
    </div>
  )
}
