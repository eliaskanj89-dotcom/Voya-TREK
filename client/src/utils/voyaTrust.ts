import type { Place } from '../types'

export type VoyaPlaceTrust = 'suggested' | 'matched' | null

const SUGGESTED_RE = /Suggested by Voya — verify current details before relying on them\./i
const MATCHED_RE = /Matched by Voya to a .+ place record/i

export function getVoyaPlaceTrust(place: Pick<
  Place,
  'notes' | 'google_place_id' | 'google_ftid' | 'osm_id' | 'amap_poi_id'
>): VoyaPlaceTrust {
  const notes = place.notes || ''
  if (SUGGESTED_RE.test(notes)) return 'suggested'

  const hasProviderIdentity = Boolean(
    place.google_place_id
    || place.google_ftid
    || place.osm_id
    || place.amap_poi_id,
  )
  if (hasProviderIdentity && MATCHED_RE.test(notes)) return 'matched'

  return null
}

export function isVoyaSuggestion(place: Pick<Place, 'notes'>): boolean {
  return SUGGESTED_RE.test(place.notes || '')
}
