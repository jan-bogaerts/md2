import { useId, useMemo, useState } from 'react'
import { displayActionsForContext, projectContextWithWorktree, type ActionContext } from '../../data/action_context'
import { CUSTOM_PROMPT_ACTION_ID } from '../../data/action_types'
import type { AgentConversation } from '../../data/data_types'
import { useActions } from '../hooks/use_actions'
import { useProjectState } from '../hooks/use_project_state'
import { useProjectActionWorktree, useWorktrees } from '../hooks/use_worktrees'
import { ActionPopupContent } from './action_popup_content'

export { CARD_RUN_POPUP_SIZE_STORAGE_KEY, PROJECT_AGENT_POPUP_SIZE_STORAGE_KEY } from './action_popup_content'

interface ActionPopupProps {
    anchorElement: HTMLElement | null
    context: ActionContext
    draggable?: boolean
    initialActionId?: string
    onClose: () => void
    onConversationViewed?: (conversation: AgentConversation) => void
    open?: boolean
}

/** Universal action selector and execution popup for the supplied context. */
export function ActionPopup(props: ActionPopupProps) {
    const { anchorElement, context, initialActionId, open } = props
    const { actions: loadedActions } = useActions()
    const { project } = useProjectState()
    const projectActionWorktree = useProjectActionWorktree()
    const worktrees = useWorktrees()
    const effectiveContext = useMemo(
        () => projectContextWithWorktree(context, projectActionWorktree),
        [context, projectActionWorktree],
    )
    const actions = useMemo(() => displayActionsForContext(loadedActions, effectiveContext), [effectiveContext, loadedActions])
    const [selectedActionId, setSelectedActionId] = useState<string | null>(initialActionId ?? null)
    const [showSaveControls, setShowSaveControls] = useState(false)
    const [fullHeight, setFullHeight] = useState(false)
    const titleId = useId()
    const selectedAction = actions.find(({ id }) => id === selectedActionId) ?? actions[0] ?? null

    const handleSelectAction = (actionId: string) => {
        setSelectedActionId(actionId)
        setShowSaveControls(false)
    }

    const handleAddAction = () => {
        const customPrompt = actions.find(({ id }) => id === CUSTOM_PROMPT_ACTION_ID)
        if (!customPrompt) throw new Error('Missing custom prompt action')

        setSelectedActionId(customPrompt.id)
        setShowSaveControls((current) => !current)
    }

    const handleToggleFullHeight = () => setFullHeight((current) => !current)

    if (!selectedAction) return null

    return (
        <ActionPopupContent
            {...props}
            action={selectedAction}
            actions={actions}
            assignmentContext={effectiveContext}
            baseContext={context}
            fullHeight={fullHeight}
            onAddAction={handleAddAction}
            onSelectAction={handleSelectAction}
            onToggleFullHeight={handleToggleFullHeight}
            open={open ?? !!anchorElement}
            primaryPath={project?.rootPath ?? project?.id ?? null}
            showSaveControls={showSaveControls}
            titleId={titleId}
            worktrees={worktrees}
        />
    )
}
