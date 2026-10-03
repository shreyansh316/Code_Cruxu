import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import { readOperationalHealth } from '../src/core/HeadroomContext';
import { HealthStatusTreeProvider } from '../src/core/StatusTreeProviders';
import { VIEWS } from '../src/constants';

describe('Phase 083 — operational health view', () => {
    it('derives database, queue, provider, and verification state from independent sources', async () => {
        const checks = await readOperationalHealth({
            database: () => ({ status: 'HEALTHY', schemaVersion: 8, issues: [] }),
            queue: () => ({ queued: 3, claimed: 1 }),
            provider: async () => ({ status: 'READY', detail: 'Mock provider selected.' }),
            verification: () => ({ status: 'NOT_RUN', detail: 'No verification result is currently recorded.' }),
        });
        expect(checks).toMatchObject([
            { id: 'database', status: 'HEALTHY', detail: 'SQLite healthy; schema 8.' },
            { id: 'queue', status: 'HEALTHY', detail: '3 queued; 1 claimed.' },
            { id: 'provider', status: 'READY' },
            { id: 'verification', status: 'NOT_RUN' },
        ]);
    });

    it('marks failing or unavailable checks independently and renders accessible stable items', async () => {
        const provider = new HealthStatusTreeProvider(() => readOperationalHealth({
            database: () => ({ status: 'DEGRADED', schemaVersion: 8, issues: [{ code: 'hidden' }] }),
            queue: () => { throw new Error('database path'); },
            provider: () => ({ status: 'READY', detail: 'Mock provider selected.' }),
            verification: () => ({ status: 'NOT_RUN', detail: 'No verification result is currently recorded.' }),
        }));
        const checks = await provider.getChildren();
        expect(checks.map(({ status }) => status)).toEqual(['DEGRADED', 'UNAVAILABLE', 'READY', 'NOT_RUN']);
        expect(JSON.stringify(checks)).not.toContain('database path');
        const item = provider.getTreeItem(checks[0]);
        expect(item.id).toBe('health:database');
        expect(item.accessibilityInformation.label).toContain('Database. DEGRADED.');
        expect(await provider.getChildren(checks[0])).toEqual([]);
        provider.dispose();
    });

    it('registers the health view in the extension manifest and view identifiers', () => {
        const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
        expect(VIEWS.HEALTH).toBe('headroom.healthView');
        const ids = manifest.contributes.views.headroom.map(({ id }) => id);
        expect(ids).toContain(VIEWS.HEALTH);
    });
});
