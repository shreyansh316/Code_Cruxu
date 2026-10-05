/** Phase 288 — classify private-key and certificate bundle formats as sensitive. */
import { describe, expect, it } from 'vitest';
import { isSensitiveWorkspacePath } from '../src/infrastructure';

describe('Phase 288 — key and certificate path classification', () => {
    it('blocks common private-key, service-account, and certificate filename forms', () => {
        for (const path of ['tls.crt', 'client.cer', 'private.der', 'signing.p8', 'bundle.p7b',
            'release.jceks', 'id_ed25519_sk', 'service-account-prod.json', 'credentials.staging.json', 'secrets.prod']) {
            expect(isSensitiveWorkspacePath(path)).toBe(true);
        }
        expect(isSensitiveWorkspacePath('src/keyParser.js')).toBe(false);
    });
});
