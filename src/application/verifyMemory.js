import { createHash } from 'crypto';
import { AgentRole } from '../constants';
import { createEntityId, DomainInvariantError } from '../domain';
import { redactSecrets } from '../shared/redactSecrets';
import { createUseCase } from './useCase';

/** Verify eligible evidence with an independently authorized reviewer and append-only attribution. */
export function createMemoryVerificationUseCase({ memoryRepository, auditRepository, unitOfWork, authorize,
    clock = { now: () => new Date().toISOString() }, idFactory } = {}) {
    if (typeof memoryRepository?.getById !== 'function' || typeof memoryRepository?.update !== 'function'
        || typeof auditRepository?.append !== 'function' || typeof auditRepository?.listByEntity !== 'function'
        || typeof unitOfWork?.run !== 'function' || typeof authorize !== 'function' || typeof clock?.now !== 'function'
        || typeof idFactory !== 'function') {
        throw new TypeError('Memory verification requires persistence, audit, transaction, authorization, clock, and ID ports.');
    }
    return createUseCase({ name: 'memory-verification', dependencies: { memoryRepository, auditRepository,
        unitOfWork, authorize, clock, idFactory }, execute: ({ input, dependencies }) => {
        const actorId = createEntityId(input?.actorId);
        const memoryId = createEntityId(input?.memoryId, 'Memory id');
        const actorRole = input?.actorRole;
        const memory = dependencies.memoryRepository.getById(memoryId);
        if (!memory || memory.verified === 1 || memory.verified === true || memory.sourceKind === 'AI_GENERATED'
            || memory.sourceKind === 'LEGACY' || typeof memory.sourceReference !== 'string' || !memory.sourceReference.trim()
            || !Object.values(AgentRole).includes(actorRole)
            || typeof input.note !== 'string' || !input.note.trim() || input.note.length > 500) {
            throw new DomainInvariantError('invalid-memory-verification', 'Memory is not eligible for verification or the review note is invalid.');
        }
        const creation = dependencies.auditRepository.listByEntity('memory', memoryId, { limit: 100 })
            .find((entry) => ['MEMORY_NOTE_CREATED', 'REVIEW_FINDING_MEMORY_CREATED'].includes(entry.action));
        if (['USER_NOTE', 'REVIEW_FINDING'].includes(memory.sourceKind) && !creation) {
            throw new DomainInvariantError('memory-source-attribution-missing', 'A user note or review finding requires its original creation audit before verification.');
        }
        if (memory.sourceKind === 'REVIEW_FINDING' && !matchesReviewFindingSource(memory, creation)) {
            throw new DomainInvariantError('memory-review-source-invalid', 'A review finding requires matching stored finding and evidence attribution.');
        }
        if (creation?.actorId === actorId) {
            throw new DomainInvariantError('memory-self-verification-forbidden', 'A user-authored memory note requires a different reviewer.');
        }
        let allowed = false;
        try { allowed = dependencies.authorize(Object.freeze({ actor: Object.freeze({ id: actorId, role: actorRole }),
            memory: Object.freeze({ id: memory.id, scope: memory.scope, ownerId: memoryOwner(memory), sourceKind: memory.sourceKind }) })) === true; }
        catch { allowed = false; }
        if (!allowed) throw new DomainInvariantError('memory-verification-forbidden', 'The actor cannot verify this memory.');
        const verifiedAt = dependencies.clock.now();
        const note = redactSecrets(input.note.trim(), 500);
        return dependencies.unitOfWork.run(() => {
            const verified = dependencies.memoryRepository.update(memoryId, { verified: 1,
                verifiedByAgentId: actorId, verifiedAt, verificationNote: note });
            if (!verified || verified.verified !== 1) throw new DomainInvariantError('memory-verification-failed', 'Memory verification did not persist.');
            dependencies.auditRepository.append({ id: createEntityId(dependencies.idFactory()), action: 'MEMORY_VERIFIED',
                entity: 'memory', entityId: memoryId, actorId,
                details: { sourceKind: memory.sourceKind, sourceReference: memory.sourceReference, verifiedAt } });
            return verified;
        });
    } });
}

function memoryOwner(memory) {
    for (const field of ['organizationId', 'officeId', 'departmentId', 'taskId', 'projectId', 'objectiveId', 'agentId']) {
        if (memory[field] != null) return memory[field];
    }
    return null;
}

function matchesReviewFindingSource(memory, creation) {
    if (creation?.details?.sourceReference !== memory.sourceReference
        || !Array.isArray(creation.details.evidenceIds) || typeof creation.details.findingId !== 'string'
        || typeof creation.details.contentHash !== 'string'
        || createHash('sha256').update(memory.content, 'utf8').digest('hex') !== creation.details.contentHash) return false;
    try {
        const stored = JSON.parse(memory.content);
        const finding = stored?.finding;
        const evidenceIds = finding?.evidenceIds;
        return finding?.id === creation.details.findingId && Array.isArray(evidenceIds)
            && evidenceIds.length === creation.details.evidenceIds.length
            && evidenceIds.every((id, index) => id === creation.details.evidenceIds[index])
            && Array.isArray(stored.evidence)
            && evidenceIds.every((id) => stored.evidence.some((item) => item?.id === id));
    } catch { return false; }
}
