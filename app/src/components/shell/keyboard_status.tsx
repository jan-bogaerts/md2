import { Chip, Stack } from '@mui/material'
import { useCallback, useEffect, useState } from 'react'

/** Status-bar indicator reflecting Caps Lock and Insert/overwrite keyboard state. */
export function KeyboardStatus() {
    const [isCapsLock, setIsCapsLock] = useState(false)
    const [isOverwrite, setIsOverwrite] = useState(false)

    const handleKeyDown = useCallback((event: KeyboardEvent) => {
        setIsCapsLock(event.getModifierState('CapsLock'))
        if (event.key === 'Insert') setIsOverwrite((current) => !current)
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

    return (
        <Stack direction="row" spacing={1}>
            <Chip
                color={isCapsLock ? 'primary' : 'default'}
                label={isCapsLock ? 'Caps On' : 'Caps Off'}
                size="small"
                variant={isCapsLock ? 'filled' : 'outlined'}
            />
            <Chip
                color={isOverwrite ? 'primary' : 'default'}
                label={isOverwrite ? 'OVR' : 'INS'}
                size="small"
                variant={isOverwrite ? 'filled' : 'outlined'}
            />
        </Stack>
    )
}
