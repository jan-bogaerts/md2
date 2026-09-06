export interface DiagramClientPoint {
    clientX: number;
    clientY: number;
}

export interface DiagramViewportMetrics {
    bounds: {
        left: number;
        top: number;
    };
    scrollLeft: number;
    scrollTop: number;
}

export interface DiagramPoint {
    x: number;
    y: number;
}

export interface DiagramCoordinateConversion {
    diagramPoint: DiagramPoint;
    viewportPoint: DiagramPoint;
}

function requireFiniteCoordinate(value: number, name: string) {
    if (!Number.isFinite(value)) throw new Error(`${name} must be finite`);
}

/** Converts one client-space pointer through its viewport into canonical diagram coordinates. */
export function convertClientToDiagramCoordinates(
    clientPoint: DiagramClientPoint,
    viewportMetrics: DiagramViewportMetrics,
    viewportScale: number,
): DiagramCoordinateConversion {
    requireFiniteCoordinate(clientPoint.clientX, 'Client x');
    requireFiniteCoordinate(clientPoint.clientY, 'Client y');
    requireFiniteCoordinate(viewportMetrics.bounds.left, 'Viewport left');
    requireFiniteCoordinate(viewportMetrics.bounds.top, 'Viewport top');
    requireFiniteCoordinate(viewportMetrics.scrollLeft, 'Viewport scroll left');
    requireFiniteCoordinate(viewportMetrics.scrollTop, 'Viewport scroll top');
    if (!Number.isFinite(viewportScale) || viewportScale <= 0) throw new Error('Viewport scale must be positive and finite');

    const viewportPoint = {
        x: clientPoint.clientX - viewportMetrics.bounds.left + viewportMetrics.scrollLeft,
        y: clientPoint.clientY - viewportMetrics.bounds.top + viewportMetrics.scrollTop,
    };
    const diagramPoint = {
        x: viewportPoint.x / viewportScale,
        y: viewportPoint.y / viewportScale,
    };

    return { diagramPoint, viewportPoint };
}
