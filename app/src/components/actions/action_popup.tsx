import { useId, useMemo, useState } from 'react'
import { actionsForContext, type ActionContext } from '../../data/action_context'
import { CUSTOM_PROMPT_ACTION_ID } from '../../data/action_types'
import type { AgentConversation } from '../../data/data_types'
import { useActions } from '../hooks/use_actions'
import { ActionPopupContent } from './action_popup_content'

export { CARD_RUN_POPUP_SIZE_STORAGE_KEY, PROJECT_AGENT_POPUP_SIZE_STORAGE_KEY } from './action_popup_content'

interface ActionPopupProps {
    anchorElement: HTMLElement | null
    context: ActionContext
    onClose: () => void
    onConversationViewed?: (conversation: AgentConversation) => void
}

/** Universal action selector and execution popup for the supplied context. */
export function ActionPopup(props: ActionPopupProps) {
    const { anchorElement, context } = props
    const { actions: loadedActions } = useActions()
    const actions = useMemo(() => {
        const contextActions = actionsForContext(loadedActions, context)
        const customPrompt = contextActions.find(({ id }) => id === CUSTOM_PROMPT_ACTION_ID)
        const configuredActions = contextActions.filter(({ id }) => id !== CUSTOM_PROMPT_ACTION_ID)

        return customPrompt ? [...configuredActions, customPrompt] : configuredActions
    }, [context, loadedActions])
    const [selectedActionId, setSelectedActionId] = useState<string | null>(null)
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
            fullHeight={fullHeight}
            onAddAction={handleAddAction}
            onSelectAction={handleSelectAction}
            onToggleFullHeight={handleToggleFullHeight}
            open={!!anchorElement}
            showSaveControls={showSaveControls}
            titleId={titleId}
        />
    )
}
