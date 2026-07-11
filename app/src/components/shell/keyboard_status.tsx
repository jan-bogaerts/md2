import { Chip, Stack } from '@mui/material'
import { useCallback, useEffect, useState } from 'react'

/** Status-bar indicator reflecting active Caps Lock and insert/overwrite state. */
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
        <Stack direction="row" spacing={0.75}>
            {isCapsLock ? (
                <Chip color="primary" label="CAPS" size="small" sx={{ fontSize: 10.5, height: 20 }} variant="outlined" />
            ) : null}
            <Chip
                color={isOverwrite ? 'primary' : 'default'}
                label={isOverwrite ? 'OVR' : 'INS'}
                size="small"
                sx={{ borderRadius: 0.5, fontSize: 10.5, fontWeight: 600, height: 20, letterSpacing: 0.4 }}
                variant="outlined"
            />
        </Stack>
    )
}
