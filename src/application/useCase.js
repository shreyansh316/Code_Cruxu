import { DomainInvariantError } from '../domain/errors';

const SAFE_CODE = /^[a-z][a-z0-9.-]{0,63}$/;

export class ApplicationError extends Error {
    constructor(code, message, { retryable = false } = {}) {
        if (typeof code !== 'string' || !SAFE_CODE.test(code)
            || typeof message !== 'string' || message.trim() === ''
            || typeof retryable !== 'boolean') {
            throw new TypeError('Application errors require a stable code, actionable message, and retryable flag.');
        }
        super(message.trim());
        this.name = 'ApplicationError';
        this.code = code;
        this.retryable = retryable;
    }
}

/** Bind adapters once and expose a uniform, non-throwing application outcome. */
export function createUseCase({ name, dependencies = {}, execute } = {}) {
    if (typeof name !== 'string' || !SAFE_CODE.test(name) || typeof execute !== 'function'
        || dependencies === null || typeof dependencies !== 'object' || Array.isArray(dependencies)) {
        throw new TypeError('A use case requires a stable name, dependency object, and execute function.');
    }
    const injected = Object.freeze({ ...dependencies });
    return Object.freeze({
        name,
        async run(input) {
            try {
                return { ok: true, value: await execute({ input, dependencies: injected }) };
            }
            catch (error) {
                if (error instanceof ApplicationError) {
                    return { ok: false, error: { code: error.code, message: error.message, retryable: error.retryable } };
                }
                if (error instanceof DomainInvariantError) {
                    return { ok: false, error: { code: error.code, message: error.message, retryable: false } };
                }
                return { ok: false, error: { code: 'operation-failed', message: 'The requested operation could not be completed.', retryable: false } };
            }
        },
    });
}
