import { MenuItem } from '@mui/material'
import { dialogService } from '../../services/dialog_service'

interface CardPathMenuItemsProps {
    cardPath: string
    onSelected: () => void
    rootPath?: string
}

function absoluteCardPath(rootPath: string, cardPath: string) {
    const separator = rootPath.includes('\\') ? '\\' : '/'
    const normalizedRootPath = rootPath.replace(/[\\/]+$/gu, '')
    const normalizedCardPath = cardPath.replace(/[\\/]/gu, separator).replace(/^[\\/]+/gu, '')

    return `${normalizedRootPath}${separator}${normalizedCardPath}`
}

async function copyCardPath(path: string, onSelected: () => void) {
    onSelected()
    try {
        await navigator.clipboard.writeText(path)
    } catch (error) {
        dialogService.error(error, { fallbackMessage: 'Path could not be copied to clipboard' })
    }
}

/** Shared path-copy commands for menus representing parsed cards. */
export function CardPathMenuItems(props: CardPathMenuItemsProps) {
    const { cardPath, onSelected, rootPath } = props

    const copyAbsolutePath = () => {
        if (!rootPath) throw new Error('Cannot copy absolute card path without project root path')
        void copyCardPath(absoluteCardPath(rootPath, cardPath), onSelected)
    }

    const copyRelativePath = () => {
        void copyCardPath(cardPath, onSelected)
    }

    return (
        <>
            {rootPath ? <MenuItem onClick={copyAbsolutePath}>Copy path</MenuItem> : null}
            <MenuItem onClick={copyRelativePath}>Copy relative path</MenuItem>
        </>
    )
}
