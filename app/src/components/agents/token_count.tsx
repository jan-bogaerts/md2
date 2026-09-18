import { Box } from '@mui/material'
import { formatTokenCount } from './token_count_format'

interface TokenCountProps {
    value: number
}

/** Inline abbreviated token count. Carries no tooltip; consuming surfaces own their own. */
export function TokenCount({ value }: TokenCountProps) {
    return <Box component="span">{formatTokenCount(value)}</Box>
}
