/** Phase 015 — repository-backed objective and task status views. */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TaskStatus } from '../src/constants';
import { SqliteConnection, applyMigrations, ObjectiveRepository, TaskRepository } from '../src/storage';
import { ActiveTaskTreeProvider, ObjectiveStatusTreeProvider } from '../src/core/StatusTreeProviders';
import { createEntityId } from '../src/domain';

describe('Phase 015 — persisted status tree providers', () => {
    let connection;
    let objectives;
    let tasks;

    beforeEach(() => {
        connection = new SqliteConnection();
        const database = connection.open(':memory:');
        applyMigrations(database);
        objectives = new ObjectiveRepository(database);
        tasks = new TaskRepository(database);
    });

    afterEach(() => connection.close());

    it('shows an explicit empty state when no objectives or active tasks exist', () => {
        const objectivesProvider = new ObjectiveStatusTreeProvider(objectives);
        const tasksProvider = new ActiveTaskTreeProvider(tasks);
        expect(objectivesProvider.getChildren()).toMatchObject([{ label: 'No objectives yet.' }]);
        expect(tasksProvider.getChildren()).toMatchObject([{ label: 'No active tasks.' }]);
    });

    it('shows real persisted objective and non-terminal task statuses', () => {
        const objective = objectives.create({
            id: createEntityId('objective-view'), title: 'Persisted objective', description: 'From SQLite.',
            status: 'ACTIVE',
        });
        const activeTask = tasks.create({
            id: createEntityId('task-active-view'), taskCode: 'TASK-ACTIVE-VIEW', title: 'Active task',
            status: TaskStatus.BLOCKED,
        });
        tasks.create({
            id: createEntityId('task-complete-view'), taskCode: 'TASK-COMPLETE-VIEW', title: 'Completed task',
            status: TaskStatus.COMPLETED,
        });

        const objectiveProvider = new ObjectiveStatusTreeProvider(objectives);
        const taskProvider = new ActiveTaskTreeProvider(tasks);
        const objectiveItems = objectiveProvider.getChildren().map((item) => objectiveProvider.getTreeItem(item));
        const taskItems = taskProvider.getChildren().map((item) => taskProvider.getTreeItem(item));

        expect(objectiveItems).toHaveLength(1);
        expect(objectiveItems[0]).toMatchObject({
            label: objective.title,
            description: objective.status,
            id: `objective:${objective.id}`,
        });
        expect(taskItems).toHaveLength(1);
        expect(taskItems[0]).toMatchObject({
            label: activeTask.title,
            description: TaskStatus.BLOCKED,
            id: `task:${activeTask.id}`,
        });
    });

    it('returns no children for leaf records', () => {
        const objective = objectives.create({
            id: createEntityId('objective-leaf'), title: 'Leaf', description: 'No child records.',
        });
        const provider = new ObjectiveStatusTreeProvider(objectives);
        const [record] = provider.getChildren();
        expect(provider.getChildren(record)).toEqual([]);
        expect(provider.getTreeItem(objective).contextValue).toBe('headroom.objective');
    });
});
