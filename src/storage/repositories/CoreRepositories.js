import { BaseSqliteRepository } from './BaseSqliteRepository';
import { assertEntityId } from '../../shared/identifiers';
import { normalizeTaskToolPermissions } from '../../shared/taskToolPermissions';
import { evaluateAgentLifecycleTransition } from '../../shared/agentLifecyclePolicy';
import { redactSecrets } from '../../shared/redactSecrets';
export class OrganizationRepository extends BaseSqliteRepository {
    constructor(database) {
        super(database, 'organizations', {
            id: 'id', name: 'name', createdAt: 'created_at', updatedAt: 'updated_at',
        }, { id: 'id', name: 'name' });
    }
    create(value) { return this.insert(value); }
    list() { return this.query(); }
    update(id, changes) {
        return this.updateById(id, changes);
    }
    delete(id) { return this.deleteById(id); }
}
export class OfficeRepository extends BaseSqliteRepository {
    constructor(database) {
        super(database, 'offices', {
            id: 'id', organizationId: 'organization_id', name: 'name', slug: 'slug', description: 'description',
            status: 'status', createdAt: 'created_at', updatedAt: 'updated_at',
        }, {
            id: 'id', organizationId: 'organization_id', name: 'name', slug: 'slug', description: 'description', status: 'status',
        });
    }
    create(value) { return this.insert(value); }
    list() { return this.query(); }
    listByOrganization(organizationId) { return this.query('organization_id = ?', [assertEntityId(organizationId)], 'slug, id'); }
    getBySlug(slug) {
        if (typeof slug !== 'string' || !slug.trim()) throw new TypeError('Office slug must be non-empty.');
        return this.database.prepare(`SELECT ${this.selectList()} FROM offices WHERE slug = ?`).get(slug.trim());
    }
    update(id, changes) { return this.updateById(id, changes); }
    delete(id) { return this.deleteById(id); }
}
export class DepartmentRepository extends BaseSqliteRepository {
    constructor(database) {
        super(database, 'departments', {
            id: 'id', officeId: 'office_id', name: 'name', slug: 'slug', description: 'description',
            status: 'status', createdAt: 'created_at', updatedAt: 'updated_at',
        }, {
            id: 'id', officeId: 'office_id', name: 'name', slug: 'slug', description: 'description', status: 'status',
        });
    }
    create(value) { return this.insert(value); }
    list() { return this.query(); }
    listByOffice(officeId) { return this.query('office_id = ?', [assertEntityId(officeId)], 'slug, id'); }
    update(id, changes) { return this.updateById(id, changes); }
    delete(id) { return this.deleteById(id); }
}
export class ObjectiveRepository extends BaseSqliteRepository {
    constructor(database) {
        super(database, 'objectives', {
            id: 'id', organizationId: 'organization_id', title: 'title', description: 'description', status: 'status', priority: 'priority',
            createdAt: 'created_at', updatedAt: 'updated_at',
        }, { id: 'id', organizationId: 'organization_id', title: 'title', description: 'description', status: 'status', priority: 'priority' });
    }
    create(value) { return this.insert(value); }
    list() { return this.query(); }
    listByOrganization(organizationId) {
        return this.query('organization_id = ?', [assertEntityId(organizationId)], 'status, priority DESC, title, id');
    }
    listUnassigned() { return this.query('organization_id IS NULL', [], 'status, priority DESC, title, id'); }
    listByStatus(status) { return this.query('status = ?', [status]); }
    update(id, changes) {
        const current = this.getById(id);
        if (!current) return undefined;
        if (Object.hasOwn(changes ?? {}, 'organizationId') && current.organizationId
            && changes.organizationId !== current.organizationId) {
            throw new TypeError('Objective organization ownership cannot be changed after assignment.');
        }
        return this.updateById(id, changes);
    }
    delete(id) { return this.deleteById(id); }
}
export class ProjectRepository extends BaseSqliteRepository {
    constructor(database) {
        super(database, 'projects', {
            id: 'id', name: 'name', description: 'description', status: 'status', priority: 'priority',
            objectiveId: 'objective_id', createdAt: 'created_at', updatedAt: 'updated_at',
        }, {
            id: 'id', name: 'name', description: 'description', status: 'status', priority: 'priority',
            objectiveId: 'objective_id',
        });
    }
    create(value) { return this.insert(value); }
    list() { return this.query(); }
    listByObjective(objectiveId) {
        return this.query('objective_id = ?', [objectiveId]);
    }
    listByStatus(status) { return this.query('status = ?', [status]); }
    update(id, changes) {
        return this.updateById(id, changes);
    }
    delete(id) { return this.deleteById(id); }
}
export class AgentRepository extends BaseSqliteRepository {
    constructor(database) {
        super(database, 'agents', {
            id: 'id', organizationId: 'organization_id', name: 'name', role: 'role', specialization: 'specialization', status: 'status',
            capabilities: 'capabilities_json', lifecycleStatus: 'lifecycle_status',
            managedOfficeId: 'managed_office_id', managedDepartmentId: 'managed_department_id',
            departmentId: 'department_id', createdAt: 'created_at', updatedAt: 'updated_at',
        }, {
            id: 'id', organizationId: 'organization_id', name: 'name', role: 'role', specialization: 'specialization', status: 'status',
            capabilities: 'capabilities_json',
            managedOfficeId: 'managed_office_id', managedDepartmentId: 'managed_department_id',
            departmentId: 'department_id',
        });
    }
    create(value) { return this.insert(serializeAgent(resolveAgentOrganization(this.database, value))); }
    getById(id) { return mapAgent(super.getById(id)); }
    list() { return this.query().map(mapAgent); }
    listByRole(role) { return this.query('role = ?', [role]).map(mapAgent); }
    listByOrganization(organizationId) {
        return this.query('organization_id = ?', [assertEntityId(organizationId)], 'role, name, id').map(mapAgent);
    }
    listByDepartment(departmentId) {
        return this.query('department_id = ?', [departmentId]).map(mapAgent);
    }
    update(id, changes) {
        const current = this.getById(id);
        if (!current) return undefined;
        if (Object.hasOwn(changes ?? {}, 'organizationId') && current.organizationId
            && changes.organizationId !== current.organizationId) {
            throw new TypeError('Agent organization ownership cannot be changed after assignment.');
        }
        return mapAgent(this.updateById(id, serializeAgent(resolveAgentOrganization(this.database, { ...current, ...changes }))));
    }
    transitionLifecycle(id, nextStatus) {
        const current = this.getById(id);
        if (!current) return undefined;
        const transition = evaluateAgentLifecycleTransition(current.lifecycleStatus, nextStatus);
        if (!transition.changed) return current;
        this.database.prepare("UPDATE agents SET lifecycle_status = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?")
            .run(transition.lifecycleStatus, assertEntityId(id));
        return this.getById(id);
    }
    delete(id) { return this.deleteById(id); }
}

