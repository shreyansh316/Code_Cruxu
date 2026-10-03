import { assertEntityId } from '../../shared/identifiers';

/** Persist validated task dependency edges using the existing foreign keys. */
export class TaskDependencyRepository {
    constructor(database) {
        if (!database || typeof database.prepare !== 'function') {
            throw new TypeError('TaskDependencyRepository requires a SQLite database handle.');
        }
        this.database = database;
    }

    create({ id, dependentTaskId, dependencyTaskId }) {
        id = assertEntityId(id, 'Task dependency id');
        dependentTaskId = assertEntityId(dependentTaskId, 'Dependent task id');
        dependencyTaskId = assertEntityId(dependencyTaskId, 'Dependency task id');
        if (dependentTaskId === dependencyTaskId) throw new TypeError('A task cannot depend on itself.');
        this.database.prepare(`INSERT INTO task_dependencies (id, dependent_task_id, dependency_task_id)
          VALUES (?, ?, ?)`).run(id, dependentTaskId, dependencyTaskId);
        return { id, dependentTaskId, dependencyTaskId };
    }

    listByTask(taskId) {
        taskId = assertEntityId(taskId, 'Task id');
        return this.database.prepare(`SELECT id, dependent_task_id AS dependentTaskId,
          dependency_task_id AS dependencyTaskId FROM task_dependencies
          WHERE dependent_task_id = ? OR dependency_task_id = ? ORDER BY id`).all(taskId, taskId);
    }
}
