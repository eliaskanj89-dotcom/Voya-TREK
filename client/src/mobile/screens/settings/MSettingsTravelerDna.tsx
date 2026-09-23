import { useEffect, useState } from 'react'
import { RotateCcw, Save, Sparkles } from 'lucide-react'
import { DEFAULT_VOYA_TRAVELER_DNA, voyaTravelerDnaSchema, type VoyaTravelerDna } from '@trek/shared'
import { useSettingsStore } from '../../../store/settingsStore'
import { useToast } from '../../../components/shared/Toast'
import { MSetCard, MSetEyebrow, MSetSegments } from './MSettingsUi'

const FOOD = ['Local classics', 'Street food', 'Cafés', 'Fine dining', 'Markets', 'Vegetarian-friendly']
const HOTELS = ['Boutique', 'Design', 'Luxury', 'Budget-smart', 'Resort', 'Apartment']

export default function MSettingsTravelerDna() {
  const stored = useSettingsStore(state => state.settings.voya_traveler_dna)
  const updateSetting = useSettingsStore(state => state.updateSetting)
  const toast = useToast()
  const [draft, setDraft] = useState<VoyaTravelerDna>(() =>
    voyaTravelerDnaSchema.parse(stored ?? DEFAULT_VOYA_TRAVELER_DNA),
  )
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setDraft(voyaTravelerDnaSchema.parse(stored ?? DEFAULT_VOYA_TRAVELER_DNA))
  }, [stored])

  const patch = <K extends keyof VoyaTravelerDna>(key: K, value: VoyaTravelerDna[K]) =>
    setDraft(current => ({ ...current, [key]: value }))

  const toggle = (key: 'foodStyle' | 'hotelStyle', value: string) => {
    const current = draft[key]
    patch(key, current.includes(value) ? current.filter(item => item !== value) : [...current, value])
  }

  const save = async () => {
    setSaving(true)
    try {
      const parsed = voyaTravelerDnaSchema.parse(draft)
      await updateSetting('voya_traveler_dna', parsed)
      toast.success('Traveler DNA saved.')
    } catch {
      toast.error('Traveler DNA could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <MSetCard title="Traveler DNA" icon={Sparkles}>
        <p className="mb-4 font-geist text-[0.75rem] leading-relaxed text-m-muted">
          Voya uses these as background preferences. A specific trip request always overrides them.
        </p>

        <MSetEyebrow className="mb-[6px]">Trip rhythm</MSetEyebrow>
        <MSetSegments
          value={draft.pace}
          onChange={value => patch('pace', value as VoyaTravelerDna['pace'])}
          options={[
            { value: 'relaxed', label: 'Relaxed' },
            { value: 'balanced', label: 'Balanced' },
            { value: 'packed', label: 'Full' },
          ]}
        />

        <MSetEyebrow className="mb-[6px] mt-[14px]">Budget style</MSetEyebrow>
        <MSetSegments
          value={draft.budgetStyle}
          onChange={value => patch('budgetStyle', value as VoyaTravelerDna['budgetStyle'])}
          options={[
            { value: 'budget', label: 'Budget' },
            { value: 'moderate', label: 'Moderate' },
            { value: 'premium', label: 'Premium' },
            { value: 'luxury', label: 'Luxury' },
          ]}
        />

        <MSetEyebrow className="mb-[6px] mt-[14px]">Walking</MSetEyebrow>
        <MSetSegments
          value={draft.walkingTolerance}
          onChange={value => patch('walkingTolerance', value as VoyaTravelerDna['walkingTolerance'])}
          options={[
            { value: 'low', label: 'Low' },
            { value: 'medium', label: 'Medium' },
            { value: 'high', label: 'High' },
          ]}
        />

        <MSetEyebrow className="mb-[6px] mt-[14px]">Mornings</MSetEyebrow>
        <MSetSegments
          value={draft.morningStyle}
          onChange={value => patch('morningStyle', value as VoyaTravelerDna['morningStyle'])}
          options={[
            { value: 'slow', label: 'Slow' },
            { value: 'standard', label: 'Normal' },
            { value: 'early', label: 'Early' },
          ]}
        />

        <MSetEyebrow className="mb-[6px] mt-[14px]">Nightlife</MSetEyebrow>
        <MSetSegments
          value={draft.nightlifeFrequency}
          onChange={value => patch('nightlifeFrequency', value as VoyaTravelerDna['nightlifeFrequency'])}
          options={[
            { value: 'never', label: 'Rarely' },
            { value: 'sometimes', label: 'Sometimes' },
            { value: 'often', label: 'Often' },
          ]}
        />

        <MSetEyebrow className="mb-[6px] mt-[14px]">Museums</MSetEyebrow>
        <MSetSegments
          value={draft.museumInterest}
          onChange={value => patch('museumInterest', value as VoyaTravelerDna['museumInterest'])}
          options={[
            { value: 'low', label: 'Low' },
            { value: 'medium', label: 'Medium' },
            { value: 'high', label: 'High' },
          ]}
        />
      </MSetCard>

      <MSetCard title="Local balance" icon={Sparkles} className="mt-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <div className="font-geist text-[0.75rem] font-semibold text-m-ink">Local vs iconic</div>
            <div className="mt-0.5 font-geist text-[0.65625rem] leading-relaxed text-m-muted">
              How strongly Voya should favor local texture.
            </div>
          </div>
          <span className="voya-editorial text-[1.55rem] font-medium text-m-act">{draft.localPreference}%</span>
        </div>
        <input
          aria-label="Local preference"
          type="range"
          min={0}
          max={100}
          step={5}
          value={draft.localPreference}
          onChange={event => patch('localPreference', Number(event.target.value))}
          className="mt-3 w-full accent-[var(--m-act)]"
        />

        <MSetEyebrow className="mb-[7px] mt-[16px]">Food style</MSetEyebrow>
        <TagCloud options={FOOD} selected={draft.foodStyle} onToggle={value => toggle('foodStyle', value)} />

        <MSetEyebrow className="mb-[7px] mt-[16px]">Stay style</MSetEyebrow>
        <TagCloud options={HOTELS} selected={draft.hotelStyle} onToggle={value => toggle('hotelStyle', value)} />
      </MSetCard>

      <MSetCard title="Personal notes" icon={Sparkles} className="mt-3">
        <textarea
          value={draft.notes}
          onChange={event => patch('notes', event.target.value)}
          rows={5}
          maxLength={1000}
          placeholder="I dislike rushed breakfasts, prefer one major museum per day, like late dinners…"
          className="w-full resize-none rounded-[16px] border border-[color:var(--m-rowbr)] bg-[color:var(--m-ic)] px-3 py-2.5 font-geist text-[0.75rem] leading-relaxed text-m-ink outline-none placeholder:text-m-faint"
        />
      </MSetCard>

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => setDraft({ ...DEFAULT_VOYA_TRAVELER_DNA, foodStyle: [], hotelStyle: [] })}
          disabled={saving}
          className="flex h-11 flex-1 items-center justify-center gap-2 rounded-full border border-[color:var(--m-rowbr)] bg-[color:var(--m-sheet)] font-geist text-[0.75rem] font-semibold text-m-muted disabled:opacity-50"
        >
          <RotateCcw size={14} />
          Reset
        </button>
        <button
          type="button"
          onClick={() => { void save() }}
          disabled={saving}
          className="flex h-11 flex-[1.5] items-center justify-center gap-2 rounded-full bg-m-act font-geist text-[0.75rem] font-semibold text-m-actfg shadow-[0_10px_24px_rgba(55,124,246,.22)] disabled:opacity-60"
        >
          {saving ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current/30 border-t-current" /> : <Save size={14} />}
          {saving ? 'Saving…' : 'Save DNA'}
        </button>
      </div>
    </>
  )
}

function TagCloud({ options, selected, onToggle }: { options: string[]; selected: string[]; onToggle: (value: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(option => {
        const active = selected.includes(option)
        return (
          <button
            key={option}
            type="button"
            onClick={() => onToggle(option)}
            className={`rounded-full border px-3 py-1.5 font-geist text-[0.6875rem] font-semibold ${
              active
                ? 'border-m-act/25 bg-[color:var(--m-ic)] text-m-act'
                : 'border-[color:var(--m-rowbr)] text-m-muted'
            }`}
          >
            {option}
          </button>
        )
      })}
    </div>
  )
}
