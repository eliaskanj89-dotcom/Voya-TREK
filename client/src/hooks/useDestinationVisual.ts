import { useEffect, useState } from 'react'
import { mapsApi } from '../api/client'

export interface DestinationVisual {
  url: string
  source: 'google' | 'wikimedia' | 'wikipedia' | 'cached'
  attribution: string | null
  license: string | null
  licenseUrl: string | null
  sourceUrl: string | null
}

const cache = new Map<string, Promise<DestinationVisual | null>>()
const queue: Array<() => void> = []
let active = 0
const MAX_CONCURRENT = 2

function schedule<T>(task: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const run = () => {
      active += 1
      task()
        .then(resolve, reject)
        .finally(() => {
          active -= 1
          queue.shift()?.()
        })
    }
    if (active < MAX_CONCURRENT) run()
    else queue.push(run)
  })
}

const stringField = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : ''

const numberField = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null

function normalize(value: string): string {
  return value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

function candidateName(candidate: Record<string, unknown>): string {
  return stringField(candidate.name)
    || stringField(candidate.display_name)
    || stringField(candidate.displayName)
    || stringField(candidate.mainText)
}

function candidateAddress(candidate: Record<string, unknown>): string {
  return stringField(candidate.address)
    || stringField(candidate.formatted_address)
    || stringField(candidate.formattedAddress)
}

function candidateLat(candidate: Record<string, unknown>): number | null {
  return numberField(candidate.lat)
    ?? numberField(candidate.latitude)
}

function candidateLng(candidate: Record<string, unknown>): number | null {
  return numberField(candidate.lng)
    ?? numberField(candidate.lon)
    ?? numberField(candidate.longitude)
}

function candidatePlaceId(candidate: Record<string, unknown>): string | undefined {
  return stringField(candidate.google_place_id)
    || stringField(candidate.googlePlaceId)
    || stringField(candidate.place_id)
    || stringField(candidate.placeId)
    || stringField(candidate.osm_id)
    || undefined
}

function pickCandidate(
  candidates: Record<string, unknown>[],
  expectedName: string,
  country: string,
): Record<string, unknown> | null {
  const expected = normalize(expectedName)
  const countryKey = normalize(country)

  const scored = candidates
    .map(candidate => {
      const name = normalize(candidateName(candidate))
      const address = normalize(candidateAddress(candidate))
      const lat = candidateLat(candidate)
      const lng = candidateLng(candidate)
      if (!name || lat == null || lng == null) return null

      let score = 0
      if (name === expected) score += 5
      else if (name.includes(expected) || expected.includes(name)) score += 3
      if (countryKey && address.includes(countryKey)) score += 2

      return score >= 3 ? { candidate, score } : null
    })
    .filter((row): row is { candidate: Record<string, unknown>; score: number } => !!row)
    .sort((a, b) => b.score - a.score)

  return scored[0]?.candidate ?? null
}

async function resolveDestinationVisual(
  name: string,
  country: string,
  searchTerm: string,
): Promise<DestinationVisual | null> {
  const query = searchTerm.trim() || [name, country].filter(Boolean).join(', ')
  const result = await mapsApi.search(query)
  const candidate = pickCandidate(result.places, name, country)
  if (!candidate) return null

  const lat = candidateLat(candidate)
  const lng = candidateLng(candidate)
  if (lat == null || lng == null) return null

  const enrichment = await mapsApi.placeEnrichment({
    placeId: candidatePlaceId(candidate),
    lat,
    lng,
    name: candidateName(candidate) || name,
    details: candidate,
  })

  const photo = enrichment.photos[0]
  if (!photo?.url) return null

  return {
    url: photo.url,
    source: photo.source,
    attribution: photo.attribution,
    license: photo.license,
    licenseUrl: photo.licenseUrl,
    sourceUrl: photo.sourceUrl,
  }
}

export function useDestinationVisual(
  name: string,
  country: string,
  searchTerm = '',
): { visual: DestinationVisual | null; loading: boolean } {
  const key = normalize([name, country].filter(Boolean).join('|'))
  const [visual, setVisual] = useState<DestinationVisual | null>(null)
  const [loading, setLoading] = useState(Boolean(key))

  useEffect(() => {
    let cancelled = false
    if (!key) {
      setVisual(null)
      setLoading(false)
      return
    }

    setLoading(true)
    let pending = cache.get(key)
    if (!pending) {
      pending = schedule(() =>
        resolveDestinationVisual(name, country, searchTerm).catch(() => null)
      )
      cache.set(key, pending)
    }

    void pending.then(result => {
      if (cancelled) return
      setVisual(result)
      setLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [key, name, country, searchTerm])

  return { visual, loading }
}
