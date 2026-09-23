interface DayPlanSidebarFooterProps {
  totalCostLabel: string | null
  unpricedVoyaSuggestionCount?: number
  t: (key: string, params?: Record<string, any>) => string
}

export function DayPlanSidebarFooter({
  totalCostLabel,
  unpricedVoyaSuggestionCount = 0,
  t,
}: DayPlanSidebarFooterProps) {
  if (!totalCostLabel) return null
  return (
    <div className="border-t border-edge-faint" style={{ flexShrink: 0, padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span className="text-content-faint" style={{ fontSize: 'calc(11px * var(--fs-scale-caption, 1))' }}>
        {unpricedVoyaSuggestionCount > 0 ? 'Known itinerary spend' : t('dayplan.totalCost')}
      </span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {unpricedVoyaSuggestionCount > 0 && (
          <span
            title="Voya suggestions without a stored price are excluded from the known-spend total."
            style={{
              borderRadius: 999, padding: '3px 7px',
              background: 'rgba(245,158,11,.10)', color: '#A16207',
              fontSize: 'calc(9px * var(--fs-scale-caption, 1))', fontWeight: 700,
              whiteSpace: 'nowrap',
            }}
          >
            {unpricedVoyaSuggestionCount} price{unpricedVoyaSuggestionCount === 1 ? '' : 's'} unverified
          </span>
        )}
        <span className="text-content" style={{ fontSize: 'calc(13px * var(--fs-scale-body, 1))', fontWeight: 600 }}>{totalCostLabel}</span>
      </span>
    </div>
  )
}
