const SECRET_KEYS = Object.freeze({
    gemini: 'headroom.ai.credentials.gemini',
    openai: 'headroom.ai.credentials.openai',
});
const MAX_CREDENTIAL_LENGTH = 4096;

/** Adapt VS Code SecretStorage without exposing provider credentials in settings or logs. */
export function createSecretStorageAdapter(secretStorage) {
    if (typeof secretStorage?.get !== 'function' || typeof secretStorage?.store !== 'function'
        || typeof secretStorage?.delete !== 'function') {
        throw new TypeError('Secret storage must implement get, store, and delete.');
    }
    return Object.freeze({
        async getCredential(provider) {
            return secretStorage.get(secretKey(provider));
        },
        async storeCredential(provider, credential) {
            const key = secretKey(provider);
            if (typeof credential !== 'string' || credential.trim() === ''
                || credential.length > MAX_CREDENTIAL_LENGTH || /[\r\n]/.test(credential)) {
                throw new TypeError(`Provider credentials must contain 1 to ${MAX_CREDENTIAL_LENGTH} single-line characters.`);
            }
            await secretStorage.store(key, credential.trim());
            return { provider, configured: true };
        },
        async deleteCredential(provider) {
            await secretStorage.delete(secretKey(provider));
            return { provider, configured: false };
        },
        async hasCredential(provider) {
            return (await secretStorage.get(secretKey(provider))) !== undefined;
        },
    });
}

function secretKey(provider) {
    if (typeof provider !== 'string' || !Object.hasOwn(SECRET_KEYS, provider)) {
        throw new TypeError('Credentials are supported only for configured AI providers.');
    }
    return SECRET_KEYS[provider];
}
