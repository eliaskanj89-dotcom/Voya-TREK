import { describe, expect, it } from 'vitest'
import { getVoyaPlaceTrust, isVoyaSuggestion } from '../../../src/utils/voyaTrust'

describe('Voya place trust', () => {
  it('VOYA-TRUST-001: marks an untouched AI place as a suggestion', () => {
    const place = {
      notes: 'Suggested by Voya — verify current details before relying on them. Voya destination: Rome.',
      google_place_id: null,
      google_ftid: null,
      osm_id: null,
      amap_poi_id: null,
    } as any

    expect(getVoyaPlaceTrust(place)).toBe('suggested')
    expect(isVoyaSuggestion(place)).toBe(true)
  })

  it('VOYA-TRUST-002: marks a Voya provider match only when provider identity is stored', () => {
    const place = {
      notes: 'Matched by Voya to a google place record on 2026-09-23. Current hours, prices and availability still require checking.',
      google_place_id: 'ChIJ-real',
      google_ftid: null,
      osm_id: null,
      amap_poi_id: null,
    } as any

    expect(getVoyaPlaceTrust(place)).toBe('matched')
    expect(isVoyaSuggestion(place)).toBe(false)
  })

  it('VOYA-TRUST-003: does not call an ordinary TREK place a Voya match', () => {
    const place = {
      notes: 'User saved this place manually.',
      google_place_id: 'ChIJ-real',
      google_ftid: null,
      osm_id: null,
      amap_poi_id: null,
    } as any

    expect(getVoyaPlaceTrust(place)).toBeNull()
  })

  it('VOYA-TRUST-004: provider-match note without provider identity is not trusted', () => {
    const place = {
      notes: 'Matched by Voya to a google place record on 2026-09-23.',
      google_place_id: null,
      google_ftid: null,
      osm_id: null,
      amap_poi_id: null,
    } as any

    expect(getVoyaPlaceTrust(place)).toBeNull()
  })
})
