import {
    Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Select, Stack, Typography,
} from '@mui/material'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useEffect, useMemo, useSyncExternalStore, type KeyboardEvent } from 'react'
import type { ProjectSnapshot } from '../../../../data/data_types'
import { dataService } from '../../../../services/data/data_service'
import { dialogService } from '../../../../services/dialog_service'
import { useActions } from '../../../hooks/use_actions'
import { useClaudeRateLimits } from '../../../hooks/use_claude_rate_limits'
import { useCodexRateLimits } from '../../../hooks/use_codex_rate_limits'
import { useProjectConfig } from '../../../hooks/use_project_config'
import { accountTrackerOptions, cardScheduleOptions, scheduleTargetStates } from '../schedule/action_schedule_options'
import { ScheduleTriggerFields, type ScheduleTriggerFieldsChange, type ScheduleTriggerSnapshot } from '../schedule/schedule_trigger_fields'
import { cardSequenceActions } from './card_sequence_actions'
import { CardSequenceActionSelector } from './card_sequence_action_selector'
import { CardSequenceCardPicker } from './card_sequence_card_picker'
import { cardSequenceDraftService, type CardSequenceDraftService } from './card_sequence_draft_service'
import { CARD_SEQUENCE_DROP_ID, cardSequenceItemId } from './card_sequence_dnd'
import { registerCardSequence } from './card_sequence_registration'
import { CardSequenceRow } from './card_sequence_row'

const EMPTY_CARDS: ProjectSnapshot['activeCards'] = []

function subscribeActiveCards(listener: () => void) {
    dataService.addEventListener('changed', listener)

    return () => dataService.removeEventListener('changed', listener)
}

function getActiveCards() {
    return dataService.getState().snapshot?.activeCards ?? EMPTY_CARDS
}

function isEditableTarget(target: EventTarget | null) {
    if (!(target instanceof HTMLElement)) return false

    return target.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)
}

function triggerSnapshot(snapshot: ReturnType<CardSequenceDraftService['getSnapshot']>): ScheduleTriggerSnapshot {
    if (snapshot.triggerType === 'now') return { triggerType: 'now' }

    return snapshot as ScheduleTriggerSnapshot
}

interface CardSequenceDialogProps {
    service?: CardSequenceDraftService
}

