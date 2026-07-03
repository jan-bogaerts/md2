import { Box, Container, CssBaseline, Typography } from '@mui/material'

export function App() {
    return (
        <>
            <CssBaseline />
            <Box component="main" sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
                <Container maxWidth="md" sx={{ py: 8 }}>
                    <Typography component="h1" variant="h3" gutterBottom>
            MD2
                    </Typography>
                    <Typography color="text.secondary" variant="body1">
            React app initialized. Future cards, editors, diff views, and desktop bridge integrations build from here.
                    </Typography>
                </Container>
            </Box>
        </>
    )
}
