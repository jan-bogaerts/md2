import { Box, Chip, List, ListItemButton, ListItemText, Typography } from '@mui/material'
import type { ActionDefinition } from '../../../data/action_types'
import type {
    ActionSearchMatch, SearchMatch, SearchMode, SearchResults as SearchResultsData,
} from '../../../services/search/search_types'

interface SearchResultsProps {
    mode: SearchMode
    onActionSelect: (action: ActionDefinition) => void
    onSelect: (match: SearchMatch) => void
    query: string
    results: SearchResultsData
}

function renderHighlightedContext(context: string, query: string, mode: SearchMode) {
    let index: number
    let matchedText: string

    if (mode === 'text') {
        index = context.toLowerCase().indexOf(query.toLowerCase())
        if (index === -1) return context

        matchedText = context.slice(index, index + query.length)
    } else {
        try {
            const match = new RegExp(query).exec(context)
            if (!match) return context

            index = match.index
            matchedText = match[0]
        } catch {
            return context
        }
    }

    const before = context.slice(0, index)
    const after = context.slice(index + matchedText.length)

    return (
        <span>
            {before}
            <Box component="mark" sx={{ bgcolor: 'warning.light', borderRadius: 0.25, color: 'warning.contrastText' }}>
                {matchedText}
            </Box>
            {after}
        </span>
    )
}

function renderMatch(match: SearchMatch, onSelect: (match: SearchMatch) => void, query: string, mode: SearchMode) {
    const handleClick = () => onSelect(match)
    const context = renderHighlightedContext(match.context, query, mode)

    return (
        <ListItemButton dense key={match.path} onClick={handleClick}>
            <ListItemText
                primary={
                    <Box component="span" sx={{ alignItems: 'center', display: 'flex', gap: 1 }}>
                        <span>{match.title}</span>
                        <Chip color={match.source === 'header' ? 'primary' : 'default'} label={match.source} size="small" />
                    </Box>
                }
                secondary={<span>{match.path} — {context}</span>}
            />
        </ListItemButton>
    )
}

function renderActionMatch(
    match: ActionSearchMatch,
    onActionSelect: (action: ActionDefinition) => void,
    query: string,
    mode: SearchMode,
) {
    const handleClick = () => onActionSelect(match.action)
    const context = renderHighlightedContext(match.context, query, mode)

    return (
        <ListItemButton dense key={match.action.id} onClick={handleClick}>
            <ListItemText
                primary={
                    <Box component="span" sx={{ alignItems: 'center', display: 'flex', gap: 1 }}>
                        <span>{match.title}</span>
                        <Chip color="secondary" label="action" size="small" />
                    </Box>
                }
                secondary={<span>{match.field} - {context}</span>}
            />
        </ListItemButton>
    )
}

/** Renders grouped search results: active cards first, then background cards grouped by folder. */
export function SearchResults(props: SearchResultsProps) {
    const { mode, onActionSelect, onSelect, query, results } = props
    const hasAny = results.active.length > 0 || results.backgroundGroups.length > 0 || results.actions.length > 0

    if (!hasAny) {
        return (
            <Box sx={{ p: 2 }}>
                <Typography color="text.secondary" variant="body2">
                    No matches found.
                </Typography>
            </Box>
        )
    }

    return (
        <Box>
            {results.active.length > 0 ? (
                <Box>
                    <Typography color="text.secondary" sx={{ px: 2, pt: 1 }} variant="overline">
                        Active cards
                    </Typography>
                    <List dense disablePadding>
                        {results.active.map((match) => renderMatch(match, onSelect, query, mode))}
                    </List>
                </Box>
            ) : null}
            {results.backgroundGroups.map((group) => (
                <Box key={group.folder}>
                    <Typography color="text.secondary" sx={{ px: 2, pt: 1 }} variant="overline">
                        {group.folder}
                    </Typography>
                    <List dense disablePadding>
                        {group.matches.map((match) => renderMatch(match, onSelect, query, mode))}
                    </List>
                </Box>
            ))}
            {results.actions.length > 0 ? (
                <Box>
                    <Typography color="text.secondary" sx={{ px: 2, pt: 1 }} variant="overline">
                        Actions
                    </Typography>
                    <List dense disablePadding>
                        {results.actions.map((match) => renderActionMatch(match, onActionSelect, query, mode))}
                    </List>
                </Box>
            ) : null}
        </Box>
    )
}
