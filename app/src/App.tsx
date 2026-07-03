import { Box, Container, CssBaseline, Typography } from '@mui/material'
import { useGithubAuth } from './auth/useGithubAuth'
import { GithubAuthPanel } from './components/GithubAuthPanel'
import { ProjectWorkspace } from './components/ProjectWorkspace'

const APP_VERTICAL_PADDING = 8

export function App() {
    const auth = useGithubAuth()

    return (
        <>
            <CssBaseline />
            <Box component="main" sx={{ minHeight: '100vh', bgcolor: 'background.default', display: 'flex', alignItems: 'center' }}>
                <Container maxWidth="md" sx={{ py: APP_VERTICAL_PADDING }}>
                    <GithubAuthPanel {...auth} />
                    <Typography color="text.secondary" variant="body1">
                        Open a GitHub repository or an Electron local Git project to load markdown cards.
                    </Typography>
                    <ProjectWorkspace accessToken={auth.accessToken} isGithubAuthenticated={auth.isAuthenticated} />
                </Container>
            </Box>
        </>
    )
}
