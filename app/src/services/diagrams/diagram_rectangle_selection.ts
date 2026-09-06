import type { DiagramWaypoint } from './diagram_data';

export interface DiagramPoint {
    x: number;
    y: number;
}

export interface DiagramRectangle extends DiagramPoint {
    height: number;
    width: number;
}

function pointInsideRectangle(point: DiagramPoint, rectangle: DiagramRectangle) {
    return point.x >= rectangle.x && point.x <= rectangle.x + rectangle.width
        && point.y >= rectangle.y && point.y <= rectangle.y + rectangle.height;
}

function orientation(first: DiagramPoint, second: DiagramPoint, third: DiagramPoint) {
    return (second.y - first.y) * (third.x - second.x) - (second.x - first.x) * (third.y - second.y);
}

function pointOnSegment(first: DiagramPoint, second: DiagramPoint, point: DiagramPoint) {
    return point.x >= Math.min(first.x, second.x) && point.x <= Math.max(first.x, second.x)
        && point.y >= Math.min(first.y, second.y) && point.y <= Math.max(first.y, second.y);
}

function segmentsIntersect(
    firstStart: DiagramPoint,
    firstEnd: DiagramPoint,
    secondStart: DiagramPoint,
    secondEnd: DiagramPoint,
) {
    const firstStartOrientation = orientation(firstStart, firstEnd, secondStart);
    const firstEndOrientation = orientation(firstStart, firstEnd, secondEnd);
    const secondStartOrientation = orientation(secondStart, secondEnd, firstStart);
    const secondEndOrientation = orientation(secondStart, secondEnd, firstEnd);
    const firstSegmentStraddles = (firstStartOrientation > 0 && firstEndOrientation < 0)
        || (firstStartOrientation < 0 && firstEndOrientation > 0);
    const secondSegmentStraddles = (secondStartOrientation > 0 && secondEndOrientation < 0)
        || (secondStartOrientation < 0 && secondEndOrientation > 0);
    if (firstSegmentStraddles && secondSegmentStraddles) return true;
    if (firstStartOrientation === 0 && pointOnSegment(firstStart, firstEnd, secondStart)) return true;
    if (firstEndOrientation === 0 && pointOnSegment(firstStart, firstEnd, secondEnd)) return true;
    if (secondStartOrientation === 0 && pointOnSegment(secondStart, secondEnd, firstStart)) return true;

    return secondEndOrientation === 0 && pointOnSegment(secondStart, secondEnd, firstEnd);
}

/** Builds an axis-aligned rectangle regardless of drag direction. */
export function diagramRectangleBetween(start: DiagramPoint, end: DiagramPoint): DiagramRectangle {
    return Object.freeze({
        height: Math.abs(end.y - start.y),
        width: Math.abs(end.x - start.x),
        x: Math.min(start.x, end.x),
        y: Math.min(start.y, end.y),
    });
}

/** Reports inclusive overlap, so touching a selection boundary counts as intersection. */
export function diagramRectangleIntersectsBox(rectangle: DiagramRectangle, box: DiagramRectangle) {
    return rectangle.x <= box.x + box.width && rectangle.x + rectangle.width >= box.x
        && rectangle.y <= box.y + box.height && rectangle.y + rectangle.height >= box.y;
}

/** Reports whether any point or segment of an edge route intersects the rectangle. */
export function diagramRectangleIntersectsRoute(
    rectangle: DiagramRectangle,
    points: readonly DiagramWaypoint[],
) {
    if (points.some((point) => pointInsideRectangle(point, rectangle))) return true;

    const topLeft = { x: rectangle.x, y: rectangle.y };
    const topRight = { x: rectangle.x + rectangle.width, y: rectangle.y };
    const bottomRight = { x: rectangle.x + rectangle.width, y: rectangle.y + rectangle.height };
    const bottomLeft = { x: rectangle.x, y: rectangle.y + rectangle.height };
    const rectangleSegments = [
        [topLeft, topRight],
        [topRight, bottomRight],
        [bottomRight, bottomLeft],
        [bottomLeft, topLeft],
    ] as const;

    return points.slice(1).some((point, index) => (
        rectangleSegments.some(([start, end]) => segmentsIntersect(points[index], point, start, end))
    ));
}
