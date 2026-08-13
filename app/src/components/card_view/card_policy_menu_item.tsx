import { Box, ListItemIcon, MenuItem } from '@mui/material'

interface CardPolicyMenuItemProps {
    cardPath: string
    disabled?: boolean
    enabled: boolean
    onSelected: () => void
    onToggle: (path: string, policyKey: string) => void
    policyKey: string
}

/** Overflow-menu control for one card policy flag. */
export function CardPolicyMenuItem(props: CardPolicyMenuItemProps) {
    const { cardPath, disabled = false, enabled, onSelected, onToggle, policyKey } = props

    const handleClick = () => {
        onToggle(cardPath, policyKey)
        onSelected()
    }

    return (
        <MenuItem aria-label={`Toggle ${policyKey}`} aria-pressed={enabled} disabled={disabled} onClick={handleClick}>
            <ListItemIcon>
                <Box sx={{ bgcolor: enabled ? 'success.main' : 'text.disabled', borderRadius: '50%', height: 9, width: 9 }} />
            </ListItemIcon>
            {policyKey}
        </MenuItem>
    )
}
