import { DomainInvariantError } from '../domain/errors';

/** Required asynchronous/synchronous operations for replaceable adapters. */
export const ADAPTER_CONTRACTS = Object.freeze({
    persistence: Object.freeze(['get', 'put', 'delete']),
    transaction: Object.freeze(['run']),
    clock: Object.freeze(['now']),
    filesystem: Object.freeze(['readFile', 'writeFile']),
    process: Object.freeze(['execute']),
    aiProvider: Object.freeze(['generate']),
});

/** Reject an adapter that does not implement the selected application port. */
export function assertAdapterContract(name, adapter) {
    const requiredMethods = ADAPTER_CONTRACTS[name];
    if (!requiredMethods) {
        throw new DomainInvariantError('unknown-adapter-contract', `Adapter contract ${String(name)} is not defined.`);
    }
    const missing = requiredMethods.filter((method) => typeof adapter?.[method] !== 'function');
    if (missing.length > 0) {
        throw new DomainInvariantError('invalid-adapter-contract',
            `Adapter ${name} is missing required methods: ${missing.join(', ')}.`);
    }
    return adapter;
}
