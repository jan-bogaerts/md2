import { Button, Menu, MenuItem } from '@mui/material'
import AddOutlined from '@mui/icons-material/AddOutlined'
import { useState, type MouseEvent } from 'react'
import type { Card } from '../../../../data/data_types'
import type { CardSequenceDraftService } from './card_sequence_draft_service'

interface CardSequenceCardPickerProps {
    cards: Card[]
    service: CardSequenceDraftService
}

function CardChoice(props: { card: Card; onSelected(): void; service: CardSequenceDraftService }) {
    const { card, onSelected, service } = props
    const handleSelect = () => {
        service.addCard(card.header.internalId!)
        onSelected()
    }

    return <MenuItem onClick={handleSelect}>{card.header.id} · {card.header.title}</MenuItem>
}

/** Accessible active-card picker for list view, keyboard, and touch users. */
export function CardSequenceCardPicker({ cards, service }: CardSequenceCardPickerProps) {
    const [anchorElement, setAnchorElement] = useState<HTMLElement | null>(null)
    const handleOpen = (event: MouseEvent<HTMLButtonElement>) => setAnchorElement(event.currentTarget)
    const handleClose = () => setAnchorElement(null)

    return (
        <>
            <Button onClick={handleOpen} size="small" startIcon={<AddOutlined />} variant="outlined">Add cards</Button>
            <Menu anchorEl={anchorElement} onClose={handleClose} open={!!anchorElement}>
                {cards.length === 0 ? <MenuItem disabled>No more active cards</MenuItem> : null}
                {cards.map((card) => (
                    <CardChoice card={card} key={card.header.internalId} onSelected={handleClose} service={service} />
                ))}
            </Menu>
        </>
    )
}
