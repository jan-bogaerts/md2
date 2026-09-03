import type { DiagramLegendPosition } from '../../services/diagrams/diagram_view_service'

function clampCoordinate(value: number, containerSize: number, panelSize: number) {
    return Math.min(Math.max(value, 0), Math.max(containerSize - panelSize, 0))
}

export function clampLegendPosition(
    position: DiagramLegendPosition,
    viewportWidth: number,
    viewportHeight: number,
    panelWidth: number,
    panelHeight: number,
): DiagramLegendPosition {
    return {
        left: clampCoordinate(position.left, viewportWidth, panelWidth),
        top: clampCoordinate(position.top, viewportHeight, panelHeight),
    }
}
