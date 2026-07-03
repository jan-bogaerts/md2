import { Button } from '@mui/material'
import type { ProjectCard } from '../data/dataTypes'

interface CardSelectButtonProps {
    card: ProjectCard
    isSelected: boolean
    onSelect: (path: string) => void
}

export function CardSelectButton(props: CardSelectButtonProps) {
    const { card, isSelected, onSelect } = props

    const handleClick = () => {
        onSelect(card.path)
    }

    return (
        <Button onClick={handleClick} variant={isSelected ? 'contained' : 'outlined'}>
            {card.header.id} {card.header.title}
        </Button>
    )
}
