/** Phase 457 — director request flow guards and provider factory extracted from HeadroomContext. */
import { describe, expect, it } from 'vitest';

import { directorProviderMissing, directorRequestBlock } from '../src/core/directorRequestFlow';
import { readOperationalHealth } from '../src/core/operationalHealth';

describe('Phase 457 — director request gating decisions', () => {
    it('blocks paused before cancelled before already-running, and passes otherwise', () => {
        expect(directorRequestBlock('PAUSED', { alreadyRunning: true })).toBe('director.request.paused');
        expect(directorRequestBlock('CANCELLED')).toBe('director.request.cancelled');
        expect(directorRequestBlock('ACTIVE', { alreadyRunning: true })).toBe('director.request.alreadyRunning');
        expect(directorRequestBlock('ACTIVE')).toBe(null);
        expect(directorRequestBlock('IDLE', {})).toBe(null);
    });

    it('keeps callers that never track a running request on their original behavior', () => {
        expect(directorRequestBlock('ACTIVE')).toBe(null);
        expect(directorRequestBlock('ACTIVE', { alreadyRunning: false })).toBe(null);
    });

    it('treats only the gemini provider as usable for director requests', () => {
        expect(directorProviderMissing({ aiProvider: 'gemini' })).toBe(false);
        expect(directorProviderMissing({ aiProvider: 'mock' })).toBe(true);
        expect(directorProviderMissing(undefined)).toBe(true);
        expect(directorProviderMissing({})).toBe(true);
    });
});

describe('Phase 457 — operational health reads each source independently', () => {
    it('reports healthy sources even when others throw or are missing', async () => {
        const health = await readOperationalHealth({
            database: async () => ({ status: 'HEALTHY', schemaVersion: 7 }),
            queue: async () => { throw new Error('boom'); },
            provider: async () => ({ status: 'READY', detail: 'Gemini reachable.' }),
        });
        expect(health).toHaveLength(4);
        expect(health.find((entry) => entry.id === 'database')).toMatchObject({ status: 'HEALTHY', detail: 'SQLite healthy; schema 7.' });
        expect(health.find((entry) => entry.id === 'queue')).toMatchObject({ status: 'UNAVAILABLE' });
        expect(health.find((entry) => entry.id === 'verification')).toMatchObject({ status: 'UNAVAILABLE' });
    });

    it('rejects malformed queue counters as unavailable instead of reporting them', async () => {
        const health = await readOperationalHealth({ queue: async () => ({ queued: -1, claimed: 0 }) });
        expect(health.find((entry) => entry.id === 'queue').status).toBe('UNAVAILABLE');
    });
});
