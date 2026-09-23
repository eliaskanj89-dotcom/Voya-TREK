// FE-W4TLS-001 to FE-W4TLS-007
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '../../../tests/helpers/render'

import TripLoadingSplash from './TripLoadingSplash'

function stubReducedMotion(reduce: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: vi.fn((query: string) => ({
      matches: reduce && query.includes('reduced-motion'),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  })
}

beforeEach(() => {
  stubReducedMotion(false)
  vi.useFakeTimers({ shouldAdvanceTime: true })
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('TripLoadingSplash', () => {
  it('FE-W4TLS-001: announces itself as a status region labelled with the trip title', () => {
    render(<TripLoadingSplash title="Iceland 2026" />)
    const root = screen.getByRole('status')

    expect(root).toHaveAttribute('aria-label', 'Iceland 2026')
    expect(screen.getByText('Iceland 2026')).toBeInTheDocument()
  })

  it('FE-W4TLS-002: falls back to the Voya wordmark without a title', () => {
    render(<TripLoadingSplash />)

    expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'Voya')
    expect(screen.getByText('Voya')).toBeInTheDocument()
  })

  it('FE-W4TLS-003: starts on the Voya packing phase', () => {
    const { container } = render(<TripLoadingSplash />)

    expect(container.querySelector('.voya-splash-mark')).toHaveAttribute('data-phase', 'pack')
  })

  it('FE-W4TLS-004: advances through the Voya loading phases and loops', () => {
    const { container } = render(<TripLoadingSplash />)
    const phase = () => container.querySelector('.voya-splash-mark')?.getAttribute('data-phase')

    act(() => { vi.advanceTimersByTime(1400) })
    expect(phase()).toBe('route')

    act(() => { vi.advanceTimersByTime(1400 * 2) })
    expect(phase()).toBe('arrive')

    act(() => { vi.advanceTimersByTime(1400) })
    expect(phase()).toBe('pack')
  })

  it('FE-W4TLS-005: widens the beat dot of the active step', () => {
    const { container } = render(<TripLoadingSplash />)
    const dots = () => Array.from(container.querySelectorAll('.rounded-full')) as HTMLElement[]

    expect(dots().map(d => d.style.width)).toEqual(['20px', '6px', '6px', '6px'])

    act(() => { vi.advanceTimersByTime(1400) })
    expect(dots().map(d => d.style.width)).toEqual(['6px', '20px', '6px', '6px'])
  })

  it('FE-W4TLS-006: parks on the loading-photos step under reduced motion', () => {
    stubReducedMotion(true)
    const { container } = render(<TripLoadingSplash />)

    expect(container.querySelector('.voya-splash-mark')).toHaveAttribute('data-phase', 'visual')

    act(() => { vi.advanceTimersByTime(1400 * 3) })
    expect(container.querySelector('.voya-splash-mark')).toHaveAttribute('data-phase', 'visual')
    expect((container.querySelectorAll('.rounded-full')[2] as HTMLElement).style.width).toBe('20px')
  })

  it('FE-W4TLS-007: skips the Voya mark entry animation under reduced motion', () => {
    stubReducedMotion(true)
    const { container } = render(<TripLoadingSplash />)
    const stage = container.querySelector('.voya-splash-mark') as HTMLElement

    expect(stage.style.animation).toBe('')
  })
})