function serializeAgent(value) {
    if (!value || !Object.hasOwn(value, 'capabilities')) return value;
    if (!Array.isArray(value.capabilities) || value.capabilities.length > 32
        || value.capabilities.some((capability) => typeof capability !== 'string' || !capability.trim() || capability.trim().length > 100)
        || new Set(value.capabilities.map((capability) => capability.trim().toLowerCase())).size !== value.capabilities.length) {
        throw new TypeError('Agent capabilities must contain at most 32 unique, non-empty labels of at most 100 characters.');
    }
    return { ...value, capabilities: JSON.stringify(value.capabilities.map((capability) => capability.trim())) };
}

function mapAgent(row) {
    if (!row || typeof row.capabilities !== 'string') return row;
    try {
        const capabilities = JSON.parse(row.capabilities);
        if (Array.isArray(capabilities) && capabilities.every((item) => typeof item === 'string')) {
            return { ...row, capabilities, lifecycleStatus: row.lifecycleStatus ?? 'ACTIVE' };
        }
    } catch {
        // Keep the persisted record readable; malformed legacy values expose no capabilities.
    }
    return { ...row, capabilities: [], lifecycleStatus: row.lifecycleStatus ?? 'ACTIVE' };
}
export class TaskRepository extends BaseSqliteRepository {
    constructor(database) {
        super(database, 'tasks', {
            id: 'id', taskCode: 'task_code', title: 'title', description: 'description', status: 'status',
            priority: 'priority', projectId: 'project_id', assigneeId: 'assignee_id', creatorId: 'creator_id',
            acceptanceCriteria: 'acceptance_criteria', result: 'result', blockerReason: 'blocker_reason',
            requiredCapabilities: 'required_capabilities_json',
            toolPermissions: 'tool_permissions_json',
            retryCount: 'retry_count', maxRetries: 'max_retries', executionRetryReason: 'execution_retry_reason', tokenBudget: 'token_budget',
            timeBudgetMs: 'time_budget_ms', startedAt: 'started_at', completedAt: 'completed_at',
            createdAt: 'created_at', updatedAt: 'updated_at',
        }, {
            id: 'id', taskCode: 'task_code', title: 'title', description: 'description', status: 'status',
            priority: 'priority', projectId: 'project_id', assigneeId: 'assignee_id', creatorId: 'creator_id',
            acceptanceCriteria: 'acceptance_criteria', result: 'result', blockerReason: 'blocker_reason',
            requiredCapabilities: 'required_capabilities_json',
            toolPermissions: 'tool_permissions_json',
            retryCount: 'retry_count', maxRetries: 'max_retries', executionRetryReason: 'execution_retry_reason', tokenBudget: 'token_budget',
            timeBudgetMs: 'time_budget_ms', startedAt: 'started_at', completedAt: 'completed_at',
        });
    }
    create(value) { return this.insert(serializeTask(value)); }
    getById(id) { return mapTask(super.getById(id)); }
    list() { return this.query().map(mapTask); }
    listByStatus(status) { return this.query('status = ?', [status]).map(mapTask); }
    listByProject(projectId) { return this.query('project_id = ?', [projectId]).map(mapTask); }
    update(id, changes) {
        return this.updateById(id, serializeTask(changes));
    }
    delete(id) { return this.deleteById(id); }
}

