import { useId, useMemo, useState } from 'react'
import { displayActionsForContext, projectContextWithWorktree, type ActionContext } from '../../data/action_context'
import { CUSTOM_PROMPT_ACTION_ID } from '../../data/action_types'
import { dialogService } from '../../services/dialog_service'
import { useActions } from '../hooks/use_actions'
import { useProjectState } from '../hooks/use_project_state'
import { useProjectActionWorktree } from '../hooks/use_worktrees'
import { ActionPopupContent } from './action_popup_content'

export { CARD_RUN_POPUP_SIZE_STORAGE_KEY, PROJECT_AGENT_POPUP_SIZE_STORAGE_KEY } from './action_popup_content'

function resolvePopupTarget(context: ActionContext, snapshot: ReturnType<typeof useProjectState>['snapshot']) {
    if (context.kind === 'project') return 'Project'
    if (context.kind !== 'card') return null

    const cards = [...(snapshot?.activeCards ?? []), ...(snapshot?.backgroundCards ?? [])]

    return cards.find(({ header }) => header.internalId === context.cardInternalId)?.header.id ?? null
}

interface ActionPopupProps {
    anchorElement: HTMLElement | null
    context: ActionContext
    draggable?: boolean
    initialActionId?: string
    onActivate?: () => void
    onClose: () => void
    open?: boolean
    popupEntryId?: string
    stackPosition?: number
}

/** Universal action selector and run popup for the supplied context. */
export function ActionPopup(props: ActionPopupProps) {
    const { anchorElement, context, initialActionId, open } = props
    const { actions: loadedActions } = useActions()
    const { project, snapshot } = useProjectState()
    const projectActionWorktree = useProjectActionWorktree()
    const effectiveContext = useMemo(
        () => projectContextWithWorktree(context, projectActionWorktree),
        [context, projectActionWorktree],
    )
    const actions = useMemo(() => displayActionsForContext(loadedActions, effectiveContext), [effectiveContext, loadedActions])
    const [selectedActionId, setSelectedActionId] = useState<string | null>(initialActionId ?? actions[0]?.id ?? null)
    const [showSaveControls, setShowSaveControls] = useState(false)
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

    const handleSelectAction = (actionId: string) => {
        setSelectedActionId(actionId)
        setShowSaveControls(false)
    }

    const handleAddAction = () => {
        try {
            const customPrompt = actions.find(({ id }) => id === CUSTOM_PROMPT_ACTION_ID)
            if (!customPrompt) throw new Error('Missing custom prompt action')

            setSelectedActionId(customPrompt.id)
            setShowSaveControls((current) => !current)
        } catch (error) {
            dialogService.error(error, { fallbackMessage: 'Custom action editor could not be opened' })
        }
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
            onAddAction={handleAddAction}
            onSelectAction={handleSelectAction}
            onToggleFullHeight={handleToggleFullHeight}
            open={open ?? !!anchorElement}
            primaryPath={project?.rootPath ?? project?.id ?? null}
            showSaveControls={showSaveControls}
            target={target}
            titleId={titleId}
        />
    )
}