/** Wide ordered-card sequence builder hosted inside board DnD context. */
export function CardSequenceDialog({ service = cardSequenceDraftService }: CardSequenceDialogProps) {
    const snapshot = useSyncExternalStore(service.subscribe, service.getSnapshot, service.getSnapshot)
    const activeCards = useSyncExternalStore(subscribeActiveCards, getActiveCards, getActiveCards)
    const { actions } = useActions()
    const projectConfig = useProjectConfig()
    const claudeState = useClaudeRateLimits()
    const codexState = useCodexRateLimits()
    const { setNodeRef } = useDroppable({ id: CARD_SEQUENCE_DROP_ID })
    const selectedCards = useMemo(() => snapshot.cardInternalIds.flatMap((cardInternalId) => {
        const card = activeCards.find(({ header }) => header.internalId === cardInternalId)

        return card ? [card] : []
    }), [activeCards, snapshot.cardInternalIds])
    const availableActions = useMemo(
        () => cardSequenceActions(actions, selectedCards, projectConfig?.cardTypes ?? []),
        [actions, projectConfig?.cardTypes, selectedCards],
    )
    const readyStates = useMemo(() => scheduleTargetStates(projectConfig?.states), [projectConfig?.states])
    const accountTrackers = useMemo(() => accountTrackerOptions(claudeState, codexState), [claudeState, codexState])
    const triggerCards = useMemo(
        () => cardScheduleOptions(activeCards, undefined)
            .filter(({ cardInternalId }) => !snapshot.cardInternalIds.includes(cardInternalId)),
        [activeCards, snapshot.cardInternalIds],
    )
    const addableCards = useMemo(
        () => activeCards.filter(({ header }) => !!header.internalId && !snapshot.cardInternalIds.includes(header.internalId)),
        [activeCards, snapshot.cardInternalIds],
    )

    useEffect(() => {
        service.updateSources({
            actionIds: availableActions.map(({ id }) => id),
            cardsAvailable: selectedCards.length === snapshot.cardInternalIds.length,
            readyStates,
            triggerSources: { accountTrackers, cards: triggerCards, targetStates: readyStates },
        })
    }, [accountTrackers, availableActions, readyStates, selectedCards.length, service, snapshot.cardInternalIds.length, triggerCards])

    const handleClose = () => service.close()
    const handleActionSelect = (actionId: string) => service.setActionId(actionId)
    const handleReadyStateChange = (event: { target: { value: unknown } }) => service.setReadyState(event.target.value as string)
    const handleTriggerChange = (change: ScheduleTriggerFieldsChange) => {
        if (change.type === 'trigger-type') service.setTriggerType(change.triggerType)
        else if (change.type === 'timestamp') service.setTimestamp(change.timestamp)
        else if (change.type === 'agent') service.setAgent(change.agent)
        else if (change.type === 'tracker') service.setAccountTracker(change.limitId, change.windowId)
        else if (change.type === 'card') service.setTriggerCard(change.cardInternalId)
        else service.setTargetState(change.targetState)
    }
    const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key !== 'Delete' || isEditableTarget(event.target) || !snapshot.selectedCardInternalId) return

        event.preventDefault()
        service.removeCard(snapshot.selectedCardInternalId)
    }
    const handleSubmit = async () => {
        service.setSubmitting(true)
        try {
            await registerCardSequence(service.createRegistrationRequest())
            service.close()
        } catch (error) {
            service.setSubmitting(false)
            dialogService.error(error, { fallbackMessage: 'Card sequence could not be registered' })
        }
    }
    const submitLabel = snapshot.triggerType === 'now' ? 'Start' : 'Schedule'
    const sortableIds = snapshot.cardInternalIds.map(cardSequenceItemId)

    return (
        <Dialog
            aria-modal={false}
            disableEnforceFocus
            disableScrollLock
            fullWidth
            hideBackdrop
            maxWidth="md"
            onClose={handleClose}
            open={snapshot.open}
            sx={{ pointerEvents: 'none', '& .MuiDialog-paper': { maxHeight: '82vh', pointerEvents: 'auto' } }}
        >
            <Box sx={{ borderBottom: '1px solid', borderColor: 'divider', flexShrink: 0 }}>
                <DialogTitle>Add card sequence</DialogTitle>
                <Box sx={{ px: 3, pb: 2 }}>
                    <CardSequenceActionSelector
                        actions={availableActions}
                        onSelect={handleActionSelect}
                        selectedActionId={snapshot.actionId}
                    />
                </Box>
            </Box>
            <DialogContent onKeyDown={handleKeyDown} sx={{ display: 'flex', gap: 2, minHeight: 0, overflowY: 'auto', py: 2 }}>
                <Stack spacing={1} sx={{ flex: 1, minWidth: 0 }}>
                    <Box sx={{ alignItems: 'center', display: 'flex', gap: 1 }}>
                        <Typography color="text.secondary" variant="subtitle2">Cards</Typography>
                        <Box sx={{ flex: 1 }} />
                        <CardSequenceCardPicker cards={addableCards} service={service} />
                    </Box>
                    <Box
                        aria-label="Sequence cards"
                        ref={setNodeRef}
                        role="listbox"
                        sx={{
                            border: snapshot.cardInternalIds.length === 0 ? '1.5px dashed' : 0,
                            borderColor: 'custom.borderStrong',
                            borderRadius: 1.25,
                            minHeight: 160,
                            p: snapshot.cardInternalIds.length === 0 ? 2 : 0,
                        }}
                    >
                        <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
                            <Stack spacing={1}>
                                {selectedCards.map((card) => (
                                    <CardSequenceRow
                                        card={card}
                                        key={card.header.internalId}
                                        selected={snapshot.selectedCardInternalId === card.header.internalId}
                                        service={service}
                                    />
                                ))}
                                {snapshot.cardInternalIds.length === 0 ? (
                                    <Typography color="custom.text4" sx={{ py: 4, textAlign: 'center' }}>
                                        Drop active cards here or use Add cards
                                    </Typography>
                                ) : null}
                            </Stack>
                        </SortableContext>
                    </Box>
                </Stack>
                <Stack spacing={1.5} sx={{ flex: 1, minWidth: 0 }}>
                    <Typography color="text.secondary" variant="caption">Ready state</Typography>
                    <Select inputProps={{ 'aria-label': 'Ready state' }} onChange={handleReadyStateChange} size="small" value={snapshot.readyState}>
                        {readyStates.map((state) => <MenuItem key={state} value={state}>{state}</MenuItem>)}
                    </Select>
                    <ScheduleTriggerFields
                        accountTrackers={accountTrackers}
                        cards={triggerCards}
                        includeNow
                        onChange={handleTriggerChange}
                        snapshot={triggerSnapshot(snapshot)}
                        targetStates={readyStates}
                    />
                    {snapshot.validationMessage ? (
                        <Typography color="text.secondary" role="status" variant="caption">{snapshot.validationMessage}</Typography>
                    ) : null}
                </Stack>
            </DialogContent>
            <DialogActions sx={{ bgcolor: 'background.default', borderTop: '1px solid', borderColor: 'divider', flexShrink: 0 }}>
                <Button disabled={snapshot.submitStatus === 'submitting'} onClick={handleClose} variant="outlined">Cancel</Button>
                <Button disabled={!snapshot.canSubmit} onClick={handleSubmit} variant="contained">{submitLabel}</Button>
            </DialogActions>
        </Dialog>
    )
}
