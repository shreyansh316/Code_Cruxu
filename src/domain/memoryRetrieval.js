import { MemoryScope } from '../constants';
import { DomainInvariantError } from './errors';

const MAX_RETRIEVAL_LIMIT = 100;
const MEMORY_SOURCE_KINDS = ['LEGACY', 'USER_NOTE', 'OBSERVATION', 'TASK_RESULT', 'REVIEW_FINDING', 'DECISION_RECORD', 'TEST_RESULT', 'AI_GENERATED'];
const OWNER_PROPERTY = {
    [MemoryScope.CEO]: 'organizationId',
    [MemoryScope.DIRECTOR]: 'organizationId',
    [MemoryScope.OFFICE]: 'officeId',
    [MemoryScope.DEPARTMENT]: 'departmentId',
    [MemoryScope.TASK]: 'taskId',
    [MemoryScope.PROJECT]: 'projectId',
    [MemoryScope.EMPLOYEE]: 'agentId',
};
const OWNER_PROPERTIES = ['organizationId', 'officeId', 'departmentId', 'taskId', 'projectId', 'objectiveId', 'agentId'];

/** Filter by exact scope/owner, then rank from explicit metadata and text matches. */
export function retrieveScopedMemories(memories, {
    scope, ownerId, ownerType, query = '', categories, sourceKinds, verifiedOnly = false, minImportance = 0, limit = 10,
} = {}) {
    if (!Array.isArray(memories) || !Object.values(MemoryScope).includes(scope)
        || typeof ownerId !== 'string' || ownerId.trim() === ''
        || (['DECISION', 'KNOWLEDGE'].includes(scope)
            ? !OWNER_PROPERTIES.includes(ownerType)
            : ownerType !== undefined)
        || typeof query !== 'string' || query.length > 500
        || (categories !== undefined && (!Array.isArray(categories)
            || categories.some((category) => typeof category !== 'string' || category.trim() === '')))
        || (sourceKinds !== undefined && (!Array.isArray(sourceKinds) || sourceKinds.length < 1 || sourceKinds.length > MEMORY_SOURCE_KINDS.length
            || sourceKinds.some((kind) => !MEMORY_SOURCE_KINDS.includes(kind)) || new Set(sourceKinds).size !== sourceKinds.length))
        || typeof verifiedOnly !== 'boolean' || !Number.isInteger(minImportance) || minImportance < 0 || minImportance > 3
        || !Number.isInteger(limit) || limit < 1 || limit > MAX_RETRIEVAL_LIMIT) {
        throw new DomainInvariantError('invalid-memory-retrieval-query', 'Memory retrieval constraints are invalid or exceed their limits.');
    }

    const terms = [...new Set(query.toLowerCase().match(/[\p{L}\p{N}_-]+/gu) ?? [])].slice(0, 20);
    const categorySet = categories ? new Set(categories) : null;
    const sourceKindSet = sourceKinds ? new Set(sourceKinds) : null;
    const candidates = memories.filter((memory) => belongsToOwner(memory, scope, ownerId, ownerType));
    if (candidates.some((memory) => typeof memory.title !== 'string' || typeof memory.content !== 'string'
        || (memory.category !== null && memory.category !== undefined && typeof memory.category !== 'string')
        || !Number.isInteger(memory.importance) || memory.importance < 0 || memory.importance > 3
        || ![undefined, null, true, false, 0, 1].includes(memory.verified))) {
        throw new DomainInvariantError('invalid-memory-retrieval-record', 'Owned memories contain invalid searchable metadata.');
    }
    return candidates
        .filter((memory) => !categorySet || categorySet.has(memory.category))
        .filter((memory) => !sourceKindSet || sourceKindSet.has(memory.sourceKind ?? 'LEGACY'))
        .filter((memory) => !verifiedOnly || isVerified(memory))
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
    return (memory.verified === true || memory.verified === 1)
        && typeof memory.sourceKind === 'string'
        && !['LEGACY', 'AI_GENERATED'].includes(memory.sourceKind)
        && typeof memory.sourceReference === 'string' && memory.sourceReference.trim() !== ''
        && typeof memory.verifiedByAgentId === 'string' && memory.verifiedByAgentId.trim() !== ''
        && typeof memory.verifiedAt === 'string' && memory.verifiedAt.length === 24
        && Number.isFinite(Date.parse(memory.verifiedAt)) && new Date(memory.verifiedAt).toISOString() === memory.verifiedAt;
}

function compareIds(left, right) {
    return left < right ? -1 : left > right ? 1 : 0;
}
