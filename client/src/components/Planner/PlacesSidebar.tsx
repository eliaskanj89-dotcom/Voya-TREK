import React from 'react'
import { Sparkles } from 'lucide-react'
import { ContextMenu } from '../shared/ContextMenu'
import FileImportModal from './FileImportModal'
import ConfirmDialog from '../shared/ConfirmDialog'
import { usePlacesSidebar, type PlacesSidebarProps } from './usePlacesSidebar'
import { PlacesDropOverlay, PlacesHeader } from './PlacesSidebarHeader'
import { PlacesSelectionBar } from './PlacesSidebarSelectionBar'
import { PlacesList } from './PlacesSidebarList'
import { MobileDayPickerSheet } from './PlacesSidebarMobileDayPicker'
import { ListImportModal } from './PlacesSidebarListImportModal'
import { PlacesBulkCategoryModal } from './PlacesBulkCategoryModal'
import SaveTripPlacesToListModal from '../Collections/SaveTripPlacesToListModal'
import DawarichSuggestionsPanel from '../Dawarich/DawarichSuggestionsPanel'
import { formatDayOption } from '../Dawarich/dawarichSuggestionModel'
import { refreshTripAfterAccept } from '../Dawarich/dawarichTripRefresh'
import { useTranslation } from '../../i18n'
import { voyaAiApi } from '../../api/client'
import { useTripStore } from '../../store/tripStore'
import { getApiErrorMessage } from '../../types'

