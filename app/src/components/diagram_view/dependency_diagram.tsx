import { Diagram, type DiagramProps } from './diagram'

/** Dependency graph mapping onto shared diagram primitives. */
export function DependencyDiagram(props: DiagramProps) {
    return <Diagram {...props} />
}
