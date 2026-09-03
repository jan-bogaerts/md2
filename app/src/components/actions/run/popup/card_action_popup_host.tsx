import { useMediaQuery, useTheme } from '@mui/material'
import { useSyncExternalStore } from 'react'
import {
    cardPopupService,
    subscribeCardPopups,
} from '../../../../services/card_popup_service'
import { CardActionPopupHostEntry } from './card_action_popup_host_entry'
import { useWorkspaceView } from '../../../hooks/use_workspace_view'

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
            visible={viewMode !== 'diagrams' && viewMode !== 'stats' && (!isMobile || entry.id === topEntryId)}
        />
    ) : null)
}
