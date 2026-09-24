import { ListItemText, Menu, MenuItem } from '@mui/material'
import ChevronRight from 'mdi-material-ui/ChevronRight'
import { useMemo, useSyncExternalStore, type KeyboardEvent, type MouseEvent } from 'react'
import { actionsForContext, diagramContext } from '../../../data/action_context'
import type { ActionDefinition } from '../../../data/action_types'
import { dialogService } from '../../../services/dialog_service'
import type { DiagramRecord } from '../../../services/diagrams/diagram_index'
import type { DiagramItemSubmenuKind, DiagramViewService } from '../../../services/diagrams/diagram_view_service'
import { useActions } from '../../hooks/use_actions'
import {
    diagramEmphasisService, type DiagramEmphasisService,
} from '../../../services/diagrams/diagram_emphasis_service'

interface DiagramItemMenuProps {
    emphasis?: Pick<DiagramEmphasisService, 'emphasize'>
    service: Pick<DiagramViewService,
        'closeItemMenu'
        | 'closeItemSubmenu'
        | 'getMenuSnapshot'
        | 'getSavedChildren'
        | 'navigateToSavedDiagram'
        | 'openChildPopup'
        | 'openItemSubmenu'
        | 'subscribeMenu'>
}

function reportNavigationFailure(error: unknown) {
    dialogService.error(error, { fallbackMessage: 'Diagram navigation failed' })
}

function diagramTitle(record: DiagramRecord, actions: readonly ActionDefinition[]) {
    const label = actions.find(({ id }) => id === record.actionId)?.label ?? record.label

    return record.createdAt ? `${label} - ${new Date(record.createdAt).toLocaleString()}` : label
}

function submenuKind(element: HTMLElement): DiagramItemSubmenuKind {
    const kind = element.dataset.diagramSubmenu
    if (kind !== 'actions' && kind !== 'savedDiagrams') throw new Error('Diagram menu item is missing its submenu')

    return kind
}

/** Item actions and saved child diagrams, subscribed independently from the diagram surface. */
export function DiagramItemMenu({ emphasis = diagramEmphasisService, service }: DiagramItemMenuProps) {
    const menu = useSyncExternalStore(service.subscribeMenu, service.getMenuSnapshot, service.getMenuSnapshot)
    const { actions } = useActions()
    const selectedContext = useMemo(() => menu
        ? diagramContext('child', menu.diagramId, menu.itemId, menu.itemLabel)
        : null, [menu])
    const childActions = useMemo(
        () => selectedContext ? actionsForContext(actions, selectedContext) : [],
        [actions, selectedContext],
    )
    const savedChildren = menu?.surface === 'current' ? service.getSavedChildren(menu.diagramId, menu.itemId) : []
    const handleClose = () => service.closeItemMenu()
    const handleCloseSubmenu = () => {
        const anchorElement = menu?.submenu?.anchorElement
        service.closeItemSubmenu()
        anchorElement?.focus()
    }
    const handleOpenSubmenu = (event: MouseEvent<HTMLElement>) => {
        service.openItemSubmenu(submenuKind(event.currentTarget), event.currentTarget)
    }
    const handleParentKeyDown = (event: KeyboardEvent<HTMLElement>) => {
        if (event.key !== 'ArrowRight') return
        event.preventDefault()
        service.openItemSubmenu(submenuKind(event.currentTarget), event.currentTarget)
    }
    const handleNestedMenuKeyDown = (event: KeyboardEvent<HTMLElement>) => {
        if (event.key !== 'ArrowLeft') return
        event.preventDefault()
        event.stopPropagation()
        handleCloseSubmenu()
    }
    const handleActionClick = (event: MouseEvent<HTMLElement>) => {
        const actionId = event.currentTarget.dataset.actionId
        if (!actionId) throw new Error('Diagram action menu item is missing its action')
        service.openChildPopup(actionId)
    }
    const handleSavedDiagramClick = (event: MouseEvent<HTMLElement>) => {
        const diagramId = event.currentTarget.dataset.diagramId
        if (!diagramId) throw new Error('Saved diagram menu item is missing its diagram')
        void service.navigateToSavedDiagram(diagramId).catch(reportNavigationFailure)
    }
    const handleEmphasize = () => {
        if (!menu) return
        emphasis.emphasize({
            diagramId: menu.diagramId,
            objectId: menu.itemId,
            objectKind: menu.objectKind,
            surface: menu.surface,
        })
        service.closeItemMenu()
    }
    const activeSubmenu = menu?.submenu?.kind ?? null

    return (
        <>
            <Menu
                anchorPosition={menu ? { left: menu.left, top: menu.top } : undefined}
                anchorReference="anchorPosition"
                onClose={handleClose}
                open={!!menu}
                slotProps={{ list: { 'aria-label': 'Diagram item' } }}
            >
                <MenuItem onClick={handleEmphasize}>Emphasize</MenuItem>
                {menu?.surface === 'current' ? <MenuItem
                    aria-expanded={activeSubmenu === 'actions'}
                    aria-haspopup="menu"
                    data-diagram-submenu="actions"
                    onClick={handleOpenSubmenu}
                    onKeyDown={handleParentKeyDown}
                >
                    <ListItemText>Actions</ListItemText>
                    <ChevronRight fontSize="small" />
                </MenuItem> : null}
                {menu?.surface === 'current' ? <MenuItem
                    aria-expanded={activeSubmenu === 'savedDiagrams'}
                    aria-haspopup="menu"
                    data-diagram-submenu="savedDiagrams"
                    onClick={handleOpenSubmenu}
                    onKeyDown={handleParentKeyDown}
                >
                    <ListItemText>Saved diagrams</ListItemText>
                    <ChevronRight fontSize="small" />
                </MenuItem> : null}
            </Menu>
            <Menu
                anchorEl={menu?.submenu?.anchorElement}
                anchorOrigin={{ horizontal: 'right', vertical: 'top' }}
                onClose={handleCloseSubmenu}
                open={!!activeSubmenu}
                slotProps={{
                    list: {
                        'aria-label': activeSubmenu === 'actions' ? 'Actions' : 'Saved diagrams',
                        onKeyDown: handleNestedMenuKeyDown,
                    },
                }}
                transformOrigin={{ horizontal: 'left', vertical: 'top' }}
            >
                {activeSubmenu === 'actions' ? (childActions.length > 0 ? childActions.map((action) => (
                    <MenuItem data-action-id={action.id} key={action.id} onClick={handleActionClick}>{action.label}</MenuItem>
                )) : <MenuItem disabled>No child actions</MenuItem>) : null}
                {activeSubmenu === 'savedDiagrams' ? (savedChildren.length > 0 ? savedChildren.map((record) => (
                    <MenuItem data-diagram-id={record.id} key={record.id} onClick={handleSavedDiagramClick}>
                        {diagramTitle(record, actions)}
                    </MenuItem>
                )) : <MenuItem disabled>No saved diagrams</MenuItem>) : null}
            </Menu>
        </>
    )
}
