/** Phase 304 — redact private-key material from captured text boundaries. */
import { describe, expect, it } from 'vitest';
import { redactSecrets } from '../src/shared/redactSecrets';

describe('Phase 304 — private key text redaction', () => {
    it('removes complete supported PEM/OpenSSH private-key blocks', () => {
        const block = '-----BEGIN OPENSSH PRIVATE KEY-----\nMIIE-private-material\n-----END OPENSSH PRIVATE KEY-----';
        const sanitized = redactSecrets(`loaded ${block} then continued`, 180);
        expect(sanitized).toBe('loaded [redacted-private-key] then continued');
        expect(sanitized).not.toContain('MIIE-private-material');
    });

    it('does not alter ordinary private-key discussion without a key block', () => {
        expect(redactSecrets('Use a private key stored in SecretStorage.', 100))
            .toBe('Use a private key stored in SecretStorage.');
    });
});
