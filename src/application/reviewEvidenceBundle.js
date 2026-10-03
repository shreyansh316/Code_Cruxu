import { createEntityId, DomainInvariantError, validateTaskResult } from '../domain';
import { ApplicationError, createUseCase } from './useCase';

const MAX_CHECKS = 20;
const MAX_DIFF_BYTES = 2 * 1024 * 1024;
const MAX_LOG_BYTES = 4000;

/** Assemble a review bundle only from task, snapshot, Git, and verification adapter results. */
export function createReviewEvidenceBundle({ taskRepository, snapshotProvider, gitStateAdapter, verificationProvider } = {}) {
    if (typeof taskRepository?.getById !== 'function' || typeof snapshotProvider?.getByTask !== 'function'
        || typeof snapshotProvider?.compare !== 'function'
        || typeof gitStateAdapter?.getState !== 'function' || typeof verificationProvider?.getByTask !== 'function') {
        throw new TypeError('Review evidence requires task, workspace snapshot, Git, and verification evidence ports.');
    }
    return createUseCase({ name: 'review-evidence-bundle', dependencies: { taskRepository, snapshotProvider, gitStateAdapter, verificationProvider },
        execute: async ({ input, dependencies }) => {
            const taskId = createEntityId(input?.taskId);
            const task = dependencies.taskRepository.getById(taskId);
            if (!task) throw new ApplicationError('task-not-found', 'The review task does not exist.');
            if (typeof task.assigneeId !== 'string' || !task.result || !Array.isArray(task.acceptanceCriteria)) {
                throw new DomainInvariantError('review-evidence-incomplete', 'Task acceptance results are not available for review.');
            }
            const validated = validateTaskResult(task.result, task.acceptanceCriteria);
            const pair = await dependencies.snapshotProvider.getByTask(task.id);
            if (!pair || !pair.before || !pair.after) throw new DomainInvariantError('review-evidence-incomplete', 'Before and after workspace snapshots are required.');
            const changes = snapshotProvider.compare(pair.before, pair.after);
            const git = await dependencies.gitStateAdapter.getState();
            if (!git || (git.branch !== null && typeof git.branch !== 'string') || !Array.isArray(git.status)
                || typeof git.stagedDiff !== 'string' || typeof git.workingDiff !== 'string'
                || Buffer.byteLength(git.stagedDiff, 'utf8') > MAX_DIFF_BYTES || Buffer.byteLength(git.workingDiff, 'utf8') > MAX_DIFF_BYTES) {
                throw new DomainInvariantError('invalid-review-git-evidence', 'Git adapter returned malformed or oversized evidence.');
            }
            const verification = await dependencies.verificationProvider.getByTask(task.id);
            if (!Array.isArray(verification) || verification.length > MAX_CHECKS) {
                throw new DomainInvariantError('invalid-review-check-evidence', 'Captured verification results are malformed or exceed their bounds.');
            }
            const checks = verification.map(validateCheck);
            return Object.freeze({ schemaVersion: 1, taskId: task.id,
                provenance: Object.freeze({ beforeSnapshotId: pair.before.snapshotId, afterSnapshotId: pair.after.snapshotId,
                    branch: git.branch, head: validateHead(git.head) }),
                changes, git: Object.freeze({ status: Object.freeze(git.status.map(validateStatus)),
                    stagedDiff: git.stagedDiff, workingDiff: git.workingDiff }),
                checks: Object.freeze(checks), acceptance: Object.freeze({ summary: validated.result.summary,
                    criteria: Object.freeze(validated.result.acceptanceCriteria.map((entry) => Object.freeze({ ...entry }))) }) });
        },
    });
}

function validateCheck(value) {
    if (!value || typeof value.id !== 'string' || !value.id.trim()
        || !['PASSED', 'FAILED', 'ERROR', 'TIMED_OUT', 'CANCELLED'].includes(value.status)
        || (value.exitCode !== null && value.exitCode !== undefined && !Number.isInteger(value.exitCode))) {
        throw new DomainInvariantError('invalid-review-check-evidence', 'A captured verification check is malformed.');
    }
    const stdout = boundedLog(value.stdout ?? '');
    const stderr = boundedLog(value.stderr ?? '');
    return Object.freeze({ id: value.id, status: value.status, exitCode: value.exitCode ?? null,
        stdout, stderr, outputTruncated: value.outputTruncated === true });
}
function boundedLog(value) {
    if (typeof value !== 'string' || Buffer.byteLength(value, 'utf8') > MAX_LOG_BYTES) {
        throw new DomainInvariantError('invalid-review-check-evidence', 'Verification logs must be bounded text.');
    }
    return value.replace(/(api[_-]?key|authorization|bearer|token|secret)(\s*[:=]\s*)([^\s,;]+)/gi, '$1$2[REDACTED]');
}
function validateHead(value) {
    if (typeof value !== 'string' || !/^[a-f0-9]{40,64}$/i.test(value)) {
        throw new DomainInvariantError('invalid-review-git-evidence', 'Git evidence requires a real commit identifier.');
    }
    return value;
}
function validateStatus(value) {
    if (!value || typeof value.path !== 'string' || !value.path || typeof value.index !== 'string'
        || typeof value.worktree !== 'string' || typeof value.untracked !== 'boolean'
        || (value.originalPath !== undefined && typeof value.originalPath !== 'string')) {
        throw new DomainInvariantError('invalid-review-git-evidence', 'Git status evidence is malformed.');
    }
    return Object.freeze({ ...value });
}
