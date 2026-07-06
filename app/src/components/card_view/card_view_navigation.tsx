import { Badge, List, ListItemButton, ListItemText } from '@mui/material'
import { useMemo } from 'react'
import { groupByStatus } from '../../data/card_ordering'
import type { ProjectCard } from '../../data/data_types'

interface CardViewNavigationProps {
    cards: ProjectCard[]
    onNavigate: () => void
}

/** Left-panel list of card columns for card view navigation. */
export function CardViewNavigation(props: CardViewNavigationProps) {
    const { cards, onNavigate } = props
    const columns = useMemo(() => groupByStatus(cards), [cards])

    return (
        <List aria-label="Card columns" dense>
            {columns.map((column) => (
                <ListItemButton key={column.status} onClick={onNavigate}>
                    <ListItemText primary={column.status} />
                    <Badge badgeContent={column.cards.length} color="primary" />
                </ListItemButton>
            ))}
        </List>
    )
}
