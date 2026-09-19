/** Shared grouped action-button presentation for run surfaces. */
export const ACTION_SELECTOR_GROUP_SX = {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 1,
    '& .MuiToggleButtonGroup-grouped': {
        bgcolor: 'action.selected',
        border: '1px solid transparent',
        borderRadius: '7px !important',
        color: 'text.secondary',
        fontSize: 12,
        fontWeight: 600,
        height: 26,
        m: '0 !important',
        px: 1.5,
        textTransform: 'none',
        '&:hover': { bgcolor: 'action.hover', borderColor: 'text.disabled', color: 'text.primary' },
        '&.Mui-selected': {
            bgcolor: 'action.selected',
            borderColor: 'primary.main',
            color: 'primary.main',
            '&:hover': { bgcolor: 'action.selected' },
        },
    },
} as const
