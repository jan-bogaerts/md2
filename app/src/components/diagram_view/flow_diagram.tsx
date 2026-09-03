import { Diagram, type DiagramProps } from './diagram'

/** Flowchart or state preset mapping onto shared diagram primitives. */
export function FlowDiagram(props: DiagramProps) {
    return <Diagram {...props} />
}
