import { useEffect, useState } from 'react'

const CONFIG_ROUTE = '/config'
const CONFIG_ROUTE_HASH = `#${CONFIG_ROUTE}`

export interface AppLocation {
    hash: string
    pathname: string
}

function readLocation(): AppLocation {
    const routeHash = window.location.hash
    if (routeHash === CONFIG_ROUTE_HASH) return { hash: '', pathname: CONFIG_ROUTE }
    if (routeHash.startsWith(`${CONFIG_ROUTE_HASH}/`)) {
        return { hash: `#${routeHash.slice(CONFIG_ROUTE_HASH.length + 1)}`, pathname: CONFIG_ROUTE }
    }

    return { hash: routeHash, pathname: '/' }
}

export function navigateTo(path: string) {
    if (path !== '/' && path !== CONFIG_ROUTE) throw new Error(`Unsupported app route: ${path}`)

    window.location.hash = path === '/' ? '' : path
    window.dispatchEvent(new Event('hashchange'))
}

export function useAppLocation() {
    const [location, setLocation] = useState<AppLocation>(readLocation)

    useEffect(() => {
        const handleLocationChange = () => {
            setLocation(readLocation())
        }

        window.addEventListener('hashchange', handleLocationChange)
        window.addEventListener('popstate', handleLocationChange)

        return () => {
            window.removeEventListener('hashchange', handleLocationChange)
            window.removeEventListener('popstate', handleLocationChange)
        }
    }, [])

    return location
}
