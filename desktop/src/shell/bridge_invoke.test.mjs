import { describe, expect, it } from 'vitest';

import { invokeWithErrorEnvelope } from './bridge_invoke.js';
import { bridgeErrorPayload } from '../../../shared/bridge_errors.mjs';

function createMissingWorkingFolderError(workingFolder) {
    const error = new Error(`Working folder is missing: ${workingFolder}`);
    error.code = 'missing-working-folder';
    error.workingFolder = workingFolder;

    return error;
}

describe('invokeWithErrorEnvelope', () => {
    it('returns the bridge result unchanged when the call succeeds', async () => {
        expect(await invokeWithErrorEnvelope(async () => ({ files: [] }))).toEqual({ files: [] });
    });

    it('keeps the error code and marker fields that Electron would otherwise drop', async () => {
        const result = await invokeWithErrorEnvelope(() => {
            throw createMissingWorkingFolderError('design/feature_descriptions');
        });

        expect(bridgeErrorPayload(result)).toEqual({
            code: 'missing-working-folder',
            fields: { workingFolder: 'design/feature_descriptions' },
            message: 'Working folder is missing: design/feature_descriptions',
            name: 'Error',
        });
    });

    it('envelopes a rejected promise as well as a synchronous throw', async () => {
        const result = await invokeWithErrorEnvelope(async () => {
            throw new Error('Bridge call failed');
        });

        expect(bridgeErrorPayload(result)).toMatchObject({ message: 'Bridge call failed' });
        expect(bridgeErrorPayload(result).code).toBeUndefined();
    });
});
