import { Chip } from '@mui/material'
import { useCallback, useEffect, useState } from 'react'

/** Status-bar indicator reflecting active Caps Lock. */
export function KeyboardStatus() {
    const [isCapsLock, setIsCapsLock] = useState(false)

    const handleKeyDown = useCallback((event: KeyboardEvent) => {
        setIsCapsLock(event.getModifierState('CapsLock'))
    }, [])

    const handleKeyUp = useCallback((event: KeyboardEvent) => {
        setIsCapsLock(event.getModifierState('CapsLock'))
    }, [])

    useEffect(() => {
        window.addEventListener('keydown', handleKeyDown)
        window.addEventListener('keyup', handleKeyUp)

        return () => {
            window.removeEventListener('keydown', handleKeyDown)
            window.removeEventListener('keyup', handleKeyUp)
        }
    }, [handleKeyDown, handleKeyUp])

    if (!isCapsLock) return null

    return <Chip color="primary" label="CAPS" size="small" sx={{ fontSize: 10.5, height: 20 }} variant="outlined" />
}
