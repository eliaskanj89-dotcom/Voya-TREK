export interface RouteOptimizePoint {
  lat: number
  lng: number
}

export interface RouteOptimizeAnchors {
  start?: RouteOptimizePoint
  end?: RouteOptimizePoint
}

function sqDist(a: RouteOptimizePoint, b: RouteOptimizePoint): number {
  return (a.lat - b.lat) ** 2 + (a.lng - b.lng) ** 2
}

function tourLength(
  order: RouteOptimizePoint[],
  start?: RouteOptimizePoint,
  end?: RouteOptimizePoint,
): number {
  if (order.length === 0) return 0
  let total = 0
  if (start) total += Math.sqrt(sqDist(start, order[0]))
  for (let i = 0; i < order.length - 1; i++) {
    total += Math.sqrt(sqDist(order[i], order[i + 1]))
  }
  if (end) total += Math.sqrt(sqDist(order[order.length - 1], end))
  return total
}

function nearestNeighborOrder<T extends RouteOptimizePoint>(
  valid: T[],
  start?: RouteOptimizePoint,
): T[] {
  const visited = new Set<number>()
  const result: T[] = []
  let current: RouteOptimizePoint

  if (start) {
    current = start
  } else {
    current = valid[0]
    visited.add(0)
    result.push(valid[0])
  }

  while (result.length < valid.length) {
    let nearestIdx = -1
    let minDist = Infinity
    for (let i = 0; i < valid.length; i++) {
      if (visited.has(i)) continue
      const distance = sqDist(valid[i], current)
      if (distance < minDist) {
        minDist = distance
        nearestIdx = i
      }
    }
    if (nearestIdx === -1) break
    visited.add(nearestIdx)
    current = valid[nearestIdx]
    result.push(valid[nearestIdx])
  }

  return result
}

function twoOptImprove<T extends RouteOptimizePoint>(
  order: T[],
  start?: RouteOptimizePoint,
  end?: RouteOptimizePoint,
): T[] {
  if (order.length < 3) return order
  let best = order
  let bestLen = tourLength(best, start, end)
  let improved = true

  while (improved) {
    improved = false
    for (let i = 0; i < best.length - 1; i++) {
      for (let j = i + 1; j < best.length; j++) {
        const candidate = best
          .slice(0, i)
          .concat(best.slice(i, j + 1).reverse(), best.slice(j + 1))
        const length = tourLength(candidate, start, end)
        if (length < bestLen - 1e-12) {
          best = candidate
          bestLen = length
          improved = true
        }
      }
    }
  }

  return best
}

/**
 * Deterministic nearest-neighbor + 2-opt route ordering.
 *
 * This is deliberately provider-free: it works only from coordinates and optional
 * fixed start/end anchors, which makes the result reproducible in browser and server.
 */
export function optimizeRoute<T extends RouteOptimizePoint>(
  places: T[],
  anchors: RouteOptimizeAnchors = {},
): T[] {
  const { start, end } = anchors
  const valid = places.filter(point =>
    Number.isFinite(point.lat) &&
    Number.isFinite(point.lng) &&
    point.lat !== 0 &&
    point.lng !== 0
  )
  if (valid.length <= 1) return places
  if (valid.length === 2 && !start && !end) return places

  const order = twoOptImprove(nearestNeighborOrder(valid, start), start, end)

  if (
    start &&
    end &&
    start.lat === end.lat &&
    start.lng === end.lng &&
    order.length > 1
  ) {
    if (sqDist(order[order.length - 1], start) < sqDist(order[0], start)) {
      order.reverse()
    }
  }

  return order
}
