import { ApplicationError, createUseCase } from './useCase';

/** Configure, remove, or inspect provider credential presence without returning secret values. */
export function createProviderCredentialUseCases({ credentialStore } = {}) {
    if (typeof credentialStore?.storeCredential !== 'function'
        || typeof credentialStore?.deleteCredential !== 'function'
        || typeof credentialStore?.hasCredential !== 'function') {
        throw new TypeError('Provider credential use cases require a secure credential store.');
    }
    const set = createUseCase({ name: 'provider-credential-set', dependencies: { credentialStore },
        execute: async ({ input, dependencies }) => {
            const provider = requireProvider(input?.provider);
            const credential = input?.credential;
            if (typeof credential !== 'string' || credential.trim() === '') {
                throw new ApplicationError('invalid-provider-credential', 'A non-empty provider credential is required.');
            }
            await dependencies.credentialStore.storeCredential(provider, credential);
            return { provider, configured: true };
        } });
    const clear = createUseCase({ name: 'provider-credential-clear', dependencies: { credentialStore },
        execute: async ({ input, dependencies }) => {
            const provider = requireProvider(input?.provider);
            await dependencies.credentialStore.deleteCredential(provider);
            return { provider, configured: false };
        } });
    const status = createUseCase({ name: 'provider-credential-status', dependencies: { credentialStore },
        execute: async ({ input, dependencies }) => {
            const provider = requireProvider(input?.provider);
            return { provider, configured: await dependencies.credentialStore.hasCredential(provider) };
        } });
    return Object.freeze({ set, clear, status });
}

function requireProvider(value) {
    if (value !== 'gemini' && value !== 'openai') {
        throw new ApplicationError('unsupported-ai-provider', 'Credentials can be configured only for supported AI providers.');
    }
    return value;
}
