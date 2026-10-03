import { retrieveScopedMemories } from '../domain/memoryRetrieval';
import { AgentRole, MemoryScope } from '../constants';
import { DomainInvariantError } from '../domain/errors';
import { assertEntityId } from '../shared/identifiers';

const MAX_ITEMS = 25;
const MAX_BYTES = 64_000;
const CANDIDATE_MULTIPLIER = 4;

/** Assemble permission-approved scoped memories into a deterministic, byte-bounded AI context. */
export function assembleBoundedAgentContext({ memoryRepository, authorize } = {}, request = {}) {
    if (typeof memoryRepository?.listByOwner !== 'function' || typeof authorize !== 'function') {
        throw new TypeError('Context assembly requires an owner-scoped memory repository and authorization port.');
    }
    const { actor, scope, ownerId, query = '', categories, verifiedOnly = false, minImportance = 0,
        limit = 10, maxBytes = MAX_BYTES } = request;
    if (!actor || !Object.values(AgentRole).includes(actor.role)
        || !Object.values(MemoryScope).includes(scope)
        || !Number.isInteger(limit) || limit < 1 || limit > MAX_ITEMS
        || !Number.isInteger(maxBytes) || maxBytes < 256 || maxBytes > MAX_BYTES) {
        throw new DomainInvariantError('invalid-agent-context-request', 'Agent context limits or actor identity are invalid.');
    }
    const actorId = assertEntityId(actor.id, 'Context actor id');
    const normalizedOwnerId = assertEntityId(ownerId, 'Context memory owner id');
    let allowed = false;
    try { allowed = authorize(Object.freeze({ actor: Object.freeze({ id: actorId, role: actor.role }), scope, ownerId: normalizedOwnerId })) === true; }
    catch { allowed = false; }
    if (!allowed) throw new DomainInvariantError('agent-context-forbidden', 'The actor is not authorized to retrieve this memory scope.');

    const candidates = memoryRepository.listByOwner(scope, normalizedOwnerId, { limit: Math.min(100, limit * CANDIDATE_MULTIPLIER) })
        .map((memory) => ({ ...memory, title: boundedText(memory.title, 500), category: memory.category?.slice(0, 100) ?? null,
            content: boundedText(memory.content, 3000) }));
    const ranked = retrieveScopedMemories(candidates, { scope, ownerId: normalizedOwnerId, query, categories, verifiedOnly, minImportance,
        limit: Math.min(100, limit * CANDIDATE_MULTIPLIER) });
    const items = [];
    for (const { memory } of ranked) {
        if (items.length === limit) break;
        const item = Object.freeze({ id: memory.id, title: memory.title, category: memory.category,
            content: memory.content, verified: memory.verified === true || memory.verified === 1 });
        if (byteLength({ scope, ownerId: normalizedOwnerId, items: [...items, item] }) <= maxBytes) items.push(item);
    }
    return Object.freeze({ scope, ownerId: normalizedOwnerId, items: Object.freeze(items) });
}

function boundedText(value, limit) {
    if (typeof value !== 'string') throw new DomainInvariantError('invalid-agent-context-memory', 'A selected memory has invalid text fields.');
    return [...value].slice(0, limit).join('');
}

function byteLength(value) { return new TextEncoder().encode(JSON.stringify(value)).byteLength; }
