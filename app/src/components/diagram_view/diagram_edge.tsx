import { useId, type KeyboardEvent, type MouseEvent } from 'react'
import { useTheme } from '@mui/material'
import type { PositionedDiagramEdge, PositionedDiagramNode } from '../../services/diagrams/diagram_layout'
import { roundedDiagramPath } from './diagram_path'
import type { DiagramSelectHandler } from './diagram_selection'

const EDGE_LABEL_FONT_SIZE = 8

interface DiagramEdgeProps {
    edge: PositionedDiagramEdge
    nodes: Map<string, PositionedDiagramNode>
    onSelect: DiagramSelectHandler
}

function edgeLabel(edge: PositionedDiagramEdge, nodes: Map<string, PositionedDiagramNode>) {
    if (edge.label) return edge.label
    const from = nodes.get(edge.from)?.label ?? edge.from
    const to = nodes.get(edge.to)?.label ?? edge.to

    return `${from} to ${to}`
}

/** Themed selectable connection rendered from validated geometry. */
export function DiagramEdge({ edge, nodes, onSelect }: DiagramEdgeProps) {
    const theme = useTheme()
    const label = edgeLabel(edge, nodes)
    const path = roundedDiagramPath(edge.points)
    const dashed = ['async', 'cycle', 'return'].includes(edge.kind)
    const accent = edge.kind === 'cycle' || edge.kind === 'success'
    const color = accent ? theme.palette.primary.main : theme.palette.text.secondary
    const visibleLabel = edge.label ?? (edge.kind === 'cycle' ? 'CYCLE' : null)
    const markerId = `diagram-arrow-${useId().replace(/:/gu, '')}`
    const handleSelect = (left: number, top: number) => onSelect({ id: edge.id, label, left, top })
    const handleClick = (event: MouseEvent<SVGGElement>) => handleSelect(event.clientX, event.clientY)
    const handleKeyDown = (event: KeyboardEvent<SVGGElement>) => {
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        const bounds = event.currentTarget.getBoundingClientRect()
        handleSelect(bounds.left, bounds.bottom)
    }
    const labelPoint = edge.labelPlacement

    return (
        <g
            aria-label={label}
            data-diagram-id={edge.id}
            onClick={handleClick}
            onKeyDown={handleKeyDown}
            role="button"
            style={{ color, cursor: 'pointer', outlineColor: theme.palette.primary.main }}
            tabIndex={0}
        >
            <defs>
                <marker id={markerId} markerHeight="6" markerWidth="8" orient="auto" refX="7" refY="3">
                    {edge.kind === 'async'
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
                strokeDasharray={dashed ? '4 3' : undefined}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={accent ? 1.5 : 1.2}
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
