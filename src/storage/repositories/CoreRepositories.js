import { BaseSqliteRepository } from './BaseSqliteRepository';
import { assertEntityId } from '../../shared/identifiers';
import { evaluateAgentLifecycleTransition } from '../../shared/agentLifecyclePolicy';
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
            retryCount: 'retry_count', maxRetries: 'max_retries', tokenBudget: 'token_budget',
            timeBudgetMs: 'time_budget_ms', startedAt: 'started_at', completedAt: 'completed_at',
            createdAt: 'created_at', updatedAt: 'updated_at',
        }, {
            id: 'id', taskCode: 'task_code', title: 'title', description: 'description', status: 'status',
            priority: 'priority', projectId: 'project_id', assigneeId: 'assignee_id', creatorId: 'creator_id',
            acceptanceCriteria: 'acceptance_criteria', result: 'result', blockerReason: 'blocker_reason',
            requiredCapabilities: 'required_capabilities_json',
            retryCount: 'retry_count', maxRetries: 'max_retries', tokenBudget: 'token_budget',
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
    if (Object.hasOwn(value, 'requiredCapabilities')) {
        const capabilities = value.requiredCapabilities;
        if (!Array.isArray(capabilities) || capabilities.length > 32
            || capabilities.some((capability) => typeof capability !== 'string' || !capability.trim() || capability.trim().length > 100)
            || new Set(capabilities.map((capability) => capability.trim().toLocaleLowerCase('en-US'))).size !== capabilities.length) {
            throw new TypeError('Task required capabilities must contain at most 32 unique, non-empty labels of at most 100 characters.');
        }
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
    for (const field of ['acceptanceCriteria', 'result', 'requiredCapabilities']) {
        if (typeof row[field] !== 'string') continue;
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
};
const MEMORY_OWNER_COLUMNS = {
    organizationId: 'organization_id', officeId: 'office_id', departmentId: 'department_id',
    taskId: 'task_id', projectId: 'project_id', objectiveId: 'objective_id',
};
export class MemoryRepository extends BaseSqliteRepository {
    constructor(database) {
        super(database, 'memories', {
            id: 'id', scope: 'scope', category: 'category', title: 'title', content: 'content',
            importance: 'importance', verified: 'verified', organizationId: 'organization_id',
            officeId: 'office_id', departmentId: 'department_id', taskId: 'task_id', projectId: 'project_id',
            objectiveId: 'objective_id', createdAt: 'created_at', updatedAt: 'updated_at',
        }, {
            id: 'id', scope: 'scope', category: 'category', title: 'title', content: 'content',
            importance: 'importance', verified: 'verified', organizationId: 'organization_id',
            officeId: 'office_id', departmentId: 'department_id', taskId: 'task_id', projectId: 'project_id',
            objectiveId: 'objective_id',
        });
    }
    create(value) {
        assertMemoryOwnership(value);
        return this.insert(value);
    }
    list() { return this.query(); }
    listByScope(scope) {
        assertMemoryScope(scope);
        return this.query('scope = ?', [scope]);
    }
    listByOwner(scope, ownerId, { limit = 100, ownerType } = {}) {
        assertMemoryScope(scope);
        if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
            throw new TypeError('Memory owner query limit must be between 1 and 100.');
        }
        const property = MEMORY_SCOPE_OWNERS[scope];
        const ownerProperty = property ?? assertTypedMemoryOwner(scope, ownerType);
        return this.query(`scope = ? AND ${MEMORY_OWNER_COLUMNS[ownerProperty]} = ?`,
            [scope, assertEntityId(ownerId)], 'created_at, id', limit);
    }
    getByOwner(scope, ownerId, memoryId, { ownerType } = {}) {
        assertMemoryScope(scope);
        ownerId = assertEntityId(ownerId);
        memoryId = assertEntityId(memoryId, 'Memory id');
        const property = MEMORY_SCOPE_OWNERS[scope] ?? assertTypedMemoryOwner(scope, ownerType);
        return this.database.prepare(`SELECT ${this.selectList()} FROM memories WHERE id = ? AND scope = ? AND ${MEMORY_OWNER_COLUMNS[property]} = ?`)
            .get(memoryId, scope, ownerId);
    }
    deleteByOwner(scope, ownerId, memoryId, { ownerType } = {}) {
        assertMemoryScope(scope);
        ownerId = assertEntityId(ownerId);
        memoryId = assertEntityId(memoryId, 'Memory id');
        const property = MEMORY_SCOPE_OWNERS[scope] ?? assertTypedMemoryOwner(scope, ownerType);
        return this.database.prepare(`DELETE FROM memories WHERE id = ? AND scope = ? AND ${MEMORY_OWNER_COLUMNS[property]} = ?`)
            .run(memoryId, scope, ownerId).changes > 0;
    }
    update(id, changes) { return this.updateById(id, changes); }
    delete(id) { return this.deleteById(id); }
}

function assertTypedMemoryOwner(scope, ownerType) {
    if (!['DECISION', 'KNOWLEDGE'].includes(scope) || !Object.hasOwn(MEMORY_OWNER_COLUMNS, ownerType)) {
        throw new TypeError(`Memory scope ${scope} requires an explicit owner type.`);
    }
    return ownerType;
}

function assertMemoryScope(scope) {
    if (!['CEO', 'DIRECTOR', 'OFFICE', 'DEPARTMENT', 'TASK', 'PROJECT', 'DECISION', 'KNOWLEDGE'].includes(scope)) {
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
