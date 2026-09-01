import type { DiagramWaypoint } from '../../services/diagrams/diagram_data'

const CORNER_RADIUS = 8

function distance(left: DiagramWaypoint, right: DiagramWaypoint) {
    return Math.hypot(right.x - left.x, right.y - left.y)
}

function pointToward(from: DiagramWaypoint, to: DiagramWaypoint, distanceFromStart: number) {
    const segmentLength = distance(from, to)
    if (segmentLength === 0) return from
    const ratio = distanceFromStart / segmentLength

    return { x: from.x + (to.x - from.x) * ratio, y: from.y + (to.y - from.y) * ratio }
}

/** Convert orthogonal waypoints to an SVG path with bounded rounded elbows. */
export function roundedDiagramPath(points: DiagramWaypoint[]) {
    if (points.length === 0) return ''
    if (points.length === 1) return `M ${points[0].x} ${points[0].y}`
    const commands = [`M ${points[0].x} ${points[0].y}`]
    for (let index = 1; index < points.length - 1; index += 1) {
        const previous = points[index - 1]
        const current = points[index]
        const next = points[index + 1]
        const radius = Math.min(CORNER_RADIUS, distance(previous, current) / 2, distance(current, next) / 2)
        const before = pointToward(current, previous, radius)
        const after = pointToward(current, next, radius)
        commands.push(`L ${before.x} ${before.y}`, `Q ${current.x} ${current.y} ${after.x} ${after.y}`)
    }
    const last = points.at(-1) as DiagramWaypoint
    commands.push(`L ${last.x} ${last.y}`)

    return commands.join(' ')
}
