import { Diagram, type DiagramProps } from './diagram'

/** Mindmap mapping onto shared primitives with circular nodes and quadratic connections. */
export function MindmapDiagram(props: DiagramProps) {
    return <Diagram {...props} circularNodes curvedEdges />
}
