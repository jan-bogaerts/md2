import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { sendSentryRequest } = require('./sentry_service');

describe('sendSentryRequest', () => {
    it('sends bearer-authenticated requests and serializes response data', async () => {
        const fetchRequest = vi.fn(async () => new Response('{"id":"project"}', {
            headers: { Link: '<next>; rel="next"', 'Retry-After': '30' },
            status: 200,
        }));

        const response = await sendSentryRequest({
            apiToken: 'secret-token',
            url: 'https://sentry.example.com/api/0/projects/acme/frontend/',
        }, fetchRequest);

        expect(fetchRequest).toHaveBeenCalledWith(
            'https://sentry.example.com/api/0/projects/acme/frontend/',
            { headers: { Accept: 'application/json', Authorization: 'Bearer secret-token' } },
        );
        expect(response).toEqual({
            body: '{"id":"project"}',
            headers: { link: '<next>; rel="next"', retryAfter: '30' },
            status: 200,
        });
    });

    it('rejects non-HTTP request URLs', async () => {
        await expect(sendSentryRequest({ apiToken: 'secret-token', url: 'file:///secret' }, vi.fn())).rejects.toThrow(
            'Sentry request URL must use HTTP or HTTPS',
        );
    });
});
