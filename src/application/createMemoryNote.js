import { AgentRole, MemoryScope } from '../constants';
import { createEntityId, DomainInvariantError } from '../domain';
import { redactSecrets } from '../shared/redactSecrets';
import { createUseCase } from './useCase';

const OWNER_COLUMNS = Object.freeze({ organizationId: 'organizationId', officeId: 'officeId', departmentId: 'departmentId',
    taskId: 'taskId', projectId: 'projectId', objectiveId: 'objectiveId', agentId: 'agentId' });
const SCOPE_OWNER = Object.freeze({ CEO: 'organizationId', DIRECTOR: 'organizationId', OFFICE: 'officeId',
    DEPARTMENT: 'departmentId', TASK: 'taskId', PROJECT: 'projectId', EMPLOYEE: 'agentId' });

/** Save an attributed user note as unverified memory; only a separate review can verify it. */
export function createMemoryNoteUseCase({ memoryRepository, auditRepository, unitOfWork, authorize, idFactory } = {}) {
    if (typeof memoryRepository?.create !== 'function' || typeof auditRepository?.append !== 'function'
        || typeof unitOfWork?.run !== 'function' || typeof authorize !== 'function' || typeof idFactory !== 'function') {
        throw new TypeError('Memory notes require memory, audit, transaction, authorization, and ID ports.');
    }
    return createUseCase({ name: 'memory-note-create', dependencies: { memoryRepository, auditRepository, unitOfWork, authorize, idFactory },
        execute: ({ input, dependencies }) => {
            const actorId = createEntityId(input?.actorId);
            const ownerId = createEntityId(input?.ownerId, 'Memory owner id');
            const scope = input?.scope;
            const ownerType = input?.ownerType ?? SCOPE_OWNER[scope];
            const ownerProperty = SCOPE_OWNER[scope] ?? ownerType;
            if (!Object.values(MemoryScope).includes(scope) || !Object.hasOwn(OWNER_COLUMNS, ownerProperty)
                || (SCOPE_OWNER[scope] && ownerType !== SCOPE_OWNER[scope])
                || (['DECISION', 'KNOWLEDGE'].includes(scope) && !input.ownerType)
                || !Object.values(AgentRole).includes(input.actorRole)
                || typeof input.title !== 'string' || !input.title.trim() || input.title.length > 500
                || typeof input.content !== 'string' || !input.content.trim() || input.content.length > 4000
                || (input.category !== undefined && input.category !== null
                    && (typeof input.category !== 'string' || input.category.length > 100))
                || !Number.isInteger(input.importance ?? 0) || (input.importance ?? 0) < 0 || (input.importance ?? 0) > 3) {
                throw new DomainInvariantError('invalid-memory-note', 'Memory note fields or ownership are invalid.');
            }
            const authorization = Object.freeze({ actor: Object.freeze({ id: actorId, role: input.actorRole }),
                scope, ownerId, ownerType: ownerProperty });
            let allowed = false;
            try { allowed = dependencies.authorize(authorization) === true; } catch { allowed = false; }
            if (!allowed) throw new DomainInvariantError('memory-note-forbidden', 'The actor cannot add a note to this memory scope.');
            const id = createEntityId(dependencies.idFactory());
            const note = { id, scope, [ownerProperty]: ownerId, title: redactSecrets(input.title.trim(), 500),
                content: redactSecrets(input.content.trim(), 4000), category: input.category?.trim() || null,
                importance: input.importance ?? 0, verified: 0, sourceKind: 'USER_NOTE',
                sourceReference: `memory-note:${id}`, agentId: scope === 'EMPLOYEE' ? ownerId : undefined,
                expiresAt: input.expiresAt ?? null };
            return dependencies.unitOfWork.run(() => {
                const saved = dependencies.memoryRepository.create(note);
                dependencies.auditRepository.append({ id: createEntityId(dependencies.idFactory()),
                    action: 'MEMORY_NOTE_CREATED', entity: 'memory', entityId: saved.id, actorId,
                    details: { scope, ownerId, sourceKind: 'USER_NOTE' } });
                return saved;
            });
        } });
}
