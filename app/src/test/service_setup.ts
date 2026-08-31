import { MemoryStorage } from './memory_storage'
import { TestWindow } from './test_window'

const testWindow = new TestWindow()

Object.defineProperty(globalThis, 'Storage', { configurable: true, value: MemoryStorage, writable: true })
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: testWindow.localStorage, writable: true })
Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: testWindow.sessionStorage, writable: true })
Object.defineProperty(globalThis, 'window', { configurable: true, value: testWindow, writable: true })
