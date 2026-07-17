import { Button } from '@mui/material'
import Play from 'mdi-material-ui/Play'
import { useMemo, useState } from 'react'
import type { MouseEvent } from 'react'
import { actionsForContext, type ActionContext } from '../../data/action_context'
import { CUSTOM_PROMPT_ACTION_ID, type ActionDefinition } from '../../data/action_types'
import type { AgentConversation } from '../../data/data_types'
import { useActions } from '../hooks/use_actions'
import { ActionPopup } from './action_popup'

interface CardRunButtonProps {
    context: ActionContext
    onConversationViewed: (conversation: AgentConversation) => void
}

/** Opens the card action selector and execution popup from one compact Run button. */
export function CardRunButton({ context, onConversationViewed }: CardRunButtonProps) {
    const { actions } = useActions()
    const [popupAnchor, setPopupAnchor] = useState<HTMLElement | null>(null)
    const [selectedAction, setSelectedAction] = useState<ActionDefinition | null>(null)
    const [showSaveControls, setShowSaveControls] = useState(false)
    const matchingActions = useMemo(() => {
        const contextActions = actionsForContext(actions, context)
        const customPrompt = contextActions.find((action) => action.id === CUSTOM_PROMPT_ACTION_ID)
        const configuredActions = contextActions.filter((action) => action.id !== CUSTOM_PROMPT_ACTION_ID)

        return customPrompt ? [...configuredActions, customPrompt] : configuredActions
    }, [actions, context])

    const closePopup = () => {
        setPopupAnchor(null)
        setSelectedAction(null)
        setShowSaveControls(false)
    }

    const selectAction = (action: ActionDefinition) => {
        setSelectedAction(action)
        setShowSaveControls(false)
    }

    const addAction = () => {
        const customPrompt = matchingActions.find((action) => action.id === CUSTOM_PROMPT_ACTION_ID)
        if (!customPrompt) throw new Error('Missing custom prompt action')

        setSelectedAction(customPrompt)
        setShowSaveControls((current) => !current)
    }

    const handleRun = (event: MouseEvent<HTMLButtonElement>) => {
        if (popupAnchor) {
            closePopup()
            return
        }

        const primaryAction = matchingActions.find((action) => !action.builtin && action.appliesTo !== null)
            ?? matchingActions.find((action) => !action.builtin)
            ?? matchingActions[0]
        if (!primaryAction) throw new Error('Missing card action')

        setShowSaveControls(false)
        setSelectedAction(primaryAction)
        setPopupAnchor(event.currentTarget)
    }

    return (
        <>
            <Button
                onClick={handleRun}
                size="small"
                startIcon={<Play sx={{ fontSize: '13px !important' }} />}
                sx={{ borderRadius: 99, fontSize: 11.5, height: 26, minWidth: 0, px: 1.25 }}
                variant="outlined"
            >
                Run
            </Button>
            {selectedAction ? (
                <ActionPopup
                    action={selectedAction}
                    actions={matchingActions}
                    anchorElement={popupAnchor}
                    context={context}
                    onAddAction={addAction}
                    onClose={closePopup}
                    onConversationViewed={onConversationViewed}
                    onNavigate={selectAction}
                    onSelectAction={selectAction}
                    showSaveControls={showSaveControls}
                />
            ) : null}
        </>
    )
}
