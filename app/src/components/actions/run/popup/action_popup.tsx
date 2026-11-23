import { useCallback, useEffect, useId, useMemo, useState, useSyncExternalStore } from 'react'
import { displayActionsForContext, type ActionContext } from '../../../../data/action_context'
import { dataService } from '../../../../services/data/data_service'
import { actionRunRegistry } from '../../../../services/actions/action_run_registry'
import { actionPromptDraftService } from '../../../../services/actions/action_prompt_draft_service'
import { cardAgentState } from '../../../../services/agents/card_agent_state'
import { historicalCardActivityService } from '../../../../services/actions/historical_card_activity_service'
import { CUSTOM_PROMPT_ACTION_ID, type ActionDefinition } from '../../../../data/action_types'
import type { ProjectSnapshot } from '../../../../data/data_types'
import { isReleasedCardActionContext, RELEASED_CARD_RUN_MESSAGE } from '../../../../../../shared/released_card_actions.mjs'
import { useActions } from '../../../hooks/use_actions'
import { useProjectReference } from '../../../hooks/use_project_reference'
import { useActionAssignmentContext } from '../../../hooks/use_action_assignment_context';
import { useActionVisibilityConversations } from '../../../hooks/use_action_visibility_conversations'
import { ActionPopupContent } from './action_popup_content'
import { ActionPopupEmptyState } from './action_popup_empty_state'
import { resolveInitialActionId, type PersistedActionStates } from './action_popup_initial_action'
import { historicalActionHistory, historicalCardActions } from './historical_card_actions'
import { useHistoricalActivityKey } from './use_historical_activity_key'
import { allPopupActions, liveConversationLogActions } from './action_visibility'
import {
    actionVisibilityModeStore,
    type ActionVisibilityMode,
} from './action_visibility_mode_store'

export { CARD_RUN_POPUP_SIZE_STORAGE_KEY, PROJECT_AGENT_POPUP_SIZE_STORAGE_KEY } from './action_popup_content'

function resolveCardInternalId(context: ActionContext, snapshot: ProjectSnapshot | null) {
    const cards = [...(snapshot?.activeCards ?? []), ...(snapshot?.backgroundCards ?? [])]
    const card = context.cardInternalId
        ? cards.find(({ header }) => header.internalId === context.cardInternalId)
        : cards.find(({ path }) => path === context.file)

    return card?.header.internalId ?? context.cardInternalId ?? null
}

function resolveColumnDefaultActionId(context: ActionContext) {
    if (context.kind !== 'card' || !context.state) return undefined

    return dataService.getConfig()?.states.find(({ state }) => state === context.state)?.defaultActionId
}

function persistedActionStates(
    actions: ReturnType<typeof displayActionsForContext>,
    context: ActionContext,
    snapshot: ProjectSnapshot | null,
) {
    if (context.kind === 'project') {
        const conversations = dataService.agents.getProjectAgentConversationsSnapshot()

        return Object.fromEntries(actions.map(({ id }) => [
            id,
            cardAgentState(conversations.filter((conversation) => conversation.actionId === id)),
        ])) as PersistedActionStates
    }

    const cardInternalId = resolveCardInternalId(context, snapshot)
    if (!cardInternalId) return {}

    const conversations = dataService.agents.getAgentConversations(cardInternalId)

    return Object.fromEntries(actions.map(({ id }) => [
        id,
        cardAgentState(conversations.filter((conversation) => conversation.actionId === id)),
    ])) as PersistedActionStates
}

interface ActionPopupProps {
    anchorElement: HTMLElement | null
    context: ActionContext
    draggable?: boolean
    initialActionId?: string
    initialConversationPath?: string
    initialRunId?: string
    onActivate?: () => void
    onClose: () => void
    open?: boolean
    popupEntryId?: string
    popupVisible?: boolean
    stackPosition?: number
    subscribeFocusRequest?: (listener: () => void) => () => void
}

