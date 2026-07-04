const services = new Map<string, unknown>()

export function register<TService>(name: string, service: TService): TService {
    services.set(name, service)

    return service
}

export function getService<TService>(name: string): TService {
    const service = services.get(name)
    if (!service) throw new Error(`Service is not registered: ${name}`)

    return service as TService
}
