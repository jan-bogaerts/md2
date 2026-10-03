export type SearchPresentation = 'full' | 'search' | 'shortcut' | 'icon';

export const SEARCH_PLACEHOLDERS: Record<SearchPresentation, string> = {full: 'Search cards…', search: 'Search', shortcut: '', icon: ''};

export const SEARCH_SHORTCUT_STYLES = {
    border: 1,
    borderColor: 'divider',
    borderRadius: 0.5,
    color: 'text.disabled',
    flexShrink: 0,
    fontSize: 10.5,
    lineHeight: 1.4,
    px: 0.75,
    whiteSpace: 'nowrap',
};

export const SEARCH_INPUT_STYLES = {
    bgcolor: 'background.default',
    borderRadius: 99,
    fontSize: 13,
    gap: 1,
    height: 32,
    px: 1.5,
    '& fieldset': { borderColor: 'divider' },
    '& .MuiInputAdornment-root': { flexShrink: 0, m: 0 },
    '& input': { minWidth: 0, px: 0, width: '100%' },
};
