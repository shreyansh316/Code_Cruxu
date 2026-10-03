import type Database from 'better-sqlite3';
import type { EntityId } from '../../shared/identifiers';
import { BaseSqliteRepository } from './BaseSqliteRepository';
import type {
  AgentChanges,
  AgentRecord,
  DirectorQuestionChanges,
  DirectorQuestionRecord,
  DirectorQuestionStatus,
  NewAgent,
  NewDirectorQuestion,
  NewObjective,
  NewOrganization,
  NewProject,
  NewTask,
  ObjectiveChanges,
  ObjectiveRecord,
  OrganizationChanges,
  OrganizationRecord,
  ProjectChanges,
  ProjectRecord,
  ProjectStatus,
  TaskChanges,
  TaskRecord,
} from './types';
import type { ObjectiveStatus, TaskStatus } from '../../constants';
import type { AgentRole } from '../../constants';

export class OrganizationRepository extends BaseSqliteRepository<
  OrganizationRecord, NewOrganization, OrganizationChanges
> {
  constructor(database: Database.Database) {
    super(database, 'organizations', {
      id: 'id', name: 'name', createdAt: 'created_at', updatedAt: 'updated_at',
    }, { id: 'id', name: 'name' });
  }

  create(value: NewOrganization): OrganizationRecord { return this.insert(value); }
  list(): OrganizationRecord[] { return this.query(); }
  update(id: EntityId, changes: OrganizationChanges): OrganizationRecord | undefined {
    return this.updateById(id, changes);
  }
  delete(id: EntityId): boolean { return this.deleteById(id); }
}

export class ObjectiveRepository extends BaseSqliteRepository<
  ObjectiveRecord, NewObjective, ObjectiveChanges
> {
  constructor(database: Database.Database) {
    super(database, 'objectives', {
      id: 'id', title: 'title', description: 'description', status: 'status', priority: 'priority',
      createdAt: 'created_at', updatedAt: 'updated_at',
    }, { id: 'id', title: 'title', description: 'description', status: 'status', priority: 'priority' });
  }

  create(value: NewObjective): ObjectiveRecord { return this.insert(value); }
  list(): ObjectiveRecord[] { return this.query(); }
  listByStatus(status: ObjectiveStatus): ObjectiveRecord[] { return this.query('status = ?', [status]); }
  update(id: EntityId, changes: ObjectiveChanges): ObjectiveRecord | undefined {
    return this.updateById(id, changes);
  }
  delete(id: EntityId): boolean { return this.deleteById(id); }
}

export class ProjectRepository extends BaseSqliteRepository<ProjectRecord, NewProject, ProjectChanges> {
  constructor(database: Database.Database) {
    super(database, 'projects', {
      id: 'id', name: 'name', description: 'description', status: 'status', priority: 'priority',
      objectiveId: 'objective_id', createdAt: 'created_at', updatedAt: 'updated_at',
    }, {
      id: 'id', name: 'name', description: 'description', status: 'status', priority: 'priority',
      objectiveId: 'objective_id',
    });
  }

  create(value: NewProject): ProjectRecord { return this.insert(value); }
  list(): ProjectRecord[] { return this.query(); }
  listByObjective(objectiveId: EntityId): ProjectRecord[] {
    return this.query('objective_id = ?', [objectiveId]);
  }
  listByStatus(status: ProjectStatus): ProjectRecord[] { return this.query('status = ?', [status]); }
  update(id: EntityId, changes: ProjectChanges): ProjectRecord | undefined {
    return this.updateById(id, changes);
  }
  delete(id: EntityId): boolean { return this.deleteById(id); }
}

export class AgentRepository extends BaseSqliteRepository<AgentRecord, NewAgent, AgentChanges> {
  constructor(database: Database.Database) {
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

  create(value: NewAgent): AgentRecord { return this.insert(value); }
  list(): AgentRecord[] { return this.query(); }
  listByRole(role: AgentRole): AgentRecord[] { return this.query('role = ?', [role]); }
  listByDepartment(departmentId: EntityId): AgentRecord[] {
    return this.query('department_id = ?', [departmentId]);
  }
  update(id: EntityId, changes: AgentChanges): AgentRecord | undefined {
    return this.updateById(id, changes);
  }
  delete(id: EntityId): boolean { return this.deleteById(id); }
}

export class TaskRepository extends BaseSqliteRepository<TaskRecord, NewTask, TaskChanges> {
  constructor(database: Database.Database) {
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

  create(value: NewTask): TaskRecord { return this.insert(value); }
  list(): TaskRecord[] { return this.query(); }
  listByStatus(status: TaskStatus): TaskRecord[] { return this.query('status = ?', [status]); }
  listByProject(projectId: EntityId): TaskRecord[] { return this.query('project_id = ?', [projectId]); }
  update(id: EntityId, changes: TaskChanges): TaskRecord | undefined {
    return this.updateById(id, changes);
  }
  delete(id: EntityId): boolean { return this.deleteById(id); }
}

export class DirectorQuestionRepository extends BaseSqliteRepository<
  DirectorQuestionRecord, NewDirectorQuestion, DirectorQuestionChanges
> {
  constructor(database: Database.Database) {
    super(database, 'director_questions', {
      id: 'id', objectiveId: 'objective_id', question: 'question', answer: 'answer', status: 'status',
      category: 'category', sortOrder: 'sort_order', createdAt: 'created_at', updatedAt: 'updated_at',
    }, {
      id: 'id', objectiveId: 'objective_id', question: 'question', answer: 'answer', status: 'status',
      category: 'category', sortOrder: 'sort_order',
    });
  }

  create(value: NewDirectorQuestion): DirectorQuestionRecord { return this.insert(value); }
  list(): DirectorQuestionRecord[] { return this.query(); }
  listByObjective(objectiveId: EntityId): DirectorQuestionRecord[] {
    return this.query('objective_id = ?', [objectiveId], 'sort_order, created_at, id');
  }
  listByStatus(status: DirectorQuestionStatus): DirectorQuestionRecord[] {
    return this.query('status = ?', [status]);
  }
  update(id: EntityId, changes: DirectorQuestionChanges): DirectorQuestionRecord | undefined {
    return this.updateById(id, changes);
  }
  delete(id: EntityId): boolean { return this.deleteById(id); }
}
