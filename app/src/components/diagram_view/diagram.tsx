import { Box, Typography } from '@mui/material'
import { useRef } from 'react'
import type { PositionedDiagramData } from '../../services/diagrams/diagram_layout'
import { DiagramEdge } from './diagram_edge'
import { DiagramGroup } from './diagram_group'
import { DiagramNode } from './diagram_node'
import type { DiagramSelectHandler, DiagramSelection } from './diagram_selection'
import { SequenceActivation } from './sequence_activation'
import { SequenceFragment } from './sequence_fragment'

export interface DiagramProps {
    data: PositionedDiagramData
    onSelect: (anchorElement: HTMLElement, selection: DiagramSelection) => void
}

/** Diagram surface composed from validated semantic data and positioned React children. */
export function Diagram({ data, onSelect }: DiagramProps) {
    const surfaceRef = useRef<HTMLDivElement>(null)
    const nodeLabels = new Map(data.nodes.map((node) => [node.id, node.label]))
    const handleSelect: DiagramSelectHandler = (selection) => {
        if (surfaceRef.current) onSelect(surfaceRef.current, selection)
    }
    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, minWidth: data.width }}>
            <Box>
                <Typography variant="h6">{data.meta.title}</Typography>
                <Typography color="text.secondary" variant="body2">{data.meta.description}</Typography>
            </Box>
            <Box
                aria-label={`${data.meta.title} diagram`}
                ref={surfaceRef}
                sx={{ height: data.height, position: 'relative', width: data.width }}
            >
                {data.groups.map((group) => <DiagramGroup group={group} key={group.id} />)}
                {data.fragments.map((fragment) => <SequenceFragment fragment={fragment} key={fragment.id} />)}
                {data.meta.type === 'sequence' ? data.nodes.map((node) => (
                    <Box key={`sequence-${node.id}`}>
                        <Box
                            sx={{ borderLeft: '1px dashed', borderColor: 'divider', height: data.height - 24 - node.y - node.height, left: node.x + node.width / 2, position: 'absolute', top: node.y + node.height, zIndex: 1 }}
                        />
                    </Box>
                )) : null}
                {data.activations.map((activation) => <SequenceActivation activation={activation} key={activation.id} />)}
                <svg aria-label="Diagram connections" height={data.height} style={{ left: 0, overflow: 'visible', position: 'absolute', top: 0, zIndex: 1 }} width={data.width}>
                    {data.edges.map((edge) => <DiagramEdge edge={edge} key={edge.id} nodeLabels={nodeLabels} onSelect={handleSelect} />)}
                </svg>
                {data.nodes.map((node) => (
                    <DiagramNode
                        diagramType={data.meta.type}
                        flowPreset={data.meta.preset}
                        key={node.id}
                        node={node}
                        onSelect={handleSelect}
                    />
                ))}
            </Box>
        </Box>
    )
}
