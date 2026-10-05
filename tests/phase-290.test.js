/** Phase 290 — redact database URL and HTTP Basic credentials from captured text. */
import { describe, expect, it } from 'vitest';
import { redactSecrets } from '../src/shared/redactSecrets';

describe('Phase 290 — connection credential redaction', () => {
    it('removes URL passwords and HTTP Basic authorization material', () => {
        const input = 'DATABASE_URL=postgres://db-user:s3cr3t%2Fvalue@db.example/app Authorization: Basic dXNlcjpwYXNzd29yZA==';
        const output = redactSecrets(input, 1024);
        expect(output).not.toContain('s3cr3t');
        expect(output).not.toContain('dXNlcjpwYXNzd29yZA==');
        expect(output).toContain('postgres://db-user:[redacted]@db.example/app');
        expect(output).toContain('Basic [redacted]');
    });
});
