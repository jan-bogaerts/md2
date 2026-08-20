import { Chip } from '@mui/material'
import KeyboardOutlined from '@mui/icons-material/KeyboardOutlined'
import { useCallback, useEffect, useState } from 'react'
import { MobileStatusRow } from './mobile_status_row'

/** Status-bar indicator reflecting active Caps Lock. */
export function KeyboardStatus({ mobile = false }: { mobile?: boolean }) {
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

    if (mobile) {
        return <MobileStatusRow icon={<KeyboardOutlined sx={{ fontSize: 18 }} />} label="Caps Lock" tone="warning.main" value="Enabled" />
    }

    return <Chip color="primary" label="CAPS" size="small" sx={{ fontSize: 10.5, height: 20 }} variant="outlined" />
}
