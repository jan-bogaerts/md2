import { Diagram, type DiagramProps } from './diagram'

/** Entity model mapping onto shared diagram primitives. */
export function EntityDiagram(props: DiagramProps) {
    return <Diagram {...props} />
}
