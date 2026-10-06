import { retrieveScopedMemories } from '../domain/memoryRetrieval';
import { AgentRole, MemoryScope } from '../constants';
import { DomainInvariantError } from '../domain/errors';
import { assertEntityId } from '../shared/identifiers';
import { redactSecrets } from '../shared/redactSecrets';

const MAX_ITEMS = 25;
const MAX_BYTES = 64_000;
const CANDIDATE_MULTIPLIER = 4;

/** Assemble permission-approved scoped memories into a deterministic, byte-bounded AI context. */
export function assembleBoundedAgentContext({ memoryRepository, authorize } = {}, request = {}) {
    if (typeof memoryRepository?.listByOwner !== 'function' || typeof authorize !== 'function') {
        throw new TypeError('Context assembly requires an owner-scoped memory repository and authorization port.');
    }
    const { actor, scope, ownerId, ownerType, query = '', categories, sourceKinds, verifiedOnly = false, minImportance = 0,
        limit = 10, maxBytes = MAX_BYTES, now = new Date().toISOString() } = request;
    if (!actor || !Object.values(AgentRole).includes(actor.role)
        || !Object.values(MemoryScope).includes(scope)
        || (['DECISION', 'KNOWLEDGE'].includes(scope)
            ? !['organizationId', 'officeId', 'departmentId', 'taskId', 'projectId', 'objectiveId', 'agentId'].includes(ownerType)
            : ownerType !== undefined)
        || !Number.isInteger(limit) || limit < 1 || limit > MAX_ITEMS
        || !Number.isInteger(maxBytes) || maxBytes < 256 || maxBytes > MAX_BYTES) {
        throw new DomainInvariantError('invalid-agent-context-request', 'Agent context limits or actor identity are invalid.');
    }
    const actorId = assertEntityId(actor.id, 'Context actor id');
    const normalizedOwnerId = assertEntityId(ownerId, 'Context memory owner id');
    let allowed = false;
    const authorizationRequest = { actor: Object.freeze({ id: actorId, role: actor.role }), scope, ownerId: normalizedOwnerId };
    if (ownerType !== undefined) authorizationRequest.ownerType = ownerType;
    try { allowed = authorize(Object.freeze(authorizationRequest)) === true; }
    catch { allowed = false; }
    if (!allowed) throw new DomainInvariantError('agent-context-forbidden', 'The actor is not authorized to retrieve this memory scope.');

    const candidates = memoryRepository.listByOwner(scope, normalizedOwnerId,
        { limit: Math.min(100, limit * CANDIDATE_MULTIPLIER), ownerType, now })
        .map((memory) => ({ ...memory, title: redactSecrets(boundedText(memory.title, 500), 500),
            category: memory.category ? redactSecrets(memory.category.slice(0, 100), 100) : null,
            content: redactSecrets(boundedText(memory.content, 3000), 3000) }));
    const ranked = retrieveScopedMemories(candidates, { scope, ownerId: normalizedOwnerId, ownerType, query, categories, sourceKinds, verifiedOnly, minImportance,
        limit: Math.min(100, limit * CANDIDATE_MULTIPLIER) });
    const items = [];
    for (const { memory } of ranked) {
        if (items.length === limit) break;
        const item = Object.freeze({ id: memory.id, title: memory.title, category: memory.category,
            content: memory.content, verified: (memory.verified === true || memory.verified === 1)
                && memory.sourceKind !== 'LEGACY' && memory.sourceKind !== 'AI_GENERATED'
                && typeof memory.sourceReference === 'string' && !!memory.sourceReference.trim()
                && typeof memory.verifiedByAgentId === 'string' && !!memory.verifiedByAgentId.trim()
                && typeof memory.verifiedAt === 'string' && memory.verifiedAt.length === 24
                && Number.isFinite(Date.parse(memory.verifiedAt))
                && new Date(memory.verifiedAt).toISOString() === memory.verifiedAt,
            sourceKind: memory.sourceKind ?? 'LEGACY',
            sourceReference: memory.sourceReference ? redactSecrets(boundedText(memory.sourceReference, 300), 300) : null,
            verifiedByAgentId: memory.verifiedByAgentId ?? null, verifiedAt: memory.verifiedAt ?? null,
            verificationNote: memory.verificationNote ? redactSecrets(boundedText(memory.verificationNote, 500), 500) : null });
        if (byteLength({ scope, ownerId: normalizedOwnerId, items: [...items, item] }) <= maxBytes) items.push(item);
    }
    const result = { scope, ownerId: normalizedOwnerId, items: Object.freeze(items) };
    if (ownerType !== undefined) result.ownerType = ownerType;
    return Object.freeze(result);
}

function boundedText(value, limit) {
    if (typeof value !== 'string') throw new DomainInvariantError('invalid-agent-context-memory', 'A selected memory has invalid text fields.');
    return [...value].slice(0, limit).join('');
}

function byteLength(value) { return new TextEncoder().encode(JSON.stringify(value)).byteLength; }