/** Universal action selector and run popup for the supplied context. */
export function ActionPopup(props: ActionPopupProps) {
    const { anchorElement, context, initialActionId, initialConversationPath, initialRunId, onClose, open } = props
    const { actions: loadedActions } = useActions()
    const project = useProjectReference()
    const effectiveContext = useActionAssignmentContext(context);
    const applicableActions = useMemo(() => displayActionsForContext(loadedActions, effectiveContext), [effectiveContext, loadedActions])
    const releasesFolder = dataService.getConfig()?.releasesFolder
    const released = !!releasesFolder && isReleasedCardActionContext(effectiveContext, releasesFolder)
    const storedVisibilityMode = useSyncExternalStore(
        actionVisibilityModeStore.subscribe,
        actionVisibilityModeStore.getSnapshot,
        actionVisibilityModeStore.getSnapshot,
    )
    const actionVisibilityMode: ActionVisibilityMode = storedVisibilityMode
        ?? (released ? 'has-conversation-log' : 'specific-for-context')
    const liveConversations = useActionVisibilityConversations(effectiveContext)
    const activityKey = useHistoricalActivityKey(context, releasesFolder)
    const historicalCardInternalId = activityKey ? context.cardInternalId ?? null : null
    const subscribeActivity = useCallback((listener: () => void) => activityKey
        ? historicalCardActivityService.subscribe(activityKey, listener)
        : () => undefined, [activityKey])
    const getActivitySnapshot = useCallback(() => activityKey
        ? historicalCardActivityService.getSnapshot(activityKey)
        : null, [activityKey])
    const activities = useSyncExternalStore(subscribeActivity, getActivitySnapshot, getActivitySnapshot)
    useEffect(() => {
        if (!historicalCardInternalId || !activityKey) return
        const controller = new AbortController()
        void historicalCardActivityService.load(activityKey, historicalCardInternalId, controller.signal)

        return () => controller.abort()
    }, [activityKey, historicalCardInternalId])
    const actions = useMemo(() => {
        if (actionVisibilityMode === 'all') return allPopupActions(loadedActions)
        if (actionVisibilityMode === 'specific-for-context') return applicableActions
        if (activityKey) return activities ? historicalCardActions(loadedActions, activities) : []

        return liveConversationLogActions(loadedActions, liveConversations)
    }, [actionVisibilityMode, activities, activityKey, applicableActions, liveConversations, loadedActions])
    const activeRuns = actionRunRegistry.getContextActiveSnapshot(effectiveContext)
    const [selection, setSelection] = useState(() => {
        const resolvedActionId = resolveInitialActionId(
            actions,
            initialActionId,
            activeRuns,
            persistedActionStates(actions, effectiveContext, dataService.getState().snapshot),
            resolveColumnDefaultActionId(effectiveContext),
        )
        const actionId = actions.some(({ id }) => id === resolvedActionId) ? resolvedActionId : actions[0]?.id ?? null

        return { actionId, actions }
    })
    let selectedActionId = selection.actionId
    const [fullHeight, setFullHeight] = useState(false)
    const titleId = useId()
    // A run that edits its own card changes the context (state, title, worktree), so the
    // selected action can drop out of the filtered list mid-run. Keep it selectable instead
    // of closing the popup or silently switching to another action.
    const selectedActionIsRunning = !!selectedActionId
        && activeRuns.some(({ rootActionId }) => rootActionId === selectedActionId)
    const retainedAction = actionVisibilityMode === 'specific-for-context' && selectedActionIsRunning && selectedActionId
        ? loadedActions.find(({ id }) => id === selectedActionId) ?? null
        : null
    let selectedAction: ActionDefinition | null = actions.find(({ id }) => id === selectedActionId)
        ?? retainedAction
        ?? actions[0]
        ?? null
    if (selection.actions !== actions) {
        selectedActionId = selectedAction?.id ?? null
        setSelection({ actionId: selectedActionId, actions })
        selectedAction = actions.find(({ id }) => id === selectedActionId) ?? retainedAction ?? null
    }
    const selectableActions = selectedAction && !actions.some(({ id }) => id === selectedAction.id)
        ? [...actions, selectedAction]
        : actions
    const historicalSelectionReadOnly = !!activityKey && selectedAction
        && selectedAction.id !== CUSTOM_PROMPT_ACTION_ID
        && !applicableActions.some(({ id }) => id === selectedAction.id)
    const readOnlyMessage = released
        ? RELEASED_CARD_RUN_MESSAGE
        : historicalSelectionReadOnly
            ? 'Historical action cannot be run in this card context.'
            : null
    const historicalEntries = useMemo(() => activities && selectedAction && project
        ? historicalActionHistory(activities, selectedAction.id, project.rootPath ?? project.id)
        : null, [activities, selectedAction, project])

    const handleSelectAction = (actionId: string) => {
        setSelection({ actionId, actions })
    }

    const handleClose = () => {
        actionPromptDraftService.deleteEmptyDrafts()
        onClose()
    }

    const handleToggleFullHeight = () => setFullHeight((current) => !current)
    const handleVisibilityModeChange = (mode: ActionVisibilityMode) => actionVisibilityModeStore.setMode(mode)

    if (!selectedAction) {
        return (
            <ActionPopupEmptyState
                {...props}
                actionVisibilityMode={actionVisibilityMode}
                assignmentContext={effectiveContext}
                baseContext={context}
                fullHeight={fullHeight}
                onClose={handleClose}
                onToggleFullHeight={handleToggleFullHeight}
                onVisibilityModeChange={handleVisibilityModeChange}
                open={open ?? !!anchorElement}
                readOnlyMessage={readOnlyMessage}
                titleId={titleId}
            />
        )
    }

    return (
        <ActionPopupContent
            {...props}
            action={selectedAction}
            actions={selectableActions}
            actionVisibilityMode={actionVisibilityMode}
            assignmentContext={effectiveContext}
            baseContext={context}
            fullHeight={fullHeight}
            historicalEntries={historicalEntries}
            initialConversationPath={selectedAction.id === initialActionId ? initialConversationPath : undefined}
            initialRunId={selectedAction.id === initialActionId ? initialRunId : undefined}
            onClose={handleClose}
            onSelectAction={handleSelectAction}
            onToggleFullHeight={handleToggleFullHeight}
            onVisibilityModeChange={handleVisibilityModeChange}
            open={open ?? !!anchorElement}
            primaryPath={project?.rootPath ?? project?.id ?? null}
            readOnlyMessage={readOnlyMessage}
            titleId={titleId}
        />
    )
}
