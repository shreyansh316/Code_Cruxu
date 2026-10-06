import { createHash } from 'crypto';
import { AgentRole, TaskStatus } from '../constants';
import { createEngineeringReview, createEntityId, DomainInvariantError } from '../domain';
import { redactSecrets } from '../shared/redactSecrets';
import { createUseCase } from './useCase';

/** Persist explicitly approved cited review findings as unverified task memory. */
export function createPersistReviewFindingsUseCase({ memoryRepository, taskRepository, agentRepository, auditRepository,
    unitOfWork, authorize, idFactory } = {}) {
    if (typeof memoryRepository?.create !== 'function' || typeof taskRepository?.getById !== 'function'
        || typeof agentRepository?.getById !== 'function' || typeof auditRepository?.append !== 'function'
        || typeof unitOfWork?.run !== 'function' || typeof authorize !== 'function' || typeof idFactory !== 'function') {
        throw new TypeError('Review finding persistence requires scoped repositories, audit, transaction, authorization, and IDs.');
    }
    return createUseCase({ name: 'review-findings-persist', dependencies: { memoryRepository, taskRepository,
        agentRepository, auditRepository, unitOfWork, authorize, idFactory }, execute: ({ input, dependencies }) => {
        const taskId = createEntityId(input?.taskId, 'Review task id');
        const actorId = createEntityId(input?.actorId, 'Review actor id');
        if (!Object.values(AgentRole).includes(input?.actorRole) || input?.confirm !== true) {
            throw new DomainInvariantError('review-finding-persistence-not-confirmed', 'Saving review findings requires an explicit confirmation and persisted reviewer identity.');
        }
        const task = dependencies.taskRepository.getById(taskId);
        const actor = dependencies.agentRepository.getById(actorId);
        if (!task || task.status === TaskStatus.CANCELLED || !actor || actor.role !== input.actorRole) {
            throw new DomainInvariantError('invalid-review-finding-owner', 'Review findings require an existing task and matching reviewer identity.');
        }
        let review;
        try {
            review = createEngineeringReview({ ...input.review, evidence: input.review?.evidence });
        } catch {
            throw new DomainInvariantError('invalid-review-finding-evidence', 'Review findings must retain valid citations to their original evidence excerpts.');
        }
        if (review.findings.length === 0) return Object.freeze([]);
        let allowed = false;
        try { allowed = dependencies.authorize(Object.freeze({ actor: Object.freeze({ id: actor.id, role: actor.role }),
            task: Object.freeze({ id: task.id, projectId: task.projectId ?? null }) })) === true; }
        catch { allowed = false; }
        if (!allowed) throw new DomainInvariantError('review-finding-persistence-forbidden', 'The reviewer cannot add findings to this task memory.');
        const prepared = review.findings.map((finding) => {
            const id = createEntityId(dependencies.idFactory());
            const cited = new Set(finding.evidenceIds);
            const content = JSON.stringify({ finding, evidence: review.evidence.filter(({ id: evidenceId }) => cited.has(evidenceId))
                .map(({ id: evidenceId, type, label }) => ({ id: evidenceId, type, label })) });
            if (content.length > 4000) throw new DomainInvariantError('review-finding-too-large', 'A cited finding exceeds the task-memory content bound.');
            return { id, scope: 'TASK', taskId, title: redactSecrets(finding.title, 500), content,
                category: finding.severity, importance: finding.severity === 'CRITICAL' || finding.severity === 'HIGH' ? 3 : 2,
                verified: 0, sourceKind: 'REVIEW_FINDING', sourceReference: `review:${taskId}:${finding.id}` };
        });
        return dependencies.unitOfWork.run(() => {
            const saved = prepared.map((record) => dependencies.memoryRepository.create(record));
            for (let index = 0; index < saved.length; index += 1) {
                dependencies.auditRepository.append({ id: createEntityId(dependencies.idFactory()),
                    action: 'REVIEW_FINDING_MEMORY_CREATED', entity: 'memory', entityId: saved[index].id,
                    actorId, taskId, details: { findingId: review.findings[index].id,
                        sourceReference: saved[index].sourceReference, evidenceIds: [...review.findings[index].evidenceIds],
                        contentHash: createHash('sha256').update(saved[index].content, 'utf8').digest('hex') } });
            }
            dependencies.auditRepository.append({ id: createEntityId(dependencies.idFactory()), action: 'REVIEW_FINDINGS_STORED',
                entity: 'task', entityId: taskId, actorId, taskId,
                details: { memoryIds: saved.map(({ id }) => id), findingIds: review.findings.map(({ id }) => id), count: saved.length } });
            return Object.freeze(saved);
        });
    } });
}
