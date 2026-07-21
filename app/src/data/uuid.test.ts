import { afterEach, describe, expect, it, vi } from 'vitest'
import { generateUuid } from './uuid'

describe('generateUuid', () => {
    afterEach(() => {
        vi.unstubAllGlobals()
    })

    it('generates a UUID when randomUUID is unavailable', () => {
        let nextByte = 0
        const getRandomValues = vi.fn((bytes: Uint8Array) => {
            bytes.forEach((_, index) => {
                bytes[index] = nextByte
                nextByte += 1
            })

            return bytes
        })
        vi.stubGlobal('crypto', { getRandomValues })

        expect(generateUuid()).toBe('00010203-0405-4607-8809-0a0b0c0d0e0f')
        expect(getRandomValues).toHaveBeenCalledOnce()
    })
})
