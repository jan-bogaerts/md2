const { startGithubOAuthCorsServer } = require('./github_oauth_cors_server')

const server = startGithubOAuthCorsServer()
const address = server.address()
const port = typeof address === 'object' && address ? address.port : 'unknown'

console.log(`MD2 GitHub OAuth CORS proxy listening on port ${port}`)
