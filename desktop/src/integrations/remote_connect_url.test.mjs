import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { buildConnectUrl } = require('./remote_connect_url');

describe('buildConnectUrl', () => {
    it('places host and port into a stable fragment-free page URL', () => {
        expect(buildConnectUrl('desktop.local', 8123)).toBe('http://desktop.local:8123/');
    });
});
