import type { DiagramProps } from './diagram'
import { ArchitectureDiagram } from './architecture_diagram'
import { DependencyDiagram } from './dependency_diagram'
import { EntityDiagram } from './entity_diagram'
import { FlowDiagram } from './flow_diagram'
import { MindmapDiagram } from './mindmap_diagram'
import { SequenceDiagram } from './sequence_diagram'

/** Select one supported thin renderer from validated metadata. */
export function DiagramRenderer(props: DiagramProps) {
    const { type } = props.data.meta
    if (type === 'architecture') return <ArchitectureDiagram {...props} />
    if (type === 'dependency') return <DependencyDiagram {...props} />
    if (type === 'sequence') return <SequenceDiagram {...props} />
    if (type === 'flow') return <FlowDiagram {...props} />
    if (type === 'entity') return <EntityDiagram {...props} />
    if (type === 'mindmap') return <MindmapDiagram {...props} />

    return null
}
