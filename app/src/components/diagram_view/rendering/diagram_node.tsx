import { Box, ButtonBase, Typography } from '@mui/material'
import { useRef, useState, type KeyboardEvent, type MouseEvent } from 'react'
import type { DiagramContentPosition, DiagramFlowPreset, DiagramType } from '../../../services/diagrams/diagram_data'
import type { DiagramEditSessionService } from '../../../services/diagrams/diagram_edit_session_service'
import type { PositionedDiagramNode } from '../../../services/diagrams/diagram_layout'
import { DiagramEntityFieldRow } from './diagram_entity_field'
import { diagramRoleStyle } from '../formatting/diagram_role_style'
import type { DiagramSelectHandler } from '../editing/diagram_selection'
import { EditableDiagramEntityFields } from '../editing/editable_diagram_entity_fields'
import { DIAGRAM_DIMMED_OPACITY } from '../surface/diagram_emphasis_presentation'
import { diagramFontStyle } from '../formatting/diagram_font_style'
import { DiagramInlineNodeControls } from '../editing/diagram_inline_node_controls'
import {
    type DiagramFormattingStore, useDiagramFormattingScale, useDiagramNodeRoleFormatting,
} from '../formatting/use_diagram_formatting'

interface EditableEntityFieldSource {
    nodeId: string
    session: DiagramEditSessionService
}

interface DiagramNodeProps {
    circular?: boolean
    diagramType: DiagramType
    dimmed?: boolean
    editableLabel?: { session: DiagramEditSessionService }
    entityFieldSource?: EditableEntityFieldSource
    flowPreset?: DiagramFlowPreset
    formattingStore?: DiagramFormattingStore
    node: PositionedDiagramNode
    onOpenDetails?: () => void
    onSelect: DiagramSelectHandler
    selected: boolean
}

function contentPosition(position: DiagramContentPosition | undefined) {
    const vertical = position?.startsWith('top') ? 'flex-start' : position?.startsWith('bottom') ? 'flex-end' : 'safe center'
    const horizontal = position?.endsWith('left') ? 'flex-start' : position?.endsWith('right') ? 'flex-end' : 'center'

    return { alignItems: horizontal, justifyContent: vertical }
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
    if (node.kind === 'decision') return { bgcolor: 'transparent', border: 0 }

    return { borderRadius: node.kind === 'state' ? 1 : '6px' }
}

function decisionPoints(node: PositionedDiagramNode) {
    return `${node.width / 2},1 ${node.width - 1},${node.height / 2} ${node.width / 2},${node.height - 1} 1,${node.height / 2}`
}