function serializeTask(value) {
    if (!value) return value;
    const serialized = { ...value };
    if (Object.hasOwn(value, 'executionRetryReason') && value.executionRetryReason !== null
        && (typeof value.executionRetryReason !== 'string' || !/^[a-z][a-z0-9.-]{0,63}$/.test(value.executionRetryReason))) {
        throw new TypeError('Task execution retry reasons must be null or stable error codes.');
    }
    if (Object.hasOwn(value, 'requiredCapabilities')) {
        const capabilities = value.requiredCapabilities;
        if (!Array.isArray(capabilities) || capabilities.length > 32
            || capabilities.some((capability) => typeof capability !== 'string' || !capability.trim() || capability.trim().length > 100)
            || new Set(capabilities.map((capability) => capability.trim().toLocaleLowerCase('en-US'))).size !== capabilities.length) {
            throw new TypeError('Task required capabilities must contain at most 32 unique, non-empty labels of at most 100 characters.');
        }
    }
    if (Object.hasOwn(value, 'toolPermissions')) {
        const permissions = normalizeTaskToolPermissions(value.toolPermissions);
        serialized.toolPermissions = permissions === null ? null : JSON.stringify(permissions);
    }
    for (const field of ['acceptanceCriteria', 'result', 'requiredCapabilities']) {
        if (Object.hasOwn(value, field) && value[field] != null && typeof value[field] !== 'string') {
            serialized[field] = JSON.stringify(value[field]);
        }
    }
    return serialized;
}

function mapTask(row) {
    if (!row) return row;
    const mapped = { ...row };
    for (const field of ['acceptanceCriteria', 'result', 'requiredCapabilities', 'toolPermissions']) {
        if (typeof row[field] !== 'string') continue;
        if (field === 'toolPermissions') {
            try { mapped[field] = normalizeTaskToolPermissions(JSON.parse(row[field])); }
            catch { throw new TypeError('Persisted task tool permissions are malformed; execution must fail closed.'); }
            continue;
        }
        try {
            mapped[field] = JSON.parse(row[field]);
        }
        catch {
            // Preserve legacy or malformed text values rather than hiding data.
        }
    }
    return mapped;
}

