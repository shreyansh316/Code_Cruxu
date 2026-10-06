import { createEntityId, DomainInvariantError } from '../domain';

/** Stop the task's single active debug session inside the caller's task-state transaction. */
export function stopTaskDebuggingSession({ sessionRepository, auditRepository, taskId, actorId,
    reason, summary, occurredAt, idFactory } = {}) {
    if (sessionRepository === undefined) return undefined;
    if (typeof sessionRepository?.listByTask !== 'function' || typeof sessionRepository?.stop !== 'function'
        || typeof auditRepository?.append !== 'function' || typeof idFactory !== 'function') {
        throw new TypeError('Task debugging-session shutdown requires session, audit, and ID ports.');
    }
    const sessions = sessionRepository.listByTask(taskId, { limit: 20 });
    const active = sessions.filter((session) => session.status === 'ACTIVE');
    if (active.length > 1) {
        throw new DomainInvariantError('multiple-debugging-sessions-active', 'Task state cannot change while multiple debugging sessions are active.');
    }
    if (active.length === 0) return undefined;
    const stopped = sessionRepository.stop(active[0].id, reason, summary, occurredAt);
    auditRepository.append({ id: createEntityId(idFactory()), action: 'DEBUGGING_SESSION_STOPPED',
        entity: 'debugging-session', entityId: active[0].id, actorId, taskId,
        details: { status: stopped.session.status, stopReason: stopped.session.stopReason, trigger: 'TASK_STATE_CHANGED' } });
    return stopped.session;
}
