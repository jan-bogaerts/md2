import { Badge, List, ListItemButton, ListItemText } from '@mui/material'
import { useMemo } from 'react'
import { buildCardColumns } from '../../data/card_ordering'
import type { ProjectCard, StateConfig } from '../../data/data_types'

interface CardViewNavigationProps {
    cards: ProjectCard[]
    onNavigate: () => void
    states: StateConfig[]
}

/** Left-panel list of card columns for card view navigation. */
export function CardViewNavigation(props: CardViewNavigationProps) {
    const { cards, onNavigate, states } = props
    const columns = useMemo(() => buildCardColumns(cards, states), [cards, states])

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
