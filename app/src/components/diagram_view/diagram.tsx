import { Box, Typography } from '@mui/material'
import { useRef, type MouseEvent } from 'react'
import type { PositionedDiagramData } from '../../services/diagrams/diagram_layout'
import { DiagramGroup } from './diagram_group'
import type { DiagramSelectHandler, DiagramSelection } from './diagram_selection'
import { SequenceActivation } from './sequence_activation'
import { SequenceFragment } from './sequence_fragment'
import { diagramViewService, type DiagramViewService } from '../../services/diagrams/diagram_view_service'
import { CurrentDiagramEdge } from './current_diagram_edge'
import { CurrentDiagramNode } from './current_diagram_node'
import { diagramEmphasisService, type DiagramEmphasisService } from '../../services/diagrams/diagram_emphasis_service'
import { SequenceLifeline } from './sequence_lifeline'
import { diagramFontStyle } from './diagram_font_style'
import { useDiagramFormattingScale } from './use_diagram_formatting'

export interface DiagramProps {
    circularNodes?: boolean
    curvedEdges?: boolean
    data: PositionedDiagramData
    emphasis?: DiagramEmphasisService
    onContextMenu?: (anchorElement: HTMLElement, selection: DiagramSelection) => void
    onSelect: (anchorElement: HTMLElement, selection: DiagramSelection) => void
    service?: Pick<DiagramViewService, 'getCurrentSelectionSnapshot' | 'subscribeCurrentSelection'>
}

/** Default context handler for isolated renderer use. */
function ignoreContextMenu() {}

/** Diagram surface composed from validated semantic data and positioned React children. */
export function Diagram(props: DiagramProps) {
    const {circularNodes = false, curvedEdges = false, data, emphasis = diagramEmphasisService} = props
    const {onContextMenu = ignoreContextMenu} = props
    const {onSelect, service = diagramViewService} = props
    const fontScalePercent = useDiagramFormattingScale('fontScalePercent', service as DiagramViewService)
    const surfaceRef = useRef<HTMLDivElement>(null)
    const nodeLabels = new Map(data.nodes.map((node) => [node.id, node.label]))
    const handleSelect: DiagramSelectHandler = (selection) => {
        if (surfaceRef.current) onSelect(surfaceRef.current, selection)
    }
    const handleContextMenu = (event: MouseEvent<HTMLDivElement>) => {
        const objectElement = (event.target as Element).closest<HTMLElement>('[data-diagram-id][data-diagram-kind]')
        const objectKind = objectElement?.dataset.diagramKind
        if (!objectElement || (objectKind !== 'edge' && objectKind !== 'node')) return
        event.preventDefault()
        const id = objectElement.dataset.diagramId
        const label = objectElement.getAttribute('aria-label')
        if (!id || !label) throw new Error('Diagram context target is missing identity or label')
        onContextMenu(event.currentTarget, { id, label, left: event.clientX, objectKind, top: event.clientY })
    }
    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, minWidth: data.width }}>
            <Box>
                <Typography sx={diagramFontStyle(undefined, fontScalePercent, 'h6')} variant="h6">{data.meta.title}</Typography>
                <Typography
                    color="text.secondary"
                    sx={diagramFontStyle(undefined, fontScalePercent, 'body2')}
                    variant="body2"
                >
                    {data.meta.description}
                </Typography>
            </Box>
            <Box
                aria-label={`${data.meta.title} diagram`}
                onContextMenu={handleContextMenu}
                ref={surfaceRef}
                sx={{ height: data.height, position: 'relative', width: data.width }}
            >
                {data.groups.map((group) => (
                    <DiagramGroup
                        emphasis={emphasis}
                        formattingStore={service as DiagramViewService}
                        group={group}
                        key={group.id}
                    />
                ))}
                {data.fragments.map((fragment) => (
                    <SequenceFragment
                        emphasis={emphasis}
                        formattingStore={service as DiagramViewService}
                        fragment={fragment}
                        key={fragment.id}
                    />
                ))}
                {data.meta.type === 'sequence' ? data.nodes.map((node) => (
                    <SequenceLifeline
                        emphasis={emphasis}
                        height={data.height - 24 - node.y - node.height}
                        key={`sequence-${node.id}`}
                        nodeId={node.id}
                        x={node.x + node.width / 2}
                        y={node.y + node.height}
                    />
                )) : null}
                {data.activations.map((activation) => (
                    <SequenceActivation activation={activation} emphasis={emphasis} key={activation.id} />
                ))}
                <svg aria-label="Diagram connections" height={data.height} style={{ left: 0, overflow: 'visible', position: 'absolute', top: 0, zIndex: 1 }} width={data.width}>
                    {data.edges.map((edge) => (
                        <CurrentDiagramEdge
                            curved={curvedEdges}
                            edge={edge}
                            emphasis={emphasis}
                            key={edge.id}
                            nodeLabels={nodeLabels}
                            onSelect={handleSelect}
                            service={service}
                        />
                    ))}
                </svg>
                {data.nodes.map((node) => (
                    <CurrentDiagramNode
                        circular={circularNodes}
                        diagramType={data.meta.type}
                        emphasis={emphasis}
                        flowPreset={data.meta.preset}
                        key={node.id}
                        node={node}
                        onSelect={handleSelect}
                        service={service}
                    />
                ))}
            </Box>
        </Box>
    )
}
