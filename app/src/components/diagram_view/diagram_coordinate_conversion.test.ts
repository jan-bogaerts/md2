import { describe, expect, it } from 'vitest';
import {
    convertClientToDiagramCoordinates,
    type DiagramClientPoint,
    type DiagramViewportMetrics,
} from './diagram_coordinate_conversion';

const VIEWPORT_METRICS: DiagramViewportMetrics = {
    bounds: { left: 100, top: 50 },
    scrollLeft: 60,
    scrollTop: 30,
};

describe('convertClientToDiagramCoordinates', () => {
    it.each([
        { clientPoint: { clientX: 160, clientY: 80 }, scale: 0.5, viewportPoint: { x: 120, y: 60 } },
        { clientPoint: { clientX: 220, clientY: 110 }, scale: 0.75, viewportPoint: { x: 180, y: 90 } },
        { clientPoint: { clientX: 280, clientY: 140 }, scale: 1, viewportPoint: { x: 240, y: 120 } },
        { clientPoint: { clientX: 340, clientY: 170 }, scale: 1.25, viewportPoint: { x: 300, y: 150 } },
        { clientPoint: { clientX: 400, clientY: 200 }, scale: 1.5, viewportPoint: { x: 360, y: 180 } },
        { clientPoint: { clientX: 460, clientY: 230 }, scale: 1.75, viewportPoint: { x: 420, y: 210 } },
        { clientPoint: { clientX: 520, clientY: 260 }, scale: 2, viewportPoint: { x: 480, y: 240 } },
    ])('resolves the same diagram point at scale $scale', ({ clientPoint, scale, viewportPoint }) => {
        expect(convertClientToDiagramCoordinates(clientPoint, VIEWPORT_METRICS, scale)).toEqual({
            diagramPoint: { x: 240, y: 120 },
            viewportPoint,
        });
    });

    it('accounts for viewport bounds and horizontal and vertical scrolling', () => {
        const conversion = convertClientToDiagramCoordinates(
            { clientX: 425, clientY: 275 },
            { bounds: { left: 300, top: 200 }, scrollLeft: 75, scrollTop: 25 },
            2,
        );

        expect(conversion).toEqual({
            diagramPoint: { x: 100, y: 50 },
            viewportPoint: { x: 200, y: 100 },
        });
    });

    it('uses only the selected comparison pane metrics', () => {
        const clientPoint = { clientX: 720, clientY: 290 };
        const newPaneMetrics = { bounds: { left: 600, top: 200 }, scrollLeft: 80, scrollTop: 40 };
        const currentPaneMetrics = { bounds: { left: 20, top: 20 }, scrollLeft: 300, scrollTop: 500 };

        const newPaneConversion = convertClientToDiagramCoordinates(clientPoint, newPaneMetrics, 2);
        const currentPaneConversion = convertClientToDiagramCoordinates(clientPoint, currentPaneMetrics, 2);

        expect(newPaneConversion.diagramPoint).toEqual({ x: 100, y: 65 });
        expect(currentPaneConversion.diagramPoint).toEqual({ x: 500, y: 385 });
    });

    it.each([
        { clientPoint: { clientX: Number.NaN, clientY: 0 }, expectedError: 'Client x must be finite', viewportMetrics: VIEWPORT_METRICS },
        { clientPoint: { clientX: 0, clientY: Infinity }, expectedError: 'Client y must be finite', viewportMetrics: VIEWPORT_METRICS },
        {
            clientPoint: { clientX: 0, clientY: 0 },
            expectedError: 'Viewport left must be finite',
            viewportMetrics: { ...VIEWPORT_METRICS, bounds: { left: Number.NaN, top: 0 } },
        },
        {
            clientPoint: { clientX: 0, clientY: 0 },
            expectedError: 'Viewport top must be finite',
            viewportMetrics: { ...VIEWPORT_METRICS, bounds: { left: 0, top: Infinity } },
        },
        {
            clientPoint: { clientX: 0, clientY: 0 },
            expectedError: 'Viewport scroll left must be finite',
            viewportMetrics: { ...VIEWPORT_METRICS, scrollLeft: Number.NaN },
        },
        {
            clientPoint: { clientX: 0, clientY: 0 },
            expectedError: 'Viewport scroll top must be finite',
            viewportMetrics: { ...VIEWPORT_METRICS, scrollTop: Infinity },
        },
    ])('rejects invalid coordinate input: $expectedError', ({ clientPoint, expectedError, viewportMetrics }) => {
        expect(() => convertClientToDiagramCoordinates(clientPoint, viewportMetrics, 1)).toThrow(expectedError);
    });

    it.each([0, -1, Number.NaN, Infinity])('rejects invalid viewport scale %s', (viewportScale) => {
        expect(() => convertClientToDiagramCoordinates({ clientX: 0, clientY: 0 }, VIEWPORT_METRICS, viewportScale))
            .toThrow('Viewport scale must be positive and finite');
    });

    it('does not mutate coordinate inputs', () => {
        const clientPoint: DiagramClientPoint = Object.freeze({ clientX: 320, clientY: 180 });
        const bounds = Object.freeze({ left: 100, top: 50 });
        const viewportMetrics: DiagramViewportMetrics = Object.freeze({ bounds, scrollLeft: 20, scrollTop: 10 });

        expect(convertClientToDiagramCoordinates(clientPoint, viewportMetrics, 1)).toEqual({
            diagramPoint: { x: 240, y: 140 },
            viewportPoint: { x: 240, y: 140 },
        });
        expect(clientPoint).toEqual({ clientX: 320, clientY: 180 });
        expect(viewportMetrics).toEqual({ bounds: { left: 100, top: 50 }, scrollLeft: 20, scrollTop: 10 });
    });
});