/** Positioned, themed, keyboard-operable diagram item. */
export function DiagramNode(props: DiagramNodeProps) {
    const {circular = false, diagramType, dimmed = false, editableLabel, entityFieldSource, flowPreset, formattingStore, node} = props
    const {onOpenDetails, onSelect, selected} = props
    const stateMarker = flowPreset === 'state' && (node.kind === 'start' || node.kind === 'end')
    const decision = node.kind === 'decision'
    const formatting = useDiagramNodeRoleFormatting(node.role, formattingStore)
    const fontScalePercent = useDiagramFormattingScale('fontScalePercent', formattingStore)
    const roleStyle = diagramRoleStyle(node.role, formatting)
    const positionStyle = contentPosition(formatting?.box?.contentPosition)
    const [focused, setFocused] = useState(false)
    const scrollRef = useRef<HTMLDivElement>(null)
    const pressScrollTop = useRef(0)
    const handleSelect = (left: number, top: number, ctrlKey: boolean) => (
        onSelect({ id: node.id, label: node.label, left, objectKind: 'node', top }, ctrlKey)
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
    const handleDoubleClick = (event: MouseEvent<HTMLButtonElement>) => {
        if (!onOpenDetails) return

        event.preventDefault()
        event.stopPropagation()
        onOpenDetails()
    }

    const handleFocus = () => setFocused(true)
    const handleBlur = () => setFocused(false)

    return (
        <>
            <ButtonBase
                aria-label={node.label}
                aria-pressed={selected}
                data-diagram-connection-target={node.id}
                data-diagram-id={node.id}
                data-diagram-kind="node"
                data-diagram-node-shape={circular ? node.width === node.height ? 'circle' : 'ellipse' : undefined}
                onBlur={handleBlur}
                onClick={handleClick}
                onDoubleClick={onOpenDetails ? handleDoubleClick : undefined}
                onFocus={handleFocus}
                onKeyDown={handleKeyDown}
                onMouseDown={handleMouseDown}
                role="button"
                sx={{
                    alignItems: 'stretch', border: '1px solid', color: 'text.primary', display: 'flex', flexDirection: 'column',
                    height: node.height, left: node.x, overflow: 'hidden', position: 'absolute', textAlign: 'left',
                    opacity: dimmed ? DIAGRAM_DIMMED_OPACITY : 1, top: node.y, width: node.width, zIndex: 2,
                    touchAction: editableLabel ? 'none' : undefined,
                    ...kindStyles(node, flowPreset),
                    ...(circular ? { borderRadius: '50%', textAlign: 'center' } : {}),
                    ...roleStyle,
                    '&:focus-visible': { borderColor: 'primary.main' },
                    '&:hover + .diagram-node-inline-controls .diagram-node-details-action, &:focus + .diagram-node-inline-controls .diagram-node-details-action': { opacity: 1 },
                }}
            >
                {decision ? (
                    <Box
                        aria-hidden="true"
                        component="svg"
                        data-diagram-node-shape="decision"
                        preserveAspectRatio="none"
                        sx={{ height: '100%', left: 0, pointerEvents: 'none', position: 'absolute', top: 0, width: '100%' }}
                        viewBox={`0 0 ${node.width} ${node.height}`}
                    >
                        <Box component="polygon" points={decisionPoints(node)} sx={{ color: roleStyle.bgcolor, fill: 'currentColor' }} />
                        <Box
                            component="polygon"
                            points={decisionPoints(node)}
                            sx={{
                                color: roleStyle.borderColor,
                                fill: 'none',
                                stroke: 'currentColor',
                                strokeDasharray: formatting?.box?.borderStyle === 'dashed'
                                    ? '4 4'
                                    : formatting?.box?.borderStyle === 'dotted' ? '1 3' : undefined,
                                strokeWidth: formatting?.box?.borderThickness ?? 1,
                                vectorEffect: 'non-scaling-stroke',
                            }}
                        />
                    </Box>
                ) : null}
                {!stateMarker ? (
                    <Box
                        data-diagram-scroll="content"
                        ref={scrollRef}
                        sx={{
                            display: 'flex', flex: 1, flexDirection: 'column', position: 'relative',
                            // `safe center` centres content that fits and falls back to top alignment once it overflows,
                            // so the tag and label stay reachable instead of being clipped above the scroll origin.
                            ...positionStyle, minHeight: 0, overflowX: 'hidden', overflowY: 'auto',
                        }}
                    >
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, px: 2, py: 1 }}>
                            {node.tag ? <Typography color="custom.text3" sx={diagramFontStyle(formatting?.font, fontScalePercent, 'overline')} variant="overline">{node.tag}</Typography> : null}
                            {!editableLabel ? <Typography sx={{ ...diagramFontStyle(formatting?.font, fontScalePercent, 'body2'), fontWeight: formatting?.font?.bold === undefined ? 600 : undefined, overflowWrap: 'anywhere' }} variant="body2">{node.label}</Typography> : null}
                            {node.sublabel ? (
                                <Typography color="text.secondary" sx={{ ...diagramFontStyle(formatting?.font, fontScalePercent, 'caption'), overflowWrap: 'anywhere' }} variant="caption">{node.sublabel}</Typography>
                            ) : null}
                        </Box>
                        {diagramType === 'entity' && (entityFieldSource || node.fields) ? (
                            <Box sx={{ borderColor: 'divider', borderTop: '1px solid', display: 'flex', flexDirection: 'column', px: 2, py: 1 }}>
                                {entityFieldSource ? (
                                    <EditableDiagramEntityFields
                                        {...entityFieldSource}
                                        fontFormatting={formatting?.font}
                                        fontScalePercent={fontScalePercent}
                                    />
                                ) : node.fields?.map((field, fieldIndex) => (
                                    <DiagramEntityFieldRow
                                        field={field}
                                        fontFormatting={formatting?.font}
                                        fontScalePercent={fontScalePercent}
                                        key={fieldIndex}
                                    />
                                ))}
                            </Box>
                        ) : null}
                    </Box>
                ) : null}
                {diagramType === 'dependency' ? (
                    <Typography
                        color="text.secondary"
                        sx={{ ...diagramFontStyle(formatting?.font, fontScalePercent, 'caption'), border: '1px solid', borderColor: 'divider', borderRadius: 0.25, position: 'absolute', px: 0.5, right: 1, top: 0.75 }}
                        variant="caption"
                    >
                        {node.fanIn} in
                    </Typography>
                ) : null}
            </ButtonBase>
            {editableLabel && onOpenDetails ? (
                <DiagramInlineNodeControls node={node} onOpenDetails={onOpenDetails} session={editableLabel.session} />
            ) : null}
            {selected || focused ? (
                <Box
                    aria-hidden="true"
                    sx={{
                        borderRadius: circular ? '50%' : undefined, height: node.height, left: node.x,
                        outline: '2px solid', outlineColor: 'primary.main',
                        outlineOffset: 2, pointerEvents: 'none', position: 'absolute', top: node.y, width: node.width, zIndex: 3,
                    }}
                />
            ) : null}
        </>
    )
}