function resolveAgentOrganization(database, agent) {
    let linkedOrganizationId;
    if (agent?.role === 'HEAD_MANAGER' && agent.managedOfficeId) {
        linkedOrganizationId = database.prepare('SELECT organization_id FROM offices WHERE id = ?').get(agent.managedOfficeId)?.organization_id;
    }
    else if (agent?.role === 'DEPT_MANAGER' && agent.managedDepartmentId) {
        linkedOrganizationId = database.prepare(`SELECT offices.organization_id FROM departments
            JOIN offices ON offices.id = departments.office_id WHERE departments.id = ?`).get(agent.managedDepartmentId)?.organization_id;
    }
    else if (agent?.role === 'EMPLOYEE' && agent.departmentId) {
        linkedOrganizationId = database.prepare(`SELECT offices.organization_id FROM departments
            JOIN offices ON offices.id = departments.office_id WHERE departments.id = ?`).get(agent.departmentId)?.organization_id;
    }
    if (linkedOrganizationId && agent.organizationId && linkedOrganizationId !== agent.organizationId) {
        throw new TypeError('Agent organization ownership must match its persisted office or department.');
    }
    return linkedOrganizationId ? { ...agent, organizationId: linkedOrganizationId } : agent;
}

const MEMORY_SCOPE_OWNERS = {
    CEO: 'organizationId',
    DIRECTOR: 'organizationId',
    OFFICE: 'officeId',
    DEPARTMENT: 'departmentId',
    TASK: 'taskId',
    PROJECT: 'projectId',
    EMPLOYEE: 'agentId',
};
const MEMORY_OWNER_COLUMNS = {
    organizationId: 'organization_id', officeId: 'office_id', departmentId: 'department_id',
    taskId: 'task_id', projectId: 'project_id', objectiveId: 'objective_id', agentId: 'agent_id',
};
export class MemoryRepository extends BaseSqliteRepository {
    constructor(database) {
        super(database, 'memories', {
            id: 'id', scope: 'scope', category: 'category', title: 'title', content: 'content',
            importance: 'importance', verified: 'verified', organizationId: 'organization_id',
            officeId: 'office_id', departmentId: 'department_id', taskId: 'task_id', projectId: 'project_id',
            objectiveId: 'objective_id', agentId: 'agent_id', createdAt: 'created_at', updatedAt: 'updated_at', expiresAt: 'expires_at',
            invalidatedAt: 'invalidated_at', sourceKind: 'source_kind', sourceReference: 'source_reference',
            verifiedByAgentId: 'verified_by_agent_id', verifiedAt: 'verified_at', verificationNote: 'verification_note',
        }, {
            id: 'id', scope: 'scope', category: 'category', title: 'title', content: 'content',
            importance: 'importance', verified: 'verified', organizationId: 'organization_id',
            officeId: 'office_id', departmentId: 'department_id', taskId: 'task_id', projectId: 'project_id',
            objectiveId: 'objective_id', agentId: 'agent_id', expiresAt: 'expires_at',
            sourceKind: 'source_kind', sourceReference: 'source_reference', verifiedByAgentId: 'verified_by_agent_id',
            verifiedAt: 'verified_at', verificationNote: 'verification_note',
        });
    }
    create(value) {
        assertMemoryOwnership(value);
        assertExpiration(value.expiresAt);
        assertMemoryProvenance(value);
        const provenance = normalizeMemoryProvenance(value);
        return this.insert({ ...value, ...provenance, expiresAt: value.expiresAt ?? null });
    }
    list({ now = new Date().toISOString() } = {}) {
        assertExpiration(now, 'Memory query time');
        return this.query('invalidated_at IS NULL AND (expires_at IS NULL OR expires_at > ?)', [now], 'created_at, id');
    }
    listByScope(scope, { now = new Date().toISOString() } = {}) {
        assertMemoryScope(scope);
        assertExpiration(now, 'Memory query time');
        return this.query('scope = ? AND invalidated_at IS NULL AND (expires_at IS NULL OR expires_at > ?)', [scope, now], 'created_at, id');
    }
    getById(id, { now = new Date().toISOString() } = {}) {
        assertExpiration(now, 'Memory query time');
        return this.database.prepare(`SELECT ${this.selectList()} FROM memories WHERE id = ?
          AND invalidated_at IS NULL AND (expires_at IS NULL OR expires_at > ?)`).get(assertEntityId(id), now);
    }
    readInsertResult(id) { return super.getById(id); }
    listByOwner(scope, ownerId, { limit = 100, ownerType, now = new Date().toISOString() } = {}) {
        assertMemoryScope(scope);
        if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
            throw new TypeError('Memory owner query limit must be between 1 and 100.');
        }
        const property = MEMORY_SCOPE_OWNERS[scope];
        const ownerProperty = property ?? assertTypedMemoryOwner(scope, ownerType);
        assertExpiration(now, 'Memory query time');
        return this.query(`scope = ? AND ${MEMORY_OWNER_COLUMNS[ownerProperty]} = ? AND invalidated_at IS NULL AND (expires_at IS NULL OR expires_at > ?)`,
            [scope, assertEntityId(ownerId), now], 'created_at, id', limit);
    }
    getByOwner(scope, ownerId, memoryId, { ownerType, now = new Date().toISOString() } = {}) {
        assertMemoryScope(scope);
        ownerId = assertEntityId(ownerId);
        memoryId = assertEntityId(memoryId, 'Memory id');
        const property = MEMORY_SCOPE_OWNERS[scope] ?? assertTypedMemoryOwner(scope, ownerType);
        assertExpiration(now, 'Memory query time');
        return this.database.prepare(`SELECT ${this.selectList()} FROM memories WHERE id = ? AND scope = ?
          AND ${MEMORY_OWNER_COLUMNS[property]} = ? AND invalidated_at IS NULL AND (expires_at IS NULL OR expires_at > ?)`)
            .get(memoryId, scope, ownerId, now);
    }
    deleteByOwner(scope, ownerId, memoryId, { ownerType } = {}) {
        assertMemoryScope(scope);
        ownerId = assertEntityId(ownerId);
        memoryId = assertEntityId(memoryId, 'Memory id');
        const property = MEMORY_SCOPE_OWNERS[scope] ?? assertTypedMemoryOwner(scope, ownerType);
        return this.database.prepare(`DELETE FROM memories WHERE id = ? AND scope = ? AND ${MEMORY_OWNER_COLUMNS[property]} = ?`)
            .run(memoryId, scope, ownerId).changes > 0;
    }
    invalidateByOwner(scope, ownerId, memoryId, { ownerType, invalidatedAt = new Date().toISOString() } = {}) {
        assertMemoryScope(scope);
        ownerId = assertEntityId(ownerId);
        memoryId = assertEntityId(memoryId, 'Memory id');
        const property = MEMORY_SCOPE_OWNERS[scope] ?? assertTypedMemoryOwner(scope, ownerType);
        assertExpiration(invalidatedAt, 'Memory invalidation time');
        return this.database.prepare(`UPDATE memories SET invalidated_at = ?,
          updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
          WHERE id = ? AND scope = ? AND ${MEMORY_OWNER_COLUMNS[property]} = ? AND invalidated_at IS NULL`)
            .run(invalidatedAt, memoryId, scope, ownerId).changes > 0;
    }
    update(id, changes) {
        assertExpiration(changes?.expiresAt);
        const current = this.getById(id);
        if (!current) return undefined;
        for (const property of ['scope', ...Object.keys(MEMORY_OWNER_COLUMNS)]) {
            if (Object.hasOwn(changes ?? {}, property) && changes[property] !== current[property]) {
                throw new TypeError('Memory ownership cannot be changed after creation.');
            }
        }
        if (changes?.verified === true || changes?.verified === 1) assertMemoryProvenance({ ...current, ...changes });
        return this.updateById(id, changes);
    }
    delete(id) { return this.deleteById(id); }
    deleteExpired({ now = new Date().toISOString(), limit = 250 } = {}) {
        assertExpiration(now, 'Memory cleanup time');
        if (!Number.isInteger(limit) || limit < 1 || limit > 1000) throw new TypeError('Expired memory cleanup batch size must be between 1 and 1000.');
        return this.database.prepare(`DELETE FROM memories WHERE rowid IN (
          SELECT rowid FROM memories WHERE expires_at IS NOT NULL AND expires_at <= ? ORDER BY expires_at, id LIMIT ?
        )`).run(now, limit).changes;
    }
}

