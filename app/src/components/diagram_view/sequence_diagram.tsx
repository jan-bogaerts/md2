import { Diagram, type DiagramProps } from './diagram'

/** Sequence grid mapping onto shared diagram primitives. */
export function SequenceDiagram(props: DiagramProps) {
    return <Diagram {...props} />
}
