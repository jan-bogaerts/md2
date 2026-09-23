import { useId, useState, type KeyboardEvent, type MouseEvent } from 'react'
import { useTheme } from '@mui/material'
import type { PositionedDiagramEdge } from '../../services/diagrams/diagram_layout'
import { diagramEdgeStyle } from './diagram_edge_style'
import { curvedDiagramPath, roundedDiagramPath } from './diagram_path'
import type { DiagramSelectHandler } from './diagram_selection'
import { DIAGRAM_DIMMED_OPACITY } from './diagram_emphasis_presentation'
import { DiagramConnectionMarkerShape } from './diagram_connection_marker'
import {
    type DiagramFormattingStore, useDiagramConnectionKindFormatting, useDiagramFormattingScale,
} from './use_diagram_formatting'

const EDGE_LABEL_FONT_SIZE = 8
interface DiagramEdgeProps {
    curved?: boolean
    dimmed?: boolean
    edge: PositionedDiagramEdge
    formattingStore?: DiagramFormattingStore
    /** Endpoint labels only, so a subscribing caller can supply them without owning positioned node objects. */
    nodeLabels: ReadonlyMap<string, string>
    onOpenDetails?: () => void
    onSelect: DiagramSelectHandler
    selected: boolean
}

function edgeLabel(edge: PositionedDiagramEdge, nodeLabels: ReadonlyMap<string, string>) {
    const from = nodeLabels.get(edge.from) ?? edge.from
    const to = nodeLabels.get(edge.to) ?? edge.to

    return edge.label ?? `${from} to ${to}`
}

/** Themed selectable connection rendered from validated geometry. */
export function DiagramEdge(props: DiagramEdgeProps) {
    const { curved = false, dimmed = false, edge, formattingStore, nodeLabels } = props
    const { onOpenDetails, onSelect, selected } = props
    const theme = useTheme()
    const [focused, setFocused] = useState(false)
    const label = edgeLabel(edge, nodeLabels)
    const path = curved && edge.controlPoint
        ? curvedDiagramPath(edge.points, edge.controlPoint as NonNullable<PositionedDiagramEdge['controlPoint']>)
        : roundedDiagramPath(edge.points)
    const formatting = useDiagramConnectionKindFormatting(edge.kind, formattingStore)
    const fontScalePercent = useDiagramFormattingScale('fontScalePercent', formattingStore)
    const { color, endMarker, startMarker, strokeDasharray, strokeWidth } = diagramEdgeStyle(
        edge.kind, theme, focused || selected, formatting,
    )
    const visibleLabel = edge.label ?? (edge.kind === 'cycle' ? 'CYCLE' : null)
    const markerId = `diagram-marker-${useId().replace(/:/gu, '')}`
    const startMarkerId = `${markerId}-start`
    const endMarkerId = `${markerId}-end`
    const handleSelect = (left: number, top: number, ctrlKey: boolean) => (
        onSelect({ id: edge.id, label, left, objectKind: 'edge', top }, ctrlKey)
    )
    const handleClick = (event: MouseEvent<SVGGElement>) => handleSelect(event.clientX, event.clientY, event.ctrlKey)
    const handleDoubleClick = (event: MouseEvent<SVGGElement>) => {
        if (!onOpenDetails) return

        event.preventDefault()
        event.stopPropagation()
        onOpenDetails()
    }
    const handleKeyDown = (event: KeyboardEvent<SVGGElement>) => {
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        const bounds = event.currentTarget.getBoundingClientRect()
        handleSelect(bounds.left, bounds.bottom, false)
    }
    const handleFocus = () => setFocused(true)
    const handleBlur = () => setFocused(false)
    const labelPoint = edge.labelPlacement
    if (curved && !edge.controlPoint) return null

    return (
        <>
            <g
                aria-label={label}
                aria-pressed={selected}
                data-diagram-id={edge.id}
                data-diagram-kind="edge"
                onBlur={handleBlur}
                onClick={handleClick}
                onDoubleClick={onOpenDetails ? handleDoubleClick : undefined}
                onFocus={handleFocus}
                onKeyDown={handleKeyDown}
                role="button"
                style={{ color, cursor: 'pointer', opacity: dimmed ? DIAGRAM_DIMMED_OPACITY : 1, outline: 'none', pointerEvents: 'auto' }}
                tabIndex={0}
            >
                <defs>
                    <marker id={startMarkerId} markerHeight="6" markerWidth="8" orient="auto-start-reverse" refX="1" refY="3">
                        <DiagramConnectionMarkerShape marker={startMarker} />
                    </marker>
                    <marker id={endMarkerId} markerHeight="6" markerWidth="8" orient="auto" refX="7" refY="3">
                        <DiagramConnectionMarkerShape marker={endMarker} />
                    </marker>
                </defs>
                <path d={path} fill="none" opacity={0} stroke="currentColor" strokeWidth={12} />
                <path
                    d={path}
                    fill="none"
                    markerEnd={endMarker === 'none' ? undefined : `url(#${endMarkerId})`}
                    markerStart={startMarker === 'none' ? undefined : `url(#${startMarkerId})`}
                    stroke="currentColor"
                    strokeDasharray={strokeDasharray}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={strokeWidth}
                />
                {visibleLabel && labelPoint ? (
                    <g>
                        <rect
                            fill={theme.palette.background.default}
                            height={labelPoint.height}
                            rx={2}
                            width={labelPoint.width}
                            x={labelPoint.x}
                            y={labelPoint.y}
                        />
                        <text
                            fill={formatting?.font?.color ?? color}
                            fontFamily={formatting?.font?.family ?? 'monospace'}
                            fontSize={(formatting?.font?.size ?? EDGE_LABEL_FONT_SIZE) * fontScalePercent / 100}
                            fontStyle={formatting?.font?.italic ? 'italic' : undefined}
                            fontWeight={formatting?.font?.bold ? 700 : undefined}
                            style={{ textDecoration: formatting?.font?.underline ? 'underline' : undefined }}
                            textAnchor="middle"
                            x={labelPoint.textX}
                            y={labelPoint.textY}
                        >
                            {visibleLabel}
                        </text>
                    </g>
                ) : null}
                {edge.fromCardinality ? (
                    <text fill={theme.palette.text.secondary} fontFamily="monospace" fontSize={EDGE_LABEL_FONT_SIZE * fontScalePercent / 100} x={edge.points[0].x + 8} y={edge.points[0].y - 8}>
                        {edge.fromCardinality}
                    </text>
                ) : null}
                {edge.toCardinality ? (
                    <text
                        fill={theme.palette.text.secondary}
                        fontFamily="monospace"
                        fontSize={EDGE_LABEL_FONT_SIZE * fontScalePercent / 100}
                        textAnchor="end"
                        x={(edge.points.at(-1)?.x ?? 0) - 8}
                        y={(edge.points.at(-1)?.y ?? 0) - 8}
                    >
                        {edge.toCardinality}
                    </text>
                ) : null}
            </g>
            {focused || selected ? (
                <path
                    aria-hidden="true"
                    d={path}
                    fill="none"
                    pointerEvents="none"
                    stroke={theme.palette.primary.main}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={strokeWidth + 4}
                />
            ) : null}
        </>
    )
}
