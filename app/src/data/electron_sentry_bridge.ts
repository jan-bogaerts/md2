export interface ElectronSentryRequest {
    apiToken: string
    url: string
}

export interface ElectronSentryResponse {
    body: string
    headers: {
        link: string | null
        retryAfter: string | null
    }
    status: number
}

export interface ElectronSentryBridge {
    request(request: ElectronSentryRequest): Promise<ElectronSentryResponse>
}

declare global {
    interface Window {
        md2Sentry?: ElectronSentryBridge
    }
}

export function getElectronSentryBridge() {
    return window.md2Sentry ?? null
}
