import { Box, Tooltip } from '@mui/material'
import type { ActionContext } from '../../../../data/action_context'
import { usePopupTarget } from './use_popup_target'

/** Target badge; the only popup part that follows the target card id and title. */
export function ActionPopupTargetBadge({ context }: { context: ActionContext }) {
    const { id, title } = usePopupTarget(context)
    if (!id) return null

    // The badge stays a span carrying only tabIndex: a button or a role attribute would match the
    // popper's INTERACTIVE_SELECTOR, which would stop a pointer press on the badge from dragging the popup.
    const badge = (
        <Box
            component="span"
            sx={{
                bgcolor: 'custom.primaryBg', borderRadius: '5px', color: 'primary.main', flexShrink: 0,
                fontFamily: '"Roboto Mono", ui-monospace, monospace', fontSize: 11.5, fontWeight: 600,
                px: 0.875, py: 0.25,
            }}
            tabIndex={0}
        >
            {id}
        </Box>
    )

    return title ? <Tooltip title={title}>{badge}</Tooltip> : badge
}
