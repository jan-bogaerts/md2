const path = require('node:path')
const { pathToFileURL } = require('node:url')
const { resolveAppUrl } = require('./config')

const APPROVED_EXTERNAL_PROTOCOLS = new Set(['http:', 'https:'])
const PACKAGED_RENDERER_DIRECTORY = 'renderer'
const PACKAGED_RENDERER_ENTRY = 'index.html'

function resolveRendererTarget(isPackaged, appDirectory = __dirname, env = process.env) {
    if (isPackaged) {
        const filePath = path.join(appDirectory, PACKAGED_RENDERER_DIRECTORY, PACKAGED_RENDERER_ENTRY)

        return { filePath, trustedLocation: pathToFileURL(filePath).href, type: 'file' }
    }

    const url = resolveAppUrl(env)

    return { trustedLocation: url, type: 'url', url }
}

function isTrustedRendererLocation(candidateUrl, trustedLocation) {
    try {
        const candidate = new URL(candidateUrl)
        const trusted = new URL(trustedLocation)
        candidate.hash = ''
        trusted.hash = ''

        return candidate.href === trusted.href
    } catch {
        return false
    }
}

function isApprovedExternalUrl(candidateUrl) {
    try {
        return APPROVED_EXTERNAL_PROTOCOLS.has(new URL(candidateUrl).protocol)
    } catch {
        return false
    }
}

function registerNavigationGuards(webContents, trustedLocation, openExternal) {
    webContents.on('will-navigate', (event, url) => {
        if (isTrustedRendererLocation(url, trustedLocation)) return

        event.preventDefault()
        if (isApprovedExternalUrl(url)) void openExternal(url)
    })
    webContents.setWindowOpenHandler(({ url }) => {
        if (isApprovedExternalUrl(url)) void openExternal(url)

        return { action: 'deny' }
    })
}

module.exports = {
    isApprovedExternalUrl,
    isTrustedRendererLocation,
    registerNavigationGuards,
    resolveRendererTarget,
}
