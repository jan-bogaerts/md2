import { useMediaQuery, useTheme } from '@mui/material'
import { useSyncExternalStore } from 'react'
import type { ActionContext } from '../../../../data/action_context'
import {
    cardPopupService,
    subscribeCardPopups,
} from '../../../../services/card_popup_service'
import type { WorkspaceViewMode } from '../../../../services/project/workspace_view_service'
import { CardActionPopupHostEntry } from './card_action_popup_host_entry'
import { useWorkspaceView } from '../../../hooks/use_workspace_view'

/**
 * View-mode visibility. Diagram view hides every popup and runs its own. Stats view hides card
 * popups, but keeps the project agent popup, which stays usable there.
 */
function isEntryVisibleInView(context: ActionContext, viewMode: WorkspaceViewMode) {
    if (viewMode === 'diagrams') return false
    if (viewMode === 'stats') return context.kind === 'project'

    return true
}

/** Stable renderer for all service-owned card action popups. */
export function CardActionPopupHost() {
    const theme = useTheme()
    const isMobile = useMediaQuery(theme.breakpoints.down('md'))
    const { viewMode } = useWorkspaceView()
    const entries = useSyncExternalStore(
        subscribeCardPopups,
        () => cardPopupService.getSnapshot(),
        () => cardPopupService.getSnapshot(),
    )
    const topEntryId = entries.at(-1)?.id

    return entries.map((entry, stackPosition) => entry.kind === 'action' ? (
        <CardActionPopupHostEntry
            entry={entry}
            key={entry.id}
            stackPosition={stackPosition}
            visible={isEntryVisibleInView(entry.context, viewMode) && (!isMobile || entry.id === topEntryId)}
        />
    ) : null)
}
