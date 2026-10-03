/** Phase 021 — infrastructure adapter port contracts. */
import { describe, expect, it } from 'vitest';
import { ADAPTER_CONTRACTS, assertAdapterContract } from '../src/application';
import { DomainInvariantError } from '../src/domain';

describe('Phase 021 — adapter contracts', () => {
    it('declares persistence, clock, filesystem, process, and provider ports', () => {
        expect(Object.keys(ADAPTER_CONTRACTS).sort()).toEqual([
            'aiProvider', 'clock', 'filesystem', 'persistence', 'process', 'transaction',
        ]);
        expect(ADAPTER_CONTRACTS.filesystem).toEqual(['readFile', 'writeFile']);
    });

    it('accepts adapters implementing every required operation', () => {
        for (const [name, methods] of Object.entries(ADAPTER_CONTRACTS)) {
            const adapter = Object.fromEntries(methods.map((method) => [method, () => undefined]));
            expect(assertAdapterContract(name, adapter)).toBe(adapter);
        }
    });

    it('reports missing methods and unknown contracts explicitly', () => {
        expect(() => assertAdapterContract('clock', {})).toThrowError(expect.objectContaining({
            code: 'invalid-adapter-contract',
        }));
        expect(() => assertAdapterContract('vendor', {})).toThrowError(DomainInvariantError);
        expect(() => assertAdapterContract('process', null)).toThrowError(/execute/);
    });
});
