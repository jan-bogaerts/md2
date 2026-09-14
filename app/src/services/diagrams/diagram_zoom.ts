export const DEFAULT_DIAGRAM_ZOOM = 1
export const DIAGRAM_ZOOM_STEP = 0.05
export const MINIMUM_DIAGRAM_ZOOM = 0.05
export const MAXIMUM_DIAGRAM_ZOOM = 2

export const DIAGRAM_ZOOM_VALUES: readonly number[] = Object.freeze([
    MINIMUM_DIAGRAM_ZOOM,
    ...Array.from(
        { length: MAXIMUM_DIAGRAM_ZOOM / DIAGRAM_ZOOM_STEP },
        (_value, index) => (index + 1) * DIAGRAM_ZOOM_STEP,
    ).filter((value) => value > MINIMUM_DIAGRAM_ZOOM),
])
