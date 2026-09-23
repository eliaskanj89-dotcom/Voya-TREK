import { describe, expect, it } from 'vitest'
import { optimizeRoute } from './optimizeRoute'

describe('shared optimizeRoute', () => {
  it('keeps an unanchored two-stop route unchanged', () => {
    const stops = [{ id: 'a', lat: 4, lng: 4 }, { id: 'b', lat: 1, lng: 1 }]
    expect(optimizeRoute(stops)).toBe(stops)
  })

  it('orders a hotel-to-hotel transfer day toward the destination anchor', () => {
    const start = { lat: 1, lng: 1 }
    const end = { lat: 9, lng: 1 }
    const a = { id: 'a', lat: 2, lng: 1 }
    const b = { id: 'b', lat: 5, lng: 1 }
    const c = { id: 'c', lat: 8, lng: 1 }
    expect(optimizeRoute([c, a, b], { start, end }).map(stop => stop.id)).toEqual(['a', 'b', 'c'])
  })

  it('orients a hotel loop with a hotel-near stop at an edge', () => {
    const hotel = { lat: 48.8668, lng: 2.3013 }
    const stops = [
      { id: 1, lat: 48.8565, lng: 2.3324 },
      { id: 2, lat: 48.8813, lng: 2.3151 },
      { id: 3, lat: 48.8796, lng: 2.3080 },
      { id: 4, lat: 48.8723, lng: 2.2926 },
      { id: 5, lat: 48.8660, lng: 2.3102 },
    ]
    const result = optimizeRoute(stops, { start: hotel, end: hotel })
    expect([result[0].id, result.at(-1)?.id]).toContain(5)
  })
})
