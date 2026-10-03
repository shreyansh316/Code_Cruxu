import { BaseSqliteRepository } from './BaseSqliteRepository';
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
    create(value) { return this.insert(value); }
    list() { return this.query(); }
    listByStatus(status) { return this.query('status = ?', [status]); }
    listByProject(projectId) { return this.query('project_id = ?', [projectId]); }
    update(id, changes) {
        return this.updateById(id, changes);
    }
    delete(id) { return this.deleteById(id); }
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
    listByStatus(status) {
        return this.query('status = ?', [status]);
    }
    update(id, changes) {
        return this.updateById(id, changes);
    }
    delete(id) { return this.deleteById(id); }
}
