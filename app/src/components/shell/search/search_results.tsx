import { Box, Chip, List, ListItemButton, ListItemText, Typography } from '@mui/material'
import type { ActionDefinition } from '../../../data/action_types'
import type { ActionSearchMatch, SearchMatch, SearchResults as SearchResultsData } from '../../../services/search/search_types'

interface SearchResultsProps {
    onActionSelect: (action: ActionDefinition) => void
    onSelect: (path: string) => void
    results: SearchResultsData
}

function renderMatch(match: SearchMatch, onSelect: (path: string) => void) {
    const handleClick = () => onSelect(match.path)
    const secondary = `${match.path} — ${match.context}`

    return (
        <ListItemButton dense key={match.path} onClick={handleClick}>
            <ListItemText
                primary={
                    <Box component="span" sx={{ alignItems: 'center', display: 'flex', gap: 1 }}>
                        <span>{match.title}</span>
                        <Chip color={match.source === 'header' ? 'primary' : 'default'} label={match.source} size="small" />
                    </Box>
                }
                secondary={secondary}
            />
        </ListItemButton>
    )
}

function renderActionMatch(match: ActionSearchMatch, onActionSelect: (action: ActionDefinition) => void) {
    const handleClick = () => onActionSelect(match.action)
    const secondary = `${match.field} - ${match.context}`

    return (
        <ListItemButton dense key={match.action.name} onClick={handleClick}>
            <ListItemText
                primary={
                    <Box component="span" sx={{ alignItems: 'center', display: 'flex', gap: 1 }}>
                        <span>{match.title}</span>
                        <Chip color="secondary" label="action" size="small" />
                    </Box>
                }
                secondary={secondary}
            />
        </ListItemButton>
    )
}

/** Renders grouped search results: active cards first, then background cards grouped by folder. */
export function SearchResults(props: SearchResultsProps) {
    const { onActionSelect, onSelect, results } = props
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
                        {results.active.map((match) => renderMatch(match, onSelect))}
                    </List>
                </Box>
            ) : null}
            {results.backgroundGroups.map((group) => (
                <Box key={group.folder}>
                    <Typography color="text.secondary" sx={{ px: 2, pt: 1 }} variant="overline">
                        {group.folder}
                    </Typography>
                    <List dense disablePadding>
                        {group.matches.map((match) => renderMatch(match, onSelect))}
                    </List>
                </Box>
            ))}
            {results.actions.length > 0 ? (
                <Box>
                    <Typography color="text.secondary" sx={{ px: 2, pt: 1 }} variant="overline">
                        Actions
                    </Typography>
                    <List dense disablePadding>
                        {results.actions.map((match) => renderActionMatch(match, onActionSelect))}
                    </List>
                </Box>
            ) : null}
        </Box>
    )
}
