import { useId, useState, type KeyboardEvent, type MouseEvent } from 'react'
import { useTheme } from '@mui/material'
import type { PositionedDiagramEdge } from '../../services/diagrams/diagram_layout'
import { diagramEdgeStyle } from './diagram_edge_style'
import { roundedDiagramPath } from './diagram_path'
import type { DiagramSelectHandler } from './diagram_selection'

const EDGE_LABEL_FONT_SIZE = 8
interface DiagramEdgeProps {
    edge: PositionedDiagramEdge
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
export function DiagramEdge({ edge, nodeLabels, onOpenDetails, onSelect, selected }: DiagramEdgeProps) {
    const theme = useTheme()
    const [focused, setFocused] = useState(false)
    const label = edgeLabel(edge, nodeLabels)
    const path = roundedDiagramPath(edge.points)
    const { arrowhead, color, strokeDasharray, strokeWidth } = diagramEdgeStyle(edge.kind, theme, focused || selected)
    const visibleLabel = edge.label ?? (edge.kind === 'cycle' ? 'CYCLE' : null)
    const markerId = `diagram-arrow-${useId().replace(/:/gu, '')}`
    const handleSelect = (left: number, top: number, ctrlKey: boolean) => (
        onSelect({ id: edge.id, label, left, top }, ctrlKey)
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

    return (
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
            style={{ color, cursor: 'pointer', outline: 'none', pointerEvents: 'auto' }}
            tabIndex={0}
        >
            <defs>
                <marker id={markerId} markerHeight="6" markerWidth="8" orient="auto" refX="7" refY="3">
                    {arrowhead === 'open'
                        ? <polyline fill="none" points="0 0, 8 3, 0 6" stroke="currentColor" strokeWidth="1.2" />
                        : <path d="M0,0 L8,3 L0,6 Z" fill="currentColor" />}
                </marker>
            </defs>
            <path d={path} fill="none" opacity={0} stroke="currentColor" strokeWidth={12} />
            <path
                d={path}
                fill="none"
                markerEnd={`url(#${markerId})`}
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
                        fill={color}
                        fontFamily="monospace"
                        fontSize={EDGE_LABEL_FONT_SIZE}
                        textAnchor="middle"
                        x={labelPoint.textX}
                        y={labelPoint.textY}
                    >
                        {visibleLabel}
                    </text>
                </g>
            ) : null}
            {edge.fromCardinality ? (
                <text fill={theme.palette.text.secondary} fontFamily="monospace" fontSize={EDGE_LABEL_FONT_SIZE} x={edge.points[0].x + 8} y={edge.points[0].y - 8}>
                    {edge.fromCardinality}
                </text>
            ) : null}
            {edge.toCardinality ? (
                <text
                    fill={theme.palette.text.secondary}
                    fontFamily="monospace"
                    fontSize={EDGE_LABEL_FONT_SIZE}
                    textAnchor="end"
                    x={(edge.points.at(-1)?.x ?? 0) - 8}
                    y={(edge.points.at(-1)?.y ?? 0) - 8}
                >
                    {edge.toCardinality}
                </text>
            ) : null}
        </g>
    )
}
