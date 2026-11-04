import { Typography } from '@mui/material'
import type { ActionContext } from '../../../../data/action_context'
import { usePopupTarget } from './use_popup_target'

interface ActionPopupTitleProps {
    context: ActionContext
    titleId: string
}

/** Visually hidden accessible popup title naming the target card. */
export function ActionPopupTitle({ context, titleId }: ActionPopupTitleProps) {
    const { id } = usePopupTarget(context)

    return (
        <Typography
            id={titleId}
            sx={{ clip: 'rect(0 0 0 0)', clipPath: 'inset(50%)', height: 1, overflow: 'hidden', position: 'absolute', whiteSpace: 'nowrap', width: 1 }}
        >
            {id ? `Run actions for ${id}` : 'Run actions'}
        </Typography>
    )
}
