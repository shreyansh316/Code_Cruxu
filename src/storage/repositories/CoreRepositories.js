import { BaseSqliteRepository } from './BaseSqliteRepository';
import { assertEntityId } from '../../shared/identifiers';
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
export class ObjectiveRepository extends BaseSqliteRepository {
    constructor(database) {
        super(database, 'objectives', {
            id: 'id', title: 'title', description: 'description', status: 'status', priority: 'priority',
            createdAt: 'created_at', updatedAt: 'updated_at',
        }, { id: 'id', title: 'title', description: 'description', status: 'status', priority: 'priority' });
    }
    create(value) { return this.insert(value); }
    list() { return this.query(); }
    listByStatus(status) { return this.query('status = ?', [status]); }
    update(id, changes) {
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
            id: 'id', name: 'name', role: 'role', specialization: 'specialization', status: 'status',
            managedOfficeId: 'managed_office_id', managedDepartmentId: 'managed_department_id',
            departmentId: 'department_id', createdAt: 'created_at', updatedAt: 'updated_at',
        }, {
            id: 'id', name: 'name', role: 'role', specialization: 'specialization', status: 'status',
            managedOfficeId: 'managed_office_id', managedDepartmentId: 'managed_department_id',
            departmentId: 'department_id',
        });
    }
    create(value) { return this.insert(value); }
    list() { return this.query(); }
    listByRole(role) { return this.query('role = ?', [role]); }
    listByDepartment(departmentId) {
        return this.query('department_id = ?', [departmentId]);
    }
    update(id, changes) {
        return this.updateById(id, changes);
    }
    delete(id) { return this.deleteById(id); }
}
export class TaskRepository extends BaseSqliteRepository {
    constructor(database) {
        super(database, 'tasks', {
            id: 'id', taskCode: 'task_code', title: 'title', description: 'description', status: 'status',
            priority: 'priority', projectId: 'project_id', assigneeId: 'assignee_id', creatorId: 'creator_id',
            acceptanceCriteria: 'acceptance_criteria', result: 'result', blockerReason: 'blocker_reason',
            retryCount: 'retry_count', maxRetries: 'max_retries', tokenBudget: 'token_budget',
            timeBudgetMs: 'time_budget_ms', startedAt: 'started_at', completedAt: 'completed_at',
            createdAt: 'created_at', updatedAt: 'updated_at',
        }, {
            id: 'id', taskCode: 'task_code', title: 'title', description: 'description', status: 'status',
            priority: 'priority', projectId: 'project_id', assigneeId: 'assignee_id', creatorId: 'creator_id',
            acceptanceCriteria: 'acceptance_criteria', result: 'result', blockerReason: 'blocker_reason',
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
    if (!value || !Object.hasOwn(value, 'acceptanceCriteria') || value.acceptanceCriteria == null
        || typeof value.acceptanceCriteria === 'string') return value;
    return { ...value, acceptanceCriteria: JSON.stringify(value.acceptanceCriteria) };
}

function mapTask(row) {
    if (!row || typeof row.acceptanceCriteria !== 'string') return row;
    try {
        return { ...row, acceptanceCriteria: JSON.parse(row.acceptanceCriteria) };
    }
    catch {
        return row;
    }
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
    listByOwner(scope, ownerId) {
        assertMemoryScope(scope);
        const property = MEMORY_SCOPE_OWNERS[scope];
        if (!property && !['DECISION', 'KNOWLEDGE'].includes(scope)) {
            throw new Error(`Memory scope ${scope} requires a more specific query.`);
        }
        if (property) {
            return this.query(`scope = ? AND ${MEMORY_OWNER_COLUMNS[property]} = ?`, [scope, assertEntityId(ownerId)]);
        }
        const ownerColumns = Object.values(MEMORY_OWNER_COLUMNS);
        const where = ownerColumns.map((column) => `${column} = ?`).join(' OR ');
        return this.query(`scope = ? AND (${where})`, [scope, ...ownerColumns.map(() => assertEntityId(ownerId))]);
    }
    update(id, changes) { return this.updateById(id, changes); }
    delete(id) { return this.deleteById(id); }
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
