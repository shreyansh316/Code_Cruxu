/** Phase 212 — credential redaction for user-visible activity metadata. */
import { describe, expect, it } from 'vitest';
import { createCommandCenterSnapshot } from '../src/core/CommandCenterPanel';
import { ExecutionActivityFeed } from '../src/core/ExecutionActivityFeed';
import { redactSecrets } from '../src/shared/redactSecrets';

describe('Phase 212 — activity credential redaction', () => {
    it('redacts common provider, cloud, source-control, bearer, and JWT credentials', () => {
        const secrets = [
            'ghp_123456789012345678901234567890123456',
            'github_pat_123456789012345678901234567890123456',
            'sk-proj-123456789012345678901234567890',
            `AIza${'A'.repeat(35)}`,
            'AKIA1234567890ABCDEF',
            `eyJ${'a'.repeat(12)}.${'b'.repeat(12)}.${'c'.repeat(8)}`,
            'Bearer abc.def-123',
            'client_secret=hidden-value',
        ];
        const sanitized = redactSecrets(secrets.join(' '), 1000);
        for (const secret of secrets) expect(sanitized).not.toContain(secret);
        expect(sanitized.match(/\[redacted/g)).toHaveLength(secrets.length);
    });

    it('applies the common redactor to feed targets and changed-file paths', () => {
        const feed = new ExecutionActivityFeed();
        feed.record('workspace', { operation: 'write', path: `src/${'ghp_123456789012345678901234567890123456'}.js`, bytes: 1, succeeded: true });
        const snapshot = createCommandCenterSnapshot({ objectives: [], tasks: [],
            changedFiles: [{ path: `src/${'AKIA1234567890ABCDEF'}.txt`, status: 'MODIFIED' }], executionActivity: feed.listRecent() });
        const serialized = JSON.stringify(snapshot);
        expect(serialized).not.toContain('ghp_123456789012345678901234567890123456');
        expect(serialized).not.toContain('AKIA1234567890ABCDEF');
        expect(serialized).toContain('[redacted-github-token]');
        expect(serialized).toContain('[redacted-aws-key]');
    });
});
