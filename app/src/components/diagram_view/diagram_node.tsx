import { Box, ButtonBase, Typography } from '@mui/material'
import { useRef, type KeyboardEvent, type MouseEvent } from 'react'
import type { DiagramFlowPreset, DiagramType } from '../../services/diagrams/diagram_data'
import type { PositionedDiagramNode } from '../../services/diagrams/diagram_layout'
import { diagramRoleStyle } from './diagram_role_style'
import type { DiagramSelectHandler } from './diagram_selection'

interface DiagramNodeProps {
    diagramType: DiagramType
    flowPreset?: DiagramFlowPreset
    node: PositionedDiagramNode
    onSelect: DiagramSelectHandler
    selected: boolean
}

function kindStyles(node: PositionedDiagramNode, flowPreset: DiagramFlowPreset | undefined) {
    if (flowPreset === 'state' && node.kind === 'start') {
        return {bgcolor: 'text.primary', border: 0, borderRadius: 99} as const
    }
    if (flowPreset === 'state' && node.kind === 'end') {
        return {
            bgcolor: 'background.default', border: '2px solid', borderColor: 'text.primary', borderRadius: 99,
            '&::before': {
                bgcolor: 'text.primary', borderRadius: 99, content: '""', height: 10, left: 5,
                position: 'absolute', top: 5, width: 10,
            },
        } as const
    }
    if (node.kind === 'start' || node.kind === 'end') return { borderRadius: 99 }
    if (node.kind === 'decision') return { transform: 'rotate(45deg)', '& > *': { transform: 'rotate(-45deg)' } }

    return { borderRadius: node.kind === 'state' ? 1 : '6px' }
}

function fieldPrefix(key: 'primary' | 'foreign' | undefined) {
    if (key === 'primary') return '# '
    if (key === 'foreign') return '→ '

    return ''
}

/** Positioned, themed, keyboard-operable diagram item. */
export function DiagramNode({ diagramType, flowPreset, node, onSelect, selected }: DiagramNodeProps) {
    const stateMarker = flowPreset === 'state' && (node.kind === 'start' || node.kind === 'end')
    const interactive = node.drilldown !== false
    const scrollRef = useRef<HTMLDivElement>(null)
    const pressScrollTop = useRef(0)
    const handleSelect = (left: number, top: number, ctrlKey: boolean) => (
        onSelect({ id: node.id, label: node.label, left, top }, ctrlKey)
    )
    const handleMouseDown = () => { pressScrollTop.current = scrollRef.current?.scrollTop ?? 0 }
    const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
        // A scrollbar drag inside the content area presses and releases on the button; that is a scroll, not a selection.
        if ((scrollRef.current?.scrollTop ?? 0) !== pressScrollTop.current) return
        handleSelect(event.clientX, event.clientY, event.ctrlKey)
    }
    const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        const bounds = event.currentTarget.getBoundingClientRect()
        handleSelect(bounds.left, bounds.bottom, false)
    }

    return (
        <ButtonBase
            aria-label={node.label}
            aria-disabled={interactive ? undefined : true}
            aria-pressed={interactive ? selected : undefined}
            data-diagram-id={node.id}
            onClick={interactive ? handleClick : undefined}
            onKeyDown={interactive ? handleKeyDown : undefined}
            onMouseDown={interactive ? handleMouseDown : undefined}
            role="button"
            sx={{
                alignItems: 'stretch', border: '1px solid', color: 'text.primary', display: 'flex', flexDirection: 'column',
                height: node.height, left: node.x, overflow: 'hidden', position: 'absolute', textAlign: 'left',
                top: node.y, width: node.width, zIndex: 2,
                ...diagramRoleStyle(node.role),
                ...kindStyles(node, flowPreset),
                ...(selected ? { outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 } : {}),
                '&:focus-visible': { borderColor: 'primary.main', outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
            }}
            tabIndex={interactive ? undefined : -1}
        >
            {!stateMarker ? (
                <Box
                    data-diagram-scroll="content"
                    ref={scrollRef}
                    sx={{
                        display: 'flex', flex: 1, flexDirection: 'column',
                        // `safe center` centres content that fits and falls back to top alignment once it overflows,
                        // so the tag and label stay reachable instead of being clipped above the scroll origin.
                        justifyContent: 'safe center', minHeight: 0, overflowX: 'hidden', overflowY: 'auto',
                    }}
                >
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, px: 2, py: 1 }}>
                        {node.tag ? <Typography color="custom.text3" variant="overline">{node.tag}</Typography> : null}
                        <Typography sx={{ fontWeight: 600, overflowWrap: 'anywhere' }} variant="body2">{node.label}</Typography>
                        {node.sublabel ? (
                            <Typography color="text.secondary" sx={{ overflowWrap: 'anywhere' }} variant="caption">{node.sublabel}</Typography>
                        ) : null}
                    </Box>
                    {diagramType === 'entity' && node.fields ? (
                        <Box sx={{ borderColor: 'divider', borderTop: '1px solid', display: 'flex', flexDirection: 'column', px: 2, py: 1 }}>
                            {node.fields.map((field) => (
                                <Typography key={`${field.key ?? 'field'}:${field.name}`} sx={{ fontFamily: 'monospace' }} variant="caption">
                                    {fieldPrefix(field.key)}{field.name}{field.type ? `: ${field.type}` : ''}
                                </Typography>
                            ))}
                        </Box>
                    ) : null}
                </Box>
            ) : null}
            {diagramType === 'dependency' ? (
                <Typography
                    color="text.secondary"
                    sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 0.25, position: 'absolute', px: 0.5, right: 1, top: 0.75 }}
                    variant="caption"
                >
                    {node.fanIn} in
                </Typography>
            ) : null}
        </ButtonBase>
    )
}
