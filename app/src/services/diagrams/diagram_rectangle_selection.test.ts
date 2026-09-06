import { describe, expect, it } from 'vitest';
import {
    diagramRectangleBetween,
    diagramRectangleIntersectsBox,
    diagramRectangleIntersectsRoute,
} from './diagram_rectangle_selection';

describe('diagram rectangle selection geometry', () => {
    it('normalizes every drag direction without mutating input points', () => {
        const start = Object.freeze({ x: 80, y: 70 });
        const end = Object.freeze({ x: 20, y: 10 });

        expect(diagramRectangleBetween(start, end)).toEqual({ height: 60, width: 60, x: 20, y: 10 });
        expect(start).toEqual({ x: 80, y: 70 });
        expect(end).toEqual({ x: 20, y: 10 });
    });

    it('includes boxes that overlap or touch the rectangle and excludes separated boxes', () => {
        const rectangle = { height: 40, width: 60, x: 20, y: 10 };

        expect(diagramRectangleIntersectsBox(rectangle, { height: 10, width: 10, x: 25, y: 15 })).toBe(true);
        expect(diagramRectangleIntersectsBox(rectangle, { height: 10, width: 10, x: 80, y: 20 })).toBe(true);
        expect(diagramRectangleIntersectsBox(rectangle, { height: 10, width: 10, x: 81, y: 20 })).toBe(false);
    });

    it('includes edge routes inside, crossing, or touching the rectangle', () => {
        const rectangle = { height: 40, width: 60, x: 20, y: 10 };

        expect(diagramRectangleIntersectsRoute(rectangle, [{ x: 30, y: 20 }, { x: 50, y: 20 }])).toBe(true);
        expect(diagramRectangleIntersectsRoute(rectangle, [{ x: 0, y: 30 }, { x: 100, y: 30 }])).toBe(true);
        expect(diagramRectangleIntersectsRoute(rectangle, [{ x: 0, y: 10 }, { x: 20, y: 10 }])).toBe(true);
        expect(diagramRectangleIntersectsRoute(rectangle, [{ x: 0, y: 10 }, { x: 10, y: 10 }])).toBe(false);
        expect(diagramRectangleIntersectsRoute(rectangle, [{ x: 0, y: 0 }, { x: 10, y: 5 }])).toBe(false);
        expect(diagramRectangleIntersectsRoute(rectangle, [])).toBe(false);
    });
});
