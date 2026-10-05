/** Phase 296 — use common credential redaction for captured review logs. */
import { describe, expect, it } from 'vitest';
import { createReviewEvidenceBundle } from '../src/application';

describe('Phase 296 — review log secret filtering', () => {
    it('redacts URL userinfo and Basic credentials from captured check output', async () => {
        const criteria = [{ id: 'criterion-296', description: 'Run checks', required: true, met: true }];
        const bundle = createReviewEvidenceBundle({
            taskRepository: { getById: () => ({ id: 'task-296', assigneeId: 'agent-296', acceptanceCriteria: criteria,
                result: { summary: 'Checks completed', acceptanceCriteria: [{ criterionId: 'criterion-296',
                    met: true, evidence: 'All checks passed.' }] } }) },
            snapshotProvider: { getByTask: async () => ({ before: { snapshotId: 'before-296' }, after: { snapshotId: 'after-296' } }),
                compare: () => [] },
            gitStateAdapter: { getState: async () => ({ branch: 'main', head: 'a'.repeat(40), status: [], stagedDiff: '', workingDiff: '' }) },
            verificationProvider: { getByTask: async () => [{ id: 'test', status: 'FAILED', exitCode: 1,
                stdout: 'db postgres://review-user:review-secret@db.example/app',
                stderr: 'auth Basic dXNlcjpwYXNzd29yZA==' }] },
        });

        const result = await bundle.run({ taskId: 'task-296' });
        expect(result.ok).toBe(true);
        const serialized = JSON.stringify(result.value);
        expect(serialized).not.toMatch(/review-secret|dXNlcjpwYXNzd29yZA==/);
        expect(result.value.checks[0].stdout).toContain('review-user:[redacted]@db.example');
        expect(result.value.checks[0].stderr).toContain('Basic [redacted]');
    });
});
