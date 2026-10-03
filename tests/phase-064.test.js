import { describe, expect, it } from 'vitest';
import { createReviewEvidenceBundle } from '../src/application';
import { compareWorkspaceSnapshots } from '../src/infrastructure/WorkspaceSnapshot';

const before = { snapshotId: 'snapshot-before-064', workspaceRoot: 'C:/workspace', totalBytes: 1,
    files: [{ path: 'old.js', exists: true, size: 1, sha256: 'a'.repeat(64) }] };
const after = { snapshotId: 'snapshot-after-064', workspaceRoot: 'C:/workspace', totalBytes: 1,
    files: [{ path: 'new.js', exists: true, size: 1, sha256: 'a'.repeat(64) }] };
const task = { id: 'task-064', assigneeId: 'employee-064', acceptanceCriteria: [{ id: 'criterion-064', description: 'Done', required: true, met: true }],
    result: { summary: 'Finished', acceptanceCriteria: [{ criterionId: 'criterion-064', met: true, evidence: 'Criterion satisfied' }] } };

describe('Phase 064 — review evidence bundle', () => {
    it('bundles snapshot, Git, check logs, and persisted acceptance evidence with provenance', async () => {
        const bundle = await createReviewEvidenceBundle({ taskRepository: { getById: () => task },
            snapshotProvider: { getByTask: () => ({ before, after }), compare: compareWorkspaceSnapshots },
            gitStateAdapter: { getState: () => ({ branch: 'task-branch', head: 'b'.repeat(40), status: [], stagedDiff: 'diff', workingDiff: '' }) },
            verificationProvider: { getByTask: () => [{ id: 'tests', status: 'FAILED', exitCode: 1,
                stdout: 'one assertion failed', stderr: 'api_key=secret-value', outputTruncated: false }] },
        }).run({ taskId: 'task-064' });
        expect(bundle.value.provenance).toMatchObject({ beforeSnapshotId: before.snapshotId, afterSnapshotId: after.snapshotId, head: 'b'.repeat(40) });
        expect(bundle.value.changes.renamed).toMatchObject([{ from: 'old.js', to: 'new.js' }]);
        expect(bundle.value.checks[0]).toMatchObject({ status: 'FAILED', exitCode: 1 });
        expect(bundle.value.checks[0].stderr).toBe('api_key=[REDACTED]');
        expect(bundle.value.acceptance.criteria[0].evidence).toBe('Criterion satisfied');
    });
    it('refuses missing provenance, checks, or task acceptance evidence', async () => {
        const dependencies = { taskRepository: { getById: () => task }, snapshotProvider: { getByTask: () => ({ before, after }), compare: compareWorkspaceSnapshots },
            gitStateAdapter: { getState: () => ({ branch: null, head: 'invalid', status: [], stagedDiff: '', workingDiff: '' }) },
            verificationProvider: { getByTask: () => [] } };
        const invalidGit = await createReviewEvidenceBundle(dependencies).run({ taskId: 'task-064' });
        expect(invalidGit.error.code).toBe('invalid-review-git-evidence');
        const missingTask = await createReviewEvidenceBundle({ ...dependencies, taskRepository: { getById: () => undefined } })
            .run({ taskId: 'task-064' });
        expect(missingTask.error.code).toBe('task-not-found');
    });
});
