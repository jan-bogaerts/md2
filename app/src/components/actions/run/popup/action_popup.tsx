import { useId, useMemo, useState } from 'react'
import { displayActionsForContext, projectContextWithWorktree, type ActionContext } from '../../../../data/action_context'
import { dataService } from '../../../../services/data/data_service'
import { actionRunRegistry } from '../../../../services/actions/action_run_registry'
import { actionPromptDraftService } from '../../../../services/actions/action_prompt_draft_service'
import { cardAgentState } from '../../../../services/agents/card_agent_state'
import { isReleasedCardActionContext, RELEASED_CARD_RUN_MESSAGE } from '../../../../../../shared/released_card_actions.mjs'
import { useActions } from '../../../hooks/use_actions'
import { useProjectState } from '../../../hooks/use_project_state'
import { useProjectActionWorktree } from '../../../hooks/use_worktrees'
import { ActionPopupContent } from './action_popup_content'
import { resolveInitialActionId, type PersistedActionStates } from './action_popup_initial_action'

export { CARD_RUN_POPUP_SIZE_STORAGE_KEY, PROJECT_AGENT_POPUP_SIZE_STORAGE_KEY } from './action_popup_content'

function resolvePopupTarget(context: ActionContext, snapshot: ReturnType<typeof useProjectState>['snapshot']) {
    if (context.kind === 'project') return 'Project'
    if (context.kind !== 'card') return null

    const cards = [...(snapshot?.activeCards ?? []), ...(snapshot?.backgroundCards ?? [])]

    return cards.find(({ header }) => header.internalId === context.cardInternalId)?.header.id ?? null
}

function resolveCardInternalId(context: ActionContext, snapshot: ReturnType<typeof useProjectState>['snapshot']) {
    const cards = [...(snapshot?.activeCards ?? []), ...(snapshot?.backgroundCards ?? [])]
    const card = context.cardInternalId
        ? cards.find(({ header }) => header.internalId === context.cardInternalId)
        : cards.find(({ path }) => path === context.file)

    return card?.header.internalId ?? context.cardInternalId ?? null
}

function persistedActionStates(
    actions: ReturnType<typeof displayActionsForContext>,
    context: ActionContext,
    snapshot: ReturnType<typeof useProjectState>['snapshot'],
) {
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
    initialRunId?: string
    onActivate?: () => void
    onClose: () => void
    open?: boolean
    popupEntryId?: string
    stackPosition?: number
}

/** Universal action selector and run popup for the supplied context. */
export function ActionPopup(props: ActionPopupProps) {
    const { anchorElement, context, initialActionId, initialRunId, onClose, open } = props
    const { actions: loadedActions } = useActions()
    const { project, snapshot } = useProjectState()
    const projectActionWorktree = useProjectActionWorktree()
    const effectiveContext = useMemo(
        () => projectContextWithWorktree(context, projectActionWorktree),
        [context, projectActionWorktree],
    )
    const actions = useMemo(() => displayActionsForContext(loadedActions, effectiveContext), [effectiveContext, loadedActions])
    const [selectedActionId, setSelectedActionId] = useState<string | null>(() => resolveInitialActionId(
        actions,
        initialActionId,
        actionRunRegistry.getContextActiveSnapshot(effectiveContext),
        persistedActionStates(actions, effectiveContext, snapshot),
    ))
    const [fullHeight, setFullHeight] = useState(false)
    const titleId = useId()
    // A run that edits its own card changes the context (state, title, worktree), so the
    // selected action can drop out of the filtered list mid-run. Keep it selectable instead
    // of closing the popup or silently switching to another action.
    const retainedAction = selectedActionId ? loadedActions.find(({ id }) => id === selectedActionId) ?? null : null
    const selectedAction = actions.find(({ id }) => id === selectedActionId) ?? retainedAction ?? actions[0] ?? null
    const selectableActions = selectedAction && !actions.some(({ id }) => id === selectedAction.id)
        ? [...actions, selectedAction]
        : actions
    const target = resolvePopupTarget(context, snapshot)
    const releasesFolder = dataService.getConfig()?.releasesFolder
    const readOnlyMessage = releasesFolder && isReleasedCardActionContext(effectiveContext, releasesFolder)
        ? RELEASED_CARD_RUN_MESSAGE
        : null

    const handleSelectAction = (actionId: string) => {
        setSelectedActionId(actionId)
    }

    const handleClose = () => {
        actionPromptDraftService.deleteEmptyDrafts()
        onClose()
    }

    const handleToggleFullHeight = () => setFullHeight((current) => !current)

    if (!selectedAction) return null

    return (
        <ActionPopupContent
            {...props}
            action={selectedAction}
            actions={selectableActions}
            assignmentContext={effectiveContext}
            baseContext={context}
            fullHeight={fullHeight}
            initialRunId={selectedAction.id === initialActionId ? initialRunId : undefined}
            onClose={handleClose}
            onSelectAction={handleSelectAction}
            onToggleFullHeight={handleToggleFullHeight}
            open={open ?? !!anchorElement}
            primaryPath={project?.rootPath ?? project?.id ?? null}
            readOnlyMessage={readOnlyMessage}
            target={target}
            titleId={titleId}
        />
    )
}
