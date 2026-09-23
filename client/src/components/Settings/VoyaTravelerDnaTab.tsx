import { useEffect, useState } from 'react'
import { RotateCcw, Save, Sparkles } from 'lucide-react'
import { DEFAULT_VOYA_TRAVELER_DNA, voyaTravelerDnaSchema, type VoyaTravelerDna } from '@trek/shared'
import { useSettingsStore } from '../../store/settingsStore'
import { useToast } from '../shared/Toast'

const FOOD_OPTIONS = ['Local classics', 'Street food', 'Cafés', 'Fine dining', 'Markets', 'Vegetarian-friendly']
const HOTEL_OPTIONS = ['Boutique', 'Design', 'Luxury', 'Budget-smart', 'Resort', 'Apartment']

export default function VoyaTravelerDnaTab() {
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

  const toggleArray = (key: 'foodStyle' | 'hotelStyle', value: string) => {
    const current = draft[key]
    patch(key, current.includes(value) ? current.filter(item => item !== value) : [...current, value])
  }

  const save = async () => {
    setSaving(true)
    try {
      const parsed = voyaTravelerDnaSchema.parse(draft)
      await updateSetting('voya_traveler_dna', parsed)
      toast.success('Traveler DNA saved. Voya will use it as your default travel context.')
    } catch {
      toast.error('Traveler DNA could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  const reset = () => {
    setDraft({ ...DEFAULT_VOYA_TRAVELER_DNA, foodStyle: [], hotelStyle: [] })
  }

  return (
    <div className="max-w-4xl space-y-5">
      <section className="overflow-hidden rounded-[28px] border border-[#B9D4F7]/35 bg-[linear-gradient(145deg,rgba(247,251,255,.96),rgba(234,244,255,.82))] shadow-[0_20px_55px_rgba(31,67,112,.10)] dark:border-white/8 dark:bg-[linear-gradient(145deg,rgba(15,34,58,.94),rgba(8,22,39,.90))]">
        <div className="flex items-start gap-4 border-b border-[#A9C9F5]/18 px-6 py-6 dark:border-white/8">
          <span className="flex h-12 w-12 flex-none items-center justify-center rounded-full bg-[#377CF6] text-white shadow-[0_12px_28px_rgba(55,124,246,.26)]">
            <Sparkles size={20} strokeWidth={2.2} />
          </span>
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-[.15em] text-[#377CF6]">Voya intelligence</div>
            <h2 className="voya-editorial mt-1 text-[30px] font-medium tracking-[-.045em] text-content">Traveler DNA</h2>
            <p className="mt-2 max-w-2xl text-body leading-relaxed text-content-muted">
              These are background preferences, not hard rules. Your instructions on a specific trip always win.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-5 p-6 lg:grid-cols-2">
          <PreferenceCard title="Trip rhythm" description="How much you like to fit into a normal day.">
            <Segment
              value={draft.pace}
              options={[['relaxed', 'Relaxed'], ['balanced', 'Balanced'], ['packed', 'Full']]}
              onChange={value => patch('pace', value as VoyaTravelerDna['pace'])}
            />
          </PreferenceCard>

          <PreferenceCard title="Budget style" description="The default spending level Voya should design around.">
            <Segment
              value={draft.budgetStyle}
              options={[['budget', 'Budget'], ['moderate', 'Moderate'], ['premium', 'Premium'], ['luxury', 'Luxury']]}
              onChange={value => patch('budgetStyle', value as VoyaTravelerDna['budgetStyle'])}
            />
          </PreferenceCard>

          <PreferenceCard title="Walking tolerance" description="How aggressively Voya can connect nearby stops on foot.">
            <Segment
              value={draft.walkingTolerance}
              options={[['low', 'Low'], ['medium', 'Medium'], ['high', 'High']]}
              onChange={value => patch('walkingTolerance', value as VoyaTravelerDna['walkingTolerance'])}
            />
          </PreferenceCard>

          <PreferenceCard title="Morning style" description="Whether days should start gently or get moving early.">
            <Segment
              value={draft.morningStyle}
              options={[['slow', 'Slow'], ['standard', 'Normal'], ['early', 'Early']]}
              onChange={value => patch('morningStyle', value as VoyaTravelerDna['morningStyle'])}
            />
          </PreferenceCard>

          <PreferenceCard title="Nightlife" description="How often evenings should continue after dinner.">
            <Segment
              value={draft.nightlifeFrequency}
              options={[['never', 'Rarely'], ['sometimes', 'Sometimes'], ['often', 'Often']]}
              onChange={value => patch('nightlifeFrequency', value as VoyaTravelerDna['nightlifeFrequency'])}
            />
          </PreferenceCard>

          <PreferenceCard title="Museums" description="How much museum-heavy planning feels right for you.">
            <Segment
              value={draft.museumInterest}
              options={[['low', 'Low'], ['medium', 'Medium'], ['high', 'High']]}
              onChange={value => patch('museumInterest', value as VoyaTravelerDna['museumInterest'])}
            />
          </PreferenceCard>

          <div className="lg:col-span-2 rounded-[22px] border border-edge-faint bg-white/60 p-5 dark:bg-white/4">
            <div className="flex items-end justify-between gap-4">
              <div>
                <h3 className="text-body font-semibold text-content">Local vs iconic</h3>
                <p className="mt-1 text-caption text-content-muted">How strongly Voya should favor local texture over headline sights.</p>
              </div>
              <span className="voya-editorial text-[28px] font-medium tracking-[-.04em] text-[#377CF6]">{draft.localPreference}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={draft.localPreference}
              onChange={event => patch('localPreference', Number(event.target.value))}
              className="mt-4 w-full accent-[#377CF6]"
              aria-label="Local preference"
            />
            <div className="mt-1 flex justify-between text-[10px] font-medium uppercase tracking-[.08em] text-content-faint">
              <span>Iconic first</span><span>Local first</span>
            </div>
          </div>

          <TagCard
            title="Food style"
            description="Pick any that regularly make a trip better for you."
            options={FOOD_OPTIONS}
            selected={draft.foodStyle}
            onToggle={value => toggleArray('foodStyle', value)}
          />

          <TagCard
            title="Stay style"
            description="Used when Voya talks about hotel areas or accommodation fit."
            options={HOTEL_OPTIONS}
            selected={draft.hotelStyle}
            onToggle={value => toggleArray('hotelStyle', value)}
          />

          <div className="lg:col-span-2 rounded-[22px] border border-edge-faint bg-white/60 p-5 dark:bg-white/4">
            <label className="text-body font-semibold text-content" htmlFor="voya-dna-notes">Personal travel notes</label>
            <p className="mt-1 text-caption text-content-muted">Anything that should quietly shape most trips.</p>
            <textarea
              id="voya-dna-notes"
              value={draft.notes}
              onChange={event => patch('notes', event.target.value)}
              rows={4}
              maxLength={1000}
              placeholder="I dislike rushed breakfasts, I prefer one major museum per day, I like late dinners, avoid overly touristy restaurants…"
              className="mt-3 w-full resize-none rounded-2xl border border-edge bg-surface-input px-4 py-3 text-body leading-relaxed text-content outline-none placeholder:text-content-faint focus:border-[#377CF6] focus:ring-4 focus:ring-[#377CF6]/10"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#A9C9F5]/18 px-6 py-4 dark:border-white/8">
          <button
            type="button"
            onClick={reset}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-full border border-edge px-4 py-2 text-caption font-medium text-content-muted hover:bg-surface-hover disabled:opacity-50"
          >
            <RotateCcw size={13} />
            Reset defaults
          </button>
          <button
            type="button"
            onClick={() => { void save() }}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-full bg-[#377CF6] px-5 py-2.5 text-body font-semibold text-white shadow-[0_10px_24px_rgba(55,124,246,.24)] hover:bg-[#286CE4] disabled:opacity-60"
          >
            {saving ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/35 border-t-white" /> : <Save size={15} />}
            {saving ? 'Saving…' : 'Save Traveler DNA'}
          </button>
        </div>
      </section>
    </div>
  )
}

function PreferenceCard({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[22px] border border-edge-faint bg-white/60 p-5 dark:bg-white/4">
      <h3 className="text-body font-semibold text-content">{title}</h3>
      <p className="mt-1 text-caption text-content-muted">{description}</p>
      <div className="mt-3">{children}</div>
    </div>
  )
}

function Segment({
  value,
  options,
  onChange,
}: {
  value: string
  options: [string, string][]
  onChange: (value: string) => void
}) {
  return (
    <div className="flex flex-wrap gap-1.5 rounded-2xl bg-surface-tertiary p-1.5">
      {options.map(([optionValue, label]) => (
        <button
          key={optionValue}
          type="button"
          onClick={() => onChange(optionValue)}
          className={`min-w-[70px] flex-1 rounded-xl px-3 py-2 text-caption font-medium transition-all ${
            value === optionValue
              ? 'bg-white text-[#377CF6] shadow-[0_5px_14px_rgba(31,67,112,.10)] dark:bg-white/10 dark:text-[#79AEFF]'
              : 'text-content-muted hover:text-content'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

function TagCard({
  title,
  description,
  options,
  selected,
  onToggle,
}: {
  title: string
  description: string
  options: string[]
  selected: string[]
  onToggle: (value: string) => void
}) {
  return (
    <div className="rounded-[22px] border border-edge-faint bg-white/60 p-5 dark:bg-white/4">
      <h3 className="text-body font-semibold text-content">{title}</h3>
      <p className="mt-1 text-caption text-content-muted">{description}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {options.map(option => {
          const active = selected.includes(option)
          return (
            <button
              key={option}
              type="button"
              onClick={() => onToggle(option)}
              className={`rounded-full border px-3 py-1.5 text-caption font-medium transition-all ${
                active
                  ? 'border-[#377CF6]/25 bg-[#377CF6]/10 text-[#377CF6]'
                  : 'border-edge text-content-muted hover:border-content-faint hover:text-content'
              }`}
            >
              {option}
            </button>
          )
        })}
      </div>
    </div>
  )
}
