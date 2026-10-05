import { AgentRole } from '../constants';
import { assertOrganizationHierarchyInvariant, createEntityId, DomainInvariantError, isAgentAvailable, transitionAgentLifecycle } from '../domain';
import { ApplicationError, createUseCase } from './useCase';

/** Let the persisted CEO manage one workforce member's lifecycle with transactional audit. */
export function createAgentLifecycleManagement({ agentRepository, hierarchyProvider, auditRepository,
    unitOfWork, clock, idFactory } = {}) {
    if (typeof agentRepository?.getById !== 'function' || typeof agentRepository?.transitionLifecycle !== 'function'
        || typeof hierarchyProvider?.getSnapshot !== 'function' || typeof auditRepository?.append !== 'function'
        || typeof unitOfWork?.run !== 'function' || typeof clock?.now !== 'function' || typeof idFactory !== 'function') {
        throw new TypeError('Agent lifecycle management requires persisted identity, hierarchy, audit, transaction, clock, and ID ports.');
    }
    return createUseCase({ name: 'agent-lifecycle-management', dependencies: {
        agentRepository, hierarchyProvider, auditRepository, unitOfWork, clock, idFactory,
    }, execute: ({ input, dependencies }) => {
        const actorId = createEntityId(input?.actorId);
        const agentId = createEntityId(input?.agentId);
        if (typeof input?.reason !== 'string' || !input.reason.trim() || input.reason.trim().length > 1000) {
            throw new DomainInvariantError('invalid-agent-lifecycle-request', 'A bounded explanation is required for a lifecycle change.');
        }
        const actor = dependencies.agentRepository.getById(actorId);
        const target = dependencies.agentRepository.getById(agentId);
        if (!actor || actor.role !== AgentRole.CEO || !isAgentAvailable(actor)) {
            throw new ApplicationError('agent-lifecycle-forbidden', 'Only the active persisted CEO may manage workforce lifecycle.');
        }
        if (!target) throw new ApplicationError('agent-not-found', 'The selected workforce member does not exist.');
        if (target.role === AgentRole.CEO) {
            throw new DomainInvariantError('invalid-agent-lifecycle-target', 'The CEO identity cannot be suspended or retired through workforce management.');
        }
        const hierarchy = dependencies.hierarchyProvider.getSnapshot();
        assertOrganizationHierarchyInvariant(hierarchy);
        const persistedActor = hierarchy?.agents?.find((agent) => agent.id === actor.id);
        const persistedTarget = hierarchy?.agents?.find((agent) => agent.id === target.id);
        if (!persistedActor || persistedActor.role !== AgentRole.CEO || !isAgentAvailable(persistedActor)
            || !persistedTarget || persistedTarget.role !== target.role) {
            throw new ApplicationError('agent-lifecycle-scope-denied', 'The CEO and workforce member must belong to the current organization hierarchy.');
        }
        const previous = target.lifecycleStatus ?? 'ACTIVE';
        // Validate before opening a transaction so invalid requests cannot write audit data.
        const planned = transitionAgentLifecycle(previous, input.lifecycleStatus);
        if (!planned.changed) return Object.freeze({ agentId, lifecycleStatus: previous, changed: false });
        assertReplacementCoverage(hierarchy, persistedTarget, planned.lifecycleStatus);
        return dependencies.unitOfWork.run(() => {
            const updated = dependencies.agentRepository.transitionLifecycle(agentId, input.lifecycleStatus);
            if (!updated) throw new ApplicationError('agent-not-found', 'The selected workforce member no longer exists.');
            if (updated.lifecycleStatus !== planned.lifecycleStatus) {
                throw new DomainInvariantError('stale-agent-lifecycle', 'The workforce member lifecycle changed before this request could be applied.');
            }
            const timestamp = new Date(dependencies.clock.now()).toISOString();
            dependencies.auditRepository.append({ id: createEntityId(dependencies.idFactory()),
                action: 'AGENT_LIFECYCLE_CHANGED', entity: 'agent', entityId: agentId, actorId,
                details: { from: previous, to: updated.lifecycleStatus, reason: input.reason.trim(), occurredAt: timestamp } });
            return Object.freeze({ agentId, lifecycleStatus: updated.lifecycleStatus, changed: true, occurredAt: timestamp });
        });
    } });
}

function assertReplacementCoverage(hierarchy, target, nextLifecycleStatus) {
    if (nextLifecycleStatus === 'ACTIVE' || !isAgentAvailable(target)) return;
    let sameAssignmentScope;
    if (target.role === AgentRole.DIRECTOR) {
        sameAssignmentScope = (candidate) => candidate.role === target.role
            && candidate.organizationId === target.organizationId;
    }
    else if (target.role === AgentRole.HEAD_MANAGER) {
        sameAssignmentScope = (candidate) => candidate.role === target.role
            && candidate.managedOfficeId === target.managedOfficeId;
    }
    else if (target.role === AgentRole.DEPT_MANAGER) {
        sameAssignmentScope = (candidate) => candidate.role === target.role
            && candidate.managedDepartmentId === target.managedDepartmentId;
    }
    else return;
    const replacementExists = hierarchy.agents.some((candidate) => candidate.id !== target.id
        && sameAssignmentScope(candidate) && isAgentAvailable(candidate));
    if (!replacementExists) {
        throw new DomainInvariantError('last-available-role-owner',
            'The last available Director or manager in an assignment scope cannot be suspended or retired.');
    }
}
