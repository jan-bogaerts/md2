import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { ResizeCorner } from './action_popup_resize_handle'

const MIN_WIDTH = 280
const MIN_HEIGHT = 200
const DEFAULT_WIDTH = 420
const DEFAULT_HEIGHT = 320

/** Own action popup resize state and pointer-drag behavior. */
export function useActionPopupResize(resizeCorner: ResizeCorner) {
    const [size, setSize] = useState({ height: DEFAULT_HEIGHT, width: DEFAULT_WIDTH })
    const resizeRef = useRef<AbortController | null>(null)

    useEffect(() => () => resizeRef.current?.abort(), [])

    const startResize = (event: ReactPointerEvent) => {
        event.preventDefault()
        resizeRef.current?.abort()
        const controller = new AbortController()
        resizeRef.current = controller
        const start = { height: size.height, width: size.width, x: event.clientX, y: event.clientY }

        window.addEventListener('pointermove', (move: PointerEvent) => {
            const dx = move.clientX - start.x
            const dy = move.clientY - start.y
            const widthDelta = resizeCorner === 'lower-left' ? -dx : dx

            setSize({
                height: Math.max(MIN_HEIGHT, start.height + dy),
                width: Math.max(MIN_WIDTH, start.width + widthDelta),
            })
        }, { signal: controller.signal })
        window.addEventListener('pointerup', () => controller.abort(), { signal: controller.signal })
    }

    return { size, startResize }
}
