import { TaskStatus } from '../constants';
import { DomainInvariantError } from '../domain/errors';
import { normalizeTaskToolPermissions } from '../shared/taskToolPermissions';
import { createWorkspaceFingerprint } from '../shared/workspaceFingerprint';
import { createTaskScopedTools } from './TaskScopedTools';

/** Resolve runtime tools exclusively from the task's persisted permission manifest. */
export function createPersistedTaskToolsProvider({ workspaceRoot, filesystem, processRunner } = {}) {
    if (typeof workspaceRoot !== 'string' || !workspaceRoot.trim()
        || typeof filesystem?.readFile !== 'function' || typeof filesystem?.writeFile !== 'function'
        || typeof processRunner?.execute !== 'function') {
        throw new TypeError('Persisted task tools require a workspace root, filesystem adapter, and process runner.');
    }
    return Object.freeze({
        async forTask({ actor, task } = {}) {
            if (!actor || !task || task.status !== TaskStatus.IN_PROGRESS || task.assigneeId !== actor.id) {
                throw new DomainInvariantError('task-tool-permission-forbidden', 'Task tools require the current assigned employee and an in-progress task.');
            }
            const workspaceFingerprint = await createWorkspaceFingerprint(workspaceRoot);
            const permissions = normalizeTaskToolPermissions(task.toolPermissions)
                ?? Object.freeze({ readFiles: Object.freeze([]), writeFiles: Object.freeze([]), commands: Object.freeze([]),
                    workspaceFingerprint });
            if (!permissions.workspaceFingerprint || permissions.workspaceFingerprint !== workspaceFingerprint) {
                throw new DomainInvariantError('task-tool-workspace-mismatch', 'Task tool permissions are not bound to the active workspace.');
            }
            return createTaskScopedTools({ workspaceRoot, filesystem, processRunner, permissions });
        },
    });
}
