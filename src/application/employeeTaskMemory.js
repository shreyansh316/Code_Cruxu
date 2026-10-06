import { AgentRole } from '../constants';
import { DomainInvariantError } from '../domain/errors';
import { assertEntityId } from '../shared/identifiers';
import { assembleBoundedAgentContext } from './contextAssembly';

const MEMORY_ITEMS = 6;
const MEMORY_BYTES = 12_000;

/** Retrieve only the assigned agent's private memories and the active task's scoped memories. */
export function createEmployeeTaskMemoryProvider({ memoryRepository, now = () => new Date().toISOString() } = {}) {
    if (typeof memoryRepository?.listByOwner !== 'function' || typeof now !== 'function') {
        throw new TypeError('Employee task memory requires an owner-scoped repository and clock.');
    }
    return Object.freeze({
        forTask({ actor, task } = {}) {
            if (!actor || !Object.values(AgentRole).includes(actor.role) || !task
                || task.assigneeId !== actor.id) {
                throw new DomainInvariantError('agent-task-memory-forbidden', 'Memory context is available only to the persisted task assignee.');
            }
            const actorId = assertEntityId(actor.id, 'Memory actor id');
            const taskId = assertEntityId(task.id, 'Memory task id');
            const instant = now();
            const authorize = (request) => request.actor.id === actorId
                && request.ownerId === (request.scope === 'EMPLOYEE' ? actorId : taskId)
                && (request.scope !== 'TASK' || task.assigneeId === actorId);
            const employee = assembleBoundedAgentContext({ memoryRepository, authorize }, {
                actor: { id: actorId, role: actor.role }, scope: 'EMPLOYEE', ownerId: actorId,
                query: memoryQuery(task), limit: MEMORY_ITEMS, maxBytes: MEMORY_BYTES, now: instant,
            });
            const scopedTask = assembleBoundedAgentContext({ memoryRepository, authorize }, {
                actor: { id: actorId, role: actor.role }, scope: 'TASK', ownerId: taskId,
                query: memoryQuery(task), limit: MEMORY_ITEMS, maxBytes: MEMORY_BYTES, now: instant,
            });
            return Object.freeze({ employee: employee.items, task: scopedTask.items });
        },
    });
}

function memoryQuery(task) {
    return `${typeof task.title === 'string' ? task.title : ''} ${typeof task.description === 'string' ? task.description : ''}`.slice(0, 500);
}
