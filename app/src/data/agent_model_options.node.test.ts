import { describe, expect, it } from 'vitest';
import { codexCatalogFixture } from '../test/agent_catalog_fixture';
import { agentModelOptions } from './agent_model_options';
import { agentSpeedLabel } from './agent_speed_label';

describe('runtime model selections', () => {
    it('uses native identifiers and labels while preserving unadvertised saved selections', () => {
        const catalog = codexCatalogFixture();
        catalog.models[0].displayName = 'GPT 6.1 Sol';
        expect(agentModelOptions(catalog, 'retired-model')).toMatchObject([
            { id: 'retired-model' }, { id: 'gpt-6.1-sol', displayName: 'GPT 6.1 Sol' },
        ]);
        expect(agentModelOptions(null, 'saved-id')).toMatchObject([{ id: 'saved-id' }]);
    });

    it('retains a resolved Claude identifier without replacing it with an alias', () => {
        const catalog = codexCatalogFixture(['opus']);
        catalog.agent = 'claude';
        catalog.models[0].resolvedModel = 'claude-opus-new';
        expect(agentModelOptions(catalog, 'claude-opus-new')[0]).toMatchObject({ id: 'claude-opus-new' });
    });

    it('hides provider-hidden entries except the currently saved choice', () => {
        const catalog = codexCatalogFixture(['visible', 'hidden']);
        catalog.models[1].hidden = true;
        expect(agentModelOptions(catalog, 'visible').map(({ id }) => id)).toEqual(['visible']);
        expect(agentModelOptions(catalog, 'hidden').map(({ id }) => id)).toEqual(['visible', 'hidden']);
    });

    it('distinguishes requested speed from an acknowledged tier and leaves older history unchanged', () => {
        expect(agentSpeedLabel({ speedMode: 'fast' })).toBe('requested speed: Fast');
        expect(agentSpeedLabel({ speedMode: 'standard', acknowledgedServiceTier: 'default' }))
            .toBe('requested speed: Standard; provider tier: default');
        expect(agentSpeedLabel({})).toBe('');
    });
});