const PlacesSidebar = React.memo(function PlacesSidebar(props: PlacesSidebarProps) {
  const S = usePlacesSidebar(props)
  const {
    sidebarDragOver, handleSidebarDragEnter, handleSidebarDragOver, handleSidebarDragLeave, handleSidebarDrop,
    selectMode, filtered, t, dayPickerPlace, listImportOpen,
    fileImportOpen, setFileImportOpen, sidebarDropFile, setSidebarDropFile, tripId, pushUndo,
    ctxMenu, isMobile, pendingDeleteIds, setPendingDeleteIds, onBulkDeleteConfirm,
    categories, selectedIds, exitSelectMode, onBulkChangeCategory, categoryPickerOpen, setCategoryPickerOpen,
    collectionsEnabled, saveToListOpen, setSaveToListOpen, days, toast,
  } = S
  // The sidebar hook carries `t` but not the locale; day labels need both.
  const { locale } = useTranslation()
  const loadTrip = useTripStore((s) => s.loadTrip)
  const [voyaVerifyBusy, setVoyaVerifyBusy] = React.useState(false)
  const [voyaVerifySummary, setVoyaVerifySummary] = React.useState<{ verified: number; unresolved: number } | null>(null)
  const voyaSuggestionCount = props.places.filter(place =>
    /Suggested by Voya — verify current details before relying on them\./i.test(place.notes || '')
  ).length

  const verifyVoyaSuggestions = async () => {
    if (voyaVerifyBusy || voyaSuggestionCount === 0) return
    setVoyaVerifyBusy(true)
    try {
      const result = await voyaAiApi.verifyTrip({ tripId })
      setVoyaVerifySummary({ verified: result.verified, unresolved: result.unresolved })
      await loadTrip(tripId)
      if (result.verified > 0) {
        toast.success(`Voya matched ${result.verified} suggestion${result.verified === 1 ? '' : 's'} to real map records.`)
      } else {
        toast.warning('Voya could not confidently match these suggestions yet.')
      }
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, 'Voya could not verify these places right now.'))
    } finally {
      setVoyaVerifyBusy(false)
    }
  }

  // Below lg the places sit in their own tab with no plan beside them to drag
  // into. A coarse pointer no longer disables the drag on its own — tablets
  // reach it through a long press (#1616).
  const dragDisabled = isMobile
  return (
    <div
      className="voya-places-sidebar"
      data-touch-drag={dragDisabled ? undefined : ''}
      onDragEnter={dragDisabled ? undefined : handleSidebarDragEnter}
      onDragOver={dragDisabled ? undefined : handleSidebarDragOver}
      onDragLeave={dragDisabled ? undefined : handleSidebarDragLeave}
      onDrop={dragDisabled ? undefined : handleSidebarDrop}
      style={{ display: 'flex', flexDirection: 'column', height: '100%', fontFamily: "var(--font-system)", position: 'relative' }}
    >
      {!dragDisabled && sidebarDragOver && <PlacesDropOverlay {...S} />}
      {/* Kopfbereich */}
      <PlacesHeader {...S} />

      {voyaSuggestionCount > 0 && (
        <div className="voya-verification-card mx-3 mt-3 rounded-[18px] border border-[#A9C9F5]/30 bg-[linear-gradient(145deg,rgba(242,248,255,.90),rgba(255,255,255,.72))] p-3 shadow-[0_10px_28px_rgba(31,67,112,.07)] dark:border-white/8 dark:bg-[linear-gradient(145deg,rgba(21,44,73,.72),rgba(10,25,44,.62))]">
          <div className="flex items-start gap-2.5">
            <span className="mt-0.5 flex h-8 w-8 flex-none items-center justify-center rounded-full bg-[#377CF6]/10 text-[#377CF6]">
              <Sparkles size={14} strokeWidth={2.3} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[12px] font-semibold text-content">
                Verify Voya suggestions
              </div>
              <p className="mt-0.5 text-[11px] leading-relaxed text-content-faint">
                Match {voyaSuggestionCount} suggested place{voyaSuggestionCount === 1 ? '' : 's'} to TREK’s real map providers before relying on them.
              </p>
              {voyaVerifySummary && (
                <div className="mt-2 text-[10px] font-medium text-content-muted">
                  {voyaVerifySummary.verified} matched
                  <span className="mx-1.5 text-content-faint">·</span>
                  {voyaVerifySummary.unresolved} unresolved
                </div>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={() => { void verifyVoyaSuggestions() }}
            disabled={voyaVerifyBusy}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-full bg-[#377CF6] px-3 py-2 text-[11px] font-semibold text-white shadow-[0_8px_18px_rgba(55,124,246,.20)] transition-opacity disabled:cursor-not-allowed disabled:opacity-60"
          >
            {voyaVerifyBusy ? (
              <>
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/35 border-t-white" />
                Checking providers…
              </>
            ) : (
              <>
                <Sparkles size={12} />
                Verify now
              </>
            )}
          </button>
        </div>
      )}

      {/* Anzahl / Auswahl-Leiste */}
      {selectMode ? (
        <PlacesSelectionBar {...S} />
      ) : (
        <div style={{ padding: '6px 16px', flexShrink: 0 }}>
          {/* A badge across the whole rail rather than a line of text hugging the
              left edge: it reads as the list's header instead of as a stray label.
              Outlined rather than filled, because the tertiary surface is a slate
              tone and put a blue cast on the panel. */}
          <div className="text-content-faint" style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '4px 10px', borderRadius: 99,
            background: 'transparent', border: '1px solid var(--border-faint)',
            fontSize: 'calc(11px * var(--fs-scale-caption, 1))', fontWeight: 600,
            textTransform: 'uppercase', letterSpacing: '0.06em',
          }}>
            {filtered.length === 1 ? t('places.countSingular') : t('places.count', { count: filtered.length })}
          </div>
        </div>
      )}

      {/* Liste, with the Dawarich stays riding on top of it inside the same scroller —
          see the `header` prop for why they are not a band of their own. */}
      <PlacesList
        {...S}
        header={(
          <div style={{ padding: '0 12px 8px' }}>
            <DawarichSuggestionsPanel
              tripId={tripId}
              trips={[{ id: tripId, label: t('dawarich.accept.thisTrip') }]}
              daysForTrip={() => days.map(day => ({
                id: day.id,
                ...formatDayOption(day.day_number, day.date, locale, t),
              }))}
              // The place it just created belongs on the map and in the list
              // now, not after a reload.
              onAccepted={() => { void refreshTripAfterAccept(tripId) }}
              initiallyCollapsed
            />
          </div>
        )}
      />

      {dayPickerPlace && <MobileDayPickerSheet {...S} />}
      {listImportOpen && <ListImportModal {...S} />}
      <FileImportModal
        isOpen={fileImportOpen}
        onClose={() => { setFileImportOpen(false); setSidebarDropFile(null) }}
        tripId={tripId}
        pushUndo={pushUndo}
        initialFile={sidebarDropFile}
      />
      <ContextMenu menu={ctxMenu.menu} onClose={ctxMenu.close} />
      {categoryPickerOpen && (
        <PlacesBulkCategoryModal
          count={selectedIds.size}
          categories={categories}
          onClose={() => setCategoryPickerOpen(false)}
          onPick={(catId) => { onBulkChangeCategory?.(Array.from(selectedIds), catId); setCategoryPickerOpen(false); exitSelectMode() }}
        />
      )}
      {collectionsEnabled && (
        <SaveTripPlacesToListModal
          isOpen={saveToListOpen}
          tripId={tripId}
          placeIds={Array.from(selectedIds)}
          onClose={() => setSaveToListOpen(false)}
          onDone={exitSelectMode}
        />
      )}
      {isMobile && (
        <ConfirmDialog
          isOpen={!!pendingDeleteIds?.length}
          onClose={() => setPendingDeleteIds(null)}
          onConfirm={() => { onBulkDeleteConfirm?.(pendingDeleteIds!); setPendingDeleteIds(null) }}
          message={t('trip.confirm.deletePlaces', { count: pendingDeleteIds?.length ?? 0 })}
        />
      )}
    </div>
  )
})

export default PlacesSidebar
