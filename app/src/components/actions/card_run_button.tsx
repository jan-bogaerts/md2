import { Button } from '@mui/material'
import Play from 'mdi-material-ui/Play'
import { useState } from 'react'
import type { MouseEvent } from 'react'
import type { ActionContext } from '../../data/action_context'
import type { AgentConversation } from '../../data/data_types'
import { ActionPopup } from './action_popup'

interface CardRunButtonProps {
    context: ActionContext
    onConversationViewed: (conversation: AgentConversation) => void
}

/** Opens the card action selector and execution popup from one compact Run button. */
export function CardRunButton({ context, onConversationViewed }: CardRunButtonProps) {
    const [popupAnchor, setPopupAnchor] = useState<HTMLElement | null>(null)

    const closePopup = () => {
        setPopupAnchor(null)
    }

    const handleRun = (event: MouseEvent<HTMLButtonElement>) => {
        if (popupAnchor) {
            closePopup()
            return
        }

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
            {popupAnchor ? (
                <ActionPopup
                    anchorElement={popupAnchor}
                    context={context}
                    onClose={closePopup}
                    onConversationViewed={onConversationViewed}
                />
            ) : null}
        </>
    )
}
