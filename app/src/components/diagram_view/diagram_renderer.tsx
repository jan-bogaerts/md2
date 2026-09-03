import type { DiagramProps } from './diagram'
import { ArchitectureDiagram } from './architecture_diagram'
import { DependencyDiagram } from './dependency_diagram'
import { EntityDiagram } from './entity_diagram'
import { FlowDiagram } from './flow_diagram'
import { SequenceDiagram } from './sequence_diagram'

/** Select one of five supported thin renderers from validated metadata. */
export function DiagramRenderer(props: DiagramProps) {
    const { type } = props.data.meta
    if (type === 'architecture') return <ArchitectureDiagram {...props} />
    if (type === 'dependency') return <DependencyDiagram {...props} />
    if (type === 'sequence') return <SequenceDiagram {...props} />
    if (type === 'flow') return <FlowDiagram {...props} />

    return <EntityDiagram {...props} />
}
