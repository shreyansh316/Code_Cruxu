import { MemoryScope } from '../constants';
import { DomainInvariantError } from './errors';

const MAX_RETRIEVAL_LIMIT = 100;
const OWNER_PROPERTY = {
    [MemoryScope.CEO]: 'organizationId',
    [MemoryScope.DIRECTOR]: 'organizationId',
    [MemoryScope.OFFICE]: 'officeId',
    [MemoryScope.DEPARTMENT]: 'departmentId',
    [MemoryScope.TASK]: 'taskId',
    [MemoryScope.PROJECT]: 'projectId',
};
const OWNER_PROPERTIES = ['organizationId', 'officeId', 'departmentId', 'taskId', 'projectId', 'objectiveId'];

/** Filter by exact scope/owner, then rank from explicit metadata and text matches. */
export function retrieveScopedMemories(memories, {
    scope, ownerId, ownerType, query = '', categories, verifiedOnly = false, minImportance = 0, limit = 10,
} = {}) {
    if (!Array.isArray(memories) || !Object.values(MemoryScope).includes(scope)
        || typeof ownerId !== 'string' || ownerId.trim() === ''
        || (['DECISION', 'KNOWLEDGE'].includes(scope)
            ? !OWNER_PROPERTIES.includes(ownerType)
            : ownerType !== undefined)
        || typeof query !== 'string' || query.length > 500
        || (categories !== undefined && (!Array.isArray(categories)
            || categories.some((category) => typeof category !== 'string' || category.trim() === '')))
        || typeof verifiedOnly !== 'boolean' || !Number.isInteger(minImportance) || minImportance < 0 || minImportance > 3
        || !Number.isInteger(limit) || limit < 1 || limit > MAX_RETRIEVAL_LIMIT) {
        throw new DomainInvariantError('invalid-memory-retrieval-query', 'Memory retrieval constraints are invalid or exceed their limits.');
    }

    const terms = [...new Set(query.toLowerCase().match(/[\p{L}\p{N}_-]+/gu) ?? [])].slice(0, 20);
    const categorySet = categories ? new Set(categories) : null;
    const candidates = memories.filter((memory) => belongsToOwner(memory, scope, ownerId, ownerType));
    if (candidates.some((memory) => typeof memory.title !== 'string' || typeof memory.content !== 'string'
        || (memory.category !== null && memory.category !== undefined && typeof memory.category !== 'string')
        || !Number.isInteger(memory.importance) || memory.importance < 0 || memory.importance > 3
        || ![undefined, null, true, false, 0, 1].includes(memory.verified))) {
        throw new DomainInvariantError('invalid-memory-retrieval-record', 'Owned memories contain invalid searchable metadata.');
    }
    return candidates
        .filter((memory) => !categorySet || categorySet.has(memory.category))
        .filter((memory) => !verifiedOnly || memory.verified === true || memory.verified === 1)
        .filter((memory) => Number.isInteger(memory.importance) && memory.importance >= minImportance && memory.importance <= 3)
        .map((memory) => ({ memory, score: scoreMemory(memory, terms) }))
        .sort((left, right) => right.score - left.score
            || right.memory.importance - left.memory.importance
            || Number(isVerified(right.memory)) - Number(isVerified(left.memory))
            || compareIds(left.memory.id, right.memory.id))
        .slice(0, limit);
}

function belongsToOwner(memory, scope, ownerId, ownerType) {
    if (!memory || memory.scope !== scope || typeof memory.id !== 'string') return false;
    const expectedProperty = OWNER_PROPERTY[scope];
    if (expectedProperty) {
        return memory[expectedProperty] === ownerId
            && OWNER_PROPERTIES.every((property) => property === expectedProperty
                || memory[property] === undefined || memory[property] === null);
    }
    return memory[ownerType] === ownerId
        && OWNER_PROPERTIES.every((property) => property === ownerType
            || memory[property] === undefined || memory[property] === null);
}

function scoreMemory(memory, terms) {
    const title = memory.title.toLowerCase();
    const category = (memory.category ?? '').toLowerCase();
    const content = memory.content.toLowerCase();
    return terms.reduce((score, term) => score
        + (title.includes(term) ? 3 : 0)
        + (category.includes(term) ? 2 : 0)
        + (content.includes(term) ? 1 : 0), 0);
}

function isVerified(memory) {
    return memory.verified === true || memory.verified === 1;
}

function compareIds(left, right) {
    return left < right ? -1 : left > right ? 1 : 0;
}
