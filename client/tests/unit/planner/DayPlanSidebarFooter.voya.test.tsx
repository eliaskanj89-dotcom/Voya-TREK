import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DayPlanSidebarFooter } from '../../../src/components/Planner/DayPlanSidebarFooter'

const t = (key: string) => key === 'dayplan.totalCost' ? 'Total cost' : key

describe('DayPlanSidebarFooter Voya price trust', () => {
  it('VOYA-COST-001: keeps ordinary total label when all prices are known', () => {
    render(<DayPlanSidebarFooter totalCostLabel="€120" unpricedVoyaSuggestionCount={0} t={t} />)

    expect(screen.getByText('Total cost')).toBeInTheDocument()
    expect(screen.getByText('€120')).toBeInTheDocument()
    expect(screen.queryByText(/unverified/i)).toBeNull()
  })

  it('VOYA-COST-002: labels spend as known and surfaces unknown Voya prices', () => {
    render(<DayPlanSidebarFooter totalCostLabel="€120" unpricedVoyaSuggestionCount={3} t={t} />)

    expect(screen.getByText('Known itinerary spend')).toBeInTheDocument()
    expect(screen.getByText('3 prices unverified')).toBeInTheDocument()
    expect(screen.getByText('€120')).toBeInTheDocument()
  })

  it('VOYA-COST-003: uses singular copy for one unknown Voya price', () => {
    render(<DayPlanSidebarFooter totalCostLabel="$0" unpricedVoyaSuggestionCount={1} t={t} />)

    expect(screen.getByText('1 price unverified')).toBeInTheDocument()
  })
})
