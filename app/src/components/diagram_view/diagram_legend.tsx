import ExpandMoreOutlined from '@mui/icons-material/ExpandMoreOutlined'
import ExpandLessOutlined from '@mui/icons-material/ExpandLessOutlined'
import { Box, IconButton, Paper, Tab, Tabs, Tooltip, Typography } from '@mui/material'
import {
    useCallback, useId, useLayoutEffect, useRef, useState,
    type MouseEvent, type PointerEvent, type SyntheticEvent,
} from 'react'
import type { DiagramLegendPosition } from '../../services/diagrams/diagram_view_service'
import type { PositionedDiagramData } from '../../services/diagrams/diagram_layout'
import { diagramLegendEntries } from './diagram_legend_entries'
import { DiagramLegendEntryList } from './diagram_legend_entry_list'
import { clampLegendPosition } from './diagram_legend_position'
import {
    DiagramSessionLegendEntries, type SessionLegendSource,
} from './diagram_session_legend_entries'

const LEGEND_INSET = 1.5
const DRAG_THRESHOLD = 3

type DiagramLegendTab = 'current' | 'new'

interface DiagramLegendProps {
    collapsed: boolean
    data: PositionedDiagramData
    onCollapse: () => void
    onExpand: () => void
    onMove: (position: DiagramLegendPosition) => void
    position: DiagramLegendPosition | null
    /** Present only while an edit session is active, which is when the New tab is offered. */
    session?: SessionLegendSource | null
}

interface LegendDrag {
    moved: boolean
    pointerId: number
    pointerX: number
    pointerY: number
    startLeft: number
    startTop: number
}

function samePosition(first: DiagramLegendPosition, second: DiagramLegendPosition) {
    return first.left === second.left && first.top === second.top
}

