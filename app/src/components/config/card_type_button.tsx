import { Button } from '@mui/material'
import type { CardTypeConfig } from '../../data/data_types'
import { colorSwatchButtonSx } from './config_color_contrast'

interface CardTypeButtonProps {
    cardType: CardTypeConfig
    disabled: boolean
    index: number
    onEdit: (index: number) => void
}

/** One card type shown as a button filled with its own colour. */
export function CardTypeButton(props: CardTypeButtonProps) {
    const { cardType, disabled, index, onEdit } = props

    const handleClick = () => {
        onEdit(index)
    }

    return (
        <Button disabled={disabled} onClick={handleClick} sx={colorSwatchButtonSx(cardType.color)} variant="contained">
            {cardType.label}
        </Button>
    )
}
