import { Button } from '@mui/material'
import { useSortable } from '@dnd-kit/sortable'
import type { StateConfig } from '../../data/data_types'
import { defaultColumnAccent } from '../../data/data_types'
import { colorSwatchButtonSx } from './config_color_contrast'

interface ColumnButtonProps {
    column: StateConfig
    disabled: boolean
    index: number
    onEdit: (index: number) => void
}

/** One board column shown as a sortable button filled with its own colour. */
export function ColumnButton(props: ColumnButtonProps) {
    const { column, disabled, index, onEdit } = props
    const sortable = useSortable({ disabled, id: column.state })
    const { attributes, listeners, setNodeRef, transform, transition } = sortable
    const style = transform
        ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, transition }
        : { transition }

    const handleClick = () => {
        onEdit(index)
    }

    return (
        <Button
            {...attributes}
            {...listeners}
            disabled={disabled}
            onClick={handleClick}
            ref={setNodeRef}
            style={style}
            sx={colorSwatchButtonSx(column.color ?? defaultColumnAccent(index))}
            variant="contained"
        >
            {column.state}
        </Button>
    )
}