/** Floating legend derived from active diagram semantics. */
export function DiagramLegend({ collapsed, data, onCollapse, onExpand, onMove, position, session = null }: DiagramLegendProps) {
    const panelRef = useRef<HTMLDivElement>(null)
    const dragRef = useRef<LegendDrag | null>(null)
    const suppressClickRef = useRef(false)
    const tabsId = useId()
    const [activeTab, setActiveTab] = useState<DiagramLegendTab>('new')
    const entries = diagramLegendEntries(data)
    const handleTabChange = (_event: SyntheticEvent, tab: DiagramLegendTab) => setActiveTab(tab)
    const currentTabActive = !session || activeTab === 'current'
    const clampCurrentPosition = useCallback(() => {
        const panel = panelRef.current
        const viewport = panel?.parentElement
        if (!panel || !viewport || !position) return
        const clamped = clampLegendPosition(position, viewport.clientWidth, viewport.clientHeight, panel.offsetWidth, panel.offsetHeight)
        if (!samePosition(position, clamped)) onMove(clamped)
    }, [onMove, position])

    useLayoutEffect(() => {
        clampCurrentPosition()
        const panel = panelRef.current
        const viewport = panel?.parentElement
        if (!panel || !viewport) return
        if (typeof ResizeObserver === 'undefined') return
        const observer = new ResizeObserver(clampCurrentPosition)
        observer.observe(panel)
        observer.observe(viewport)

        return () => observer.disconnect()
    }, [clampCurrentPosition, collapsed, currentTabActive])

    const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
        if ((event.target as Element).closest('button')) return
        const panel = panelRef.current
        const viewport = panel?.parentElement
        if (!panel || !viewport) return
        event.preventDefault()
        event.stopPropagation()
        event.currentTarget.setPointerCapture(event.pointerId)
        const panelBounds = panel.getBoundingClientRect()
        const viewportBounds = viewport.getBoundingClientRect()
        dragRef.current = {
            moved: false,
            pointerId: event.pointerId,
            pointerX: event.clientX,
            pointerY: event.clientY,
            startLeft: panelBounds.left - viewportBounds.left,
            startTop: panelBounds.top - viewportBounds.top,
        }
    }
    const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
        const drag = dragRef.current
        const panel = panelRef.current
        const viewport = panel?.parentElement
        if (!drag || drag.pointerId !== event.pointerId || !panel || !viewport) return
        event.preventDefault()
        event.stopPropagation()
        const leftDelta = event.clientX - drag.pointerX
        const topDelta = event.clientY - drag.pointerY
        if (Math.abs(leftDelta) >= DRAG_THRESHOLD || Math.abs(topDelta) >= DRAG_THRESHOLD) drag.moved = true
        const nextPosition = { left: drag.startLeft + leftDelta, top: drag.startTop + topDelta }
        onMove(clampLegendPosition(nextPosition, viewport.clientWidth, viewport.clientHeight, panel.offsetWidth, panel.offsetHeight))
    }
    const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
        const drag = dragRef.current
        if (!drag || drag.pointerId !== event.pointerId) return
        event.preventDefault()
        event.stopPropagation()
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
        suppressClickRef.current = drag.moved
        dragRef.current = null
    }
    const handleClick = (event: MouseEvent<HTMLElement>) => {
        event.stopPropagation()
        if (!suppressClickRef.current) return
        event.preventDefault()
        suppressClickRef.current = false
    }

    return (
        <Paper
            aria-label="Diagram legend"
            elevation={8}
            onClick={handleClick}
            ref={panelRef}
            sx={{
                bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', borderRadius: 1.5,
                display: 'flex', flexDirection: 'column', left: position?.left,
                maxHeight: (theme) => `calc(100% - ${theme.spacing(LEGEND_INSET * 2)})`,
                maxWidth: (theme) => `calc(100% - ${theme.spacing(LEGEND_INSET * 2)})`, overflow: 'hidden', position: 'absolute',
                right: position ? 'auto' : (theme) => theme.spacing(LEGEND_INSET),
                top: position ? position.top : (theme) => theme.spacing(LEGEND_INSET), width: 240, zIndex: 3,
            }}
        >
            <Box
                aria-label="Move diagram legend"
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerCancel={handlePointerUp}
                onPointerUp={handlePointerUp}
                sx={{ alignItems: 'center', cursor: 'move', display: 'flex', flexShrink: 0, gap: 1, minHeight: 40, px: 1.5 }}
            >
                <Typography sx={{ flex: 1, fontWeight: 600 }} variant="body2">Legend</Typography>
                <Tooltip title={collapsed ? 'Expand legend' : 'Collapse legend'}>
                    <IconButton
                        aria-label={collapsed ? 'Expand legend' : 'Collapse legend'}
                        onClick={collapsed ? onExpand : onCollapse}
                        size="small"
                    >
                        {collapsed ? <ExpandMoreOutlined fontSize="small" /> : <ExpandLessOutlined fontSize="small" />}
                    </IconButton>
                </Tooltip>
            </Box>
            {!collapsed ? (
                <Box sx={{ borderColor: 'divider', borderTop: '1px solid', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                    {session ? (
                        <Tabs
                            aria-label="Diagram legend sides"
                            onChange={handleTabChange}
                            sx={{ flexShrink: 0, minHeight: 36 }}
                            value={activeTab}
                            variant="fullWidth"
                        >
                            <Tab
                                aria-controls={`${tabsId}-new-panel`}
                                aria-label="New"
                                id={`${tabsId}-new-tab`}
                                label={<Tooltip title="Legend of the edited diagram"><Box component="span">New</Box></Tooltip>}
                                sx={{ minHeight: 36 }}
                                value="new"
                            />
                            <Tab
                                aria-controls={`${tabsId}-current-panel`}
                                aria-label="Current"
                                id={`${tabsId}-current-tab`}
                                label={<Tooltip title="Legend of the saved diagram"><Box component="span">Current</Box></Tooltip>}
                                sx={{ minHeight: 36 }}
                                value="current"
                            />
                        </Tabs>
                    ) : null}
                    <Box
                        aria-labelledby={session ? `${tabsId}-${activeTab}-tab` : undefined}
                        id={session ? `${tabsId}-${activeTab}-panel` : undefined}
                        role={session ? 'tabpanel' : undefined}
                        sx={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}
                    >
                        {currentTabActive ? (
                            <DiagramLegendEntryList
                                entries={entries}
                                label={session ? 'Current diagram legend entries' : 'Diagram legend entries'}
                            />
                        ) : <DiagramSessionLegendEntries session={session} />}
                    </Box>
                </Box>
            ) : null}
        </Paper>
    )
}
