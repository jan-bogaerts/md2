import { Box, ButtonBase, Typography } from '@mui/material'
import type { KeyboardEvent, MouseEvent } from 'react'
import type { DiagramFlowPreset, DiagramType } from '../../services/diagrams/diagram_data'
import type { PositionedDiagramNode } from '../../services/diagrams/diagram_layout'
import { diagramRoleStyle } from './diagram_role_style'
import type { DiagramSelectHandler } from './diagram_selection'

interface DiagramNodeProps {
    diagramType: DiagramType
    flowPreset?: DiagramFlowPreset
    node: PositionedDiagramNode
    onSelect: DiagramSelectHandler
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
export function DiagramNode({ diagramType, flowPreset, node, onSelect }: DiagramNodeProps) {
    const stateMarker = flowPreset === 'state' && (node.kind === 'start' || node.kind === 'end')
    const interactive = node.drilldown !== false
    const handleSelect = (left: number, top: number) => onSelect({ id: node.id, label: node.label, left, top })
    const handleClick = (event: MouseEvent<HTMLButtonElement>) => handleSelect(event.clientX, event.clientY)
    const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        const bounds = event.currentTarget.getBoundingClientRect()
        handleSelect(bounds.left, bounds.bottom)
    }

    return (
        <ButtonBase
            aria-label={node.label}
            data-diagram-id={node.id}
            disabled={!interactive}
            onClick={interactive ? handleClick : undefined}
            onKeyDown={interactive ? handleKeyDown : undefined}
            role="button"
            sx={{
                alignItems: 'stretch', border: '1px solid', color: 'text.primary', display: 'flex', flexDirection: 'column',
                height: node.height, justifyContent: 'center', left: node.x, overflow: 'hidden', position: 'absolute', textAlign: 'left',
                top: node.y, width: node.width, zIndex: 2,
                ...diagramRoleStyle(node.role),
                ...kindStyles(node, flowPreset),
                '&:focus-visible': { borderColor: 'primary.main', outline: '2px solid', outlineColor: 'primary.main', outlineOffset: 2 },
            }}
        >
            {!stateMarker ? (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, px: 2, py: 1 }}>
                    {node.tag ? <Typography color="custom.text3" variant="overline">{node.tag}</Typography> : null}
                    <Typography sx={{ fontWeight: 600 }} variant="body2">{node.label}</Typography>
                    {node.sublabel ? <Typography color="text.secondary" variant="caption">{node.sublabel}</Typography> : null}
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
            {diagramType === 'entity' && node.fields ? (
                <Box sx={{ borderColor: 'divider', borderTop: '1px solid', display: 'flex', flexDirection: 'column', px: 2, py: 1 }}>
                    {node.fields.map((field) => (
                        <Typography key={`${field.key ?? 'field'}:${field.name}`} sx={{ fontFamily: 'monospace' }} variant="caption">
                            {fieldPrefix(field.key)}{field.name}{field.type ? `: ${field.type}` : ''}
                        </Typography>
                    ))}
                </Box>
            ) : null}
        </ButtonBase>
    )
}
