import { Chip } from '@mui/material'
import KeyboardOutlined from '@mui/icons-material/KeyboardOutlined'
import { useSyncExternalStore } from 'react'
import { keyboardShortcutService } from '../../services/shortcuts/keyboard_shortcut_service'
import { MobileStatusRow } from './mobile_status_row'

/** Status-bar indicator reflecting active Caps Lock. */
export function KeyboardStatus({ mobile = false }: { mobile?: boolean }) {
    const isCapsLock = useSyncExternalStore(
        keyboardShortcutService.subscribeCapsLock,
        keyboardShortcutService.getCapsLockSnapshot,
        keyboardShortcutService.getCapsLockSnapshot,
    )

    if (!isCapsLock) return null

    if (mobile) {
        return <MobileStatusRow icon={<KeyboardOutlined sx={{ fontSize: 18 }} />} label="Caps Lock" tone="warning.main" value="Enabled" />
    }

    return <Chip color="primary" label="CAPS" size="small" sx={{ fontSize: 10.5, height: 20 }} variant="outlined" />
}
