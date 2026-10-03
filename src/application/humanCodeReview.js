import { createHash } from 'node:crypto';
import { AgentRole, TaskStatus } from '../constants';
import { createEntityId, DomainInvariantError } from '../domain';
import { ApplicationError, createUseCase } from './useCase';

/** Persist an explicit human decision over one immutable evidence bundle. */
export function createHumanCodeReviewDecision({ agentRepository, taskRepository, auditRepository,
    unitOfWork, clock, idFactory } = {}) {
    if (typeof agentRepository?.getById !== 'function' || typeof taskRepository?.getById !== 'function'
        || typeof auditRepository?.append !== 'function' || typeof auditRepository?.hasTaskReviewDecision !== 'function'
        || typeof unitOfWork?.run !== 'function' || typeof clock?.now !== 'function' || typeof idFactory !== 'function') {
        throw new TypeError('Code review requires persisted identity, task, audit, transaction, clock, and ID ports.');
    }
    return createUseCase({ name: 'human-code-review-decision', dependencies: { agentRepository, taskRepository, auditRepository, unitOfWork, clock, idFactory },
        execute: ({ input, dependencies }) => {
            const reviewer = dependencies.agentRepository.getById(input?.reviewerId);
            if (!reviewer || reviewer.role !== AgentRole.CEO) throw new ApplicationError('code-review-forbidden', 'Only the persisted CEO may record the human code review decision.');
            const taskId = createEntityId(input.taskId);
            const task = dependencies.taskRepository.getById(taskId);
            if (!task) throw new ApplicationError('task-not-found', 'The reviewed task does not exist.');
            if (task.status !== TaskStatus.REVIEW) throw new DomainInvariantError('invalid-code-review-state', 'Code changes can be decided only while the task is in review.');
            const bundle = input.bundle;
            if (!bundle || bundle.schemaVersion !== 1 || bundle.taskId !== taskId
                || typeof bundle.provenance?.head !== 'string' || !/^[a-f0-9]{40,64}$/i.test(bundle.provenance.head)
                || typeof bundle.provenance?.beforeSnapshotId !== 'string' || typeof bundle.provenance?.afterSnapshotId !== 'string') {
                throw new DomainInvariantError('invalid-review-evidence', 'A matching, provenance-bearing review evidence bundle is required.');
            }
            const persistedAcceptance = { summary: task.result.summary, criteria: task.result.acceptanceCriteria };
            if (JSON.stringify(bundle.acceptance) !== JSON.stringify(persistedAcceptance)) {
                throw new DomainInvariantError('stale-review-evidence', 'Review acceptance evidence does not match the persisted task result.');
            }
            if (!['APPROVE', 'REQUEST_CHANGES'].includes(input.decision)) throw new DomainInvariantError('invalid-code-review-decision', 'Choose Approve or Request Changes.');
            const evidenceHash = createHash('sha256').update(JSON.stringify(bundle)).digest('hex');
            return dependencies.unitOfWork.run(() => {
                if (dependencies.auditRepository.hasTaskReviewDecision(task.id, evidenceHash)) {
                    throw new DomainInvariantError('code-review-already-decided', 'This exact evidence bundle already has a human decision.');
                }
                const time = dependencies.clock.now();
                const decidedAt = (time instanceof Date ? time : new Date(time)).toISOString();
                const action = input.decision === 'APPROVE' ? 'CODE_CHANGES_APPROVED' : 'CODE_CHANGES_REJECTED';
                const audit = dependencies.auditRepository.append({ id: createEntityId(dependencies.idFactory()), action,
                    entity: 'task-change-review', entityId: task.id, taskId: task.id, actorId: reviewer.id,
                    details: { evidenceHash, head: bundle.provenance.head, decision: input.decision } });
                return Object.freeze({ taskId: task.id, reviewerId: reviewer.id, decision: input.decision,
                    evidenceHash, head: bundle.provenance.head, decidedAt, auditId: audit.id,
                    authorizedForThisEvidence: input.decision === 'APPROVE' });
            });
        },
    });
}