const MEMORY_SOURCE_KINDS = new Set(['LEGACY', 'USER_NOTE', 'OBSERVATION', 'TASK_RESULT', 'REVIEW_FINDING', 'DECISION_RECORD', 'TEST_RESULT', 'AI_GENERATED']);
function normalizeMemoryProvenance(value) {
    return {
        sourceKind: value.sourceKind ?? 'LEGACY',
        sourceReference: optionalRedactedText(value.sourceReference, 300, 'Memory source reference'),
        verifiedByAgentId: value.verifiedByAgentId == null ? null : assertEntityId(value.verifiedByAgentId, 'Memory verifier id'),
        verifiedAt: value.verifiedAt ?? null,
        verificationNote: optionalRedactedText(value.verificationNote, 500, 'Memory verification note'),
    };
}
function optionalRedactedText(value, maxLength, label) {
    if (value == null) return null;
    if (typeof value !== 'string' || !value.trim() || value.length > maxLength) {
        throw new TypeError(`${label} must be non-empty text up to ${maxLength} characters.`);
    }
    return redactSecrets(value.trim(), maxLength);
}
function assertMemoryProvenance(value) {
    if (value.sourceKind !== undefined && !MEMORY_SOURCE_KINDS.has(value.sourceKind)) {
        throw new TypeError('Memory source kind is unsupported.');
    }
    if (value.verified === true || value.verified === 1) {
        const timestamp = value.verifiedAt;
        if (!value.sourceKind || value.sourceKind === 'LEGACY' || value.sourceKind === 'AI_GENERATED'
            || typeof value.sourceReference !== 'string' || !value.sourceReference.trim() || value.sourceReference.length > 300
            || typeof value.verifiedByAgentId !== 'string' || !value.verifiedByAgentId.trim()
            || typeof timestamp !== 'string' || timestamp.length !== 24
            || !Number.isFinite(Date.parse(timestamp)) || new Date(timestamp).toISOString() !== timestamp) {
            throw new TypeError('Verified memory requires a non-AI source reference and verifier attribution.');
        }
        assertEntityId(value.verifiedByAgentId, 'Memory verifier id');
        if (value.verificationNote != null && (typeof value.verificationNote !== 'string' || value.verificationNote.length > 500)) {
            throw new TypeError('Memory verification note exceeds its bound.');
        }
    }
}

