import type { CSSProperties } from 'react'

// `-webkit-app-region` controls window dragging in the borderless Electron shell. It is not part of
// csstype's known properties, so these styles are cast to CSSProperties for use on the `style` prop.
export const DRAG_REGION = { WebkitAppRegion: 'drag' } as CSSProperties
export const NO_DRAG_REGION = { WebkitAppRegion: 'no-drag' } as CSSProperties
