import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { getMessage, ENGLISH_MESSAGES } from '../src/core/messages';

describe('Phase 078 — localization-ready message catalog', () => {
    it('resolves translated templates by key and rejects unknown keys or missing parameters', () => {
        const translated = { ...ENGLISH_MESSAGES, 'plan.approve': 'Autoriser le plan' };
        expect(getMessage('plan.approve', {}, translated)).toBe('Autoriser le plan');
        expect(getMessage('settings.invalid', { count: 3 }, translated)).toContain('3');
        expect(() => getMessage('not.a.key')).toThrow(/Unknown HEADROOM message key/);
        expect(() => getMessage('status.message')).toThrow(/Missing message parameter/);
    });

    it('defines every runtime key used in the extension UI', async () => {
        for (const path of ['../src/core/HeadroomContext.js', '../src/core/StatusTreeProviders.js']) {
            const source = await readFile(new URL(path, import.meta.url), 'utf8');
            for (const [, key] of source.matchAll(/getMessage\('([^']+)'/g)) {
                expect(ENGLISH_MESSAGES).toHaveProperty(key);
            }
        }
    });

    it('localizes manifest labels through package.nls.json and keeps command identities unchanged', async () => {
        const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
        const catalog = JSON.parse(await readFile(new URL('../package.nls.json', import.meta.url), 'utf8'));
        const values = [];
        const visit = (value) => {
            if (typeof value === 'string') values.push(value);
            else if (Array.isArray(value)) value.forEach(visit);
            else if (value && typeof value === 'object') Object.values(value).forEach(visit);
        };
        visit(manifest);
        for (const value of values) {
            const match = /^%([^%]+)%$/.exec(value);
            if (match) expect(catalog).toHaveProperty(match[1]);
        }
        expect(manifest.contributes.commands.map(({ command }) => command)).toContain('headroom.reviewPlan');
        expect(manifest.contributes.commands.map(({ command }) => command)).toContain('headroom.newObjective');
    });
});