function assertExpiration(value, field = 'Memory expiration') {
    if (value === undefined || value === null) return;
    if (typeof value !== 'string' || value.length !== 24 || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) {
        throw new TypeError(`${field} must be a canonical UTC timestamp.`);
    }
}

function assertTypedMemoryOwner(scope, ownerType) {
    if (!['DECISION', 'KNOWLEDGE'].includes(scope) || !Object.hasOwn(MEMORY_OWNER_COLUMNS, ownerType)) {
        throw new TypeError(`Memory scope ${scope} requires an explicit owner type.`);
    }
    return ownerType;
}

function assertMemoryScope(scope) {
    if (!['CEO', 'DIRECTOR', 'OFFICE', 'DEPARTMENT', 'TASK', 'PROJECT', 'EMPLOYEE', 'DECISION', 'KNOWLEDGE'].includes(scope)) {
        throw new Error(`Unsupported memory scope ${String(scope)}.`);
    }
}

function assertMemoryOwnership(value) {
    assertMemoryScope(value?.scope);
    const ownerProperties = Object.keys(MEMORY_OWNER_COLUMNS);
    const owners = ownerProperties.filter((property) => value[property] !== undefined && value[property] !== null);
    const expectedOwner = MEMORY_SCOPE_OWNERS[value.scope];
    if ((expectedOwner && (owners.length !== 1 || owners[0] !== expectedOwner))
        || (!expectedOwner && owners.length !== 1)) {
        throw new Error(`Memory scope ${value.scope} must have exactly its matching owner link.`);
    }
}

export class DirectorQuestionRepository extends BaseSqliteRepository {
    constructor(database) {
        super(database, 'director_questions', {
            id: 'id', objectiveId: 'objective_id', question: 'question', answer: 'answer', status: 'status',
            category: 'category', sortOrder: 'sort_order', createdAt: 'created_at', updatedAt: 'updated_at',
        }, {
            id: 'id', objectiveId: 'objective_id', question: 'question', answer: 'answer', status: 'status',
            category: 'category', sortOrder: 'sort_order',
        });
    }
    create(value) { return this.insert(value); }
    list() { return this.query(); }
    listByObjective(objectiveId) {
        return this.query('objective_id = ?', [objectiveId], 'sort_order, created_at, id');
    }
    nextSortOrder(objectiveId) {
        objectiveId = assertEntityId(objectiveId, 'Question objective id');
        return this.database.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM director_questions WHERE objective_id = ?')
            .get(objectiveId).next_order;
    }
    listByStatus(status) {
        return this.query('status = ?', [status]);
    }
    update(id, changes) {
        return this.updateById(id, changes);
    }
    delete(id) { return this.deleteById(id); }
}
