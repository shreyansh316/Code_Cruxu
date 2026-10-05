import { AgentRole } from '../constants';
import { createEntityId, DomainInvariantError } from '../domain';
import { ApplicationError, createUseCase } from './useCase';
import { redactSecrets } from '../shared/redactSecrets';

const MAX_PROJECTS = 500;
const MAX_TASKS = 5000;

/** Build a bounded CEO report from persisted objective, task, audit, and usage state. */
export function createCEOExecutionReport({ agentRepository, objectiveRepository, projectRepository, taskRepository,
    auditRepository, usageRepository } = {}) {
    if (typeof agentRepository?.getById !== 'function' || typeof objectiveRepository?.getById !== 'function'
        || typeof projectRepository?.listByObjective !== 'function' || typeof taskRepository?.listByProject !== 'function'
        || typeof auditRepository?.listByTask !== 'function' || typeof usageRepository?.listByTask !== 'function') {
        throw new TypeError('CEO reporting requires persisted identity, objective, task, audit, and usage repositories.');
    }
    return createUseCase({ name: 'ceo-execution-report', dependencies: { agentRepository, objectiveRepository,
        projectRepository, taskRepository, auditRepository, usageRepository },
        execute: ({ input, dependencies }) => {
            const ceo = dependencies.agentRepository.getById(input?.ceoId);
            if (!ceo || ceo.role !== AgentRole.CEO) throw new ApplicationError('ceo-report-forbidden', 'Only the persisted CEO may request execution reports.');
            const objectiveId = createEntityId(input.objectiveId);
            const objective = dependencies.objectiveRepository.getById(objectiveId);
            if (!objective) throw new ApplicationError('objective-not-found', 'The reported objective does not exist.');
            if (typeof ceo.organizationId !== 'string' || !ceo.organizationId
                || objective.organizationId !== ceo.organizationId) {
                throw new ApplicationError('ceo-report-forbidden', 'The CEO may report only on objectives owned by its organization.');
            }
            const projects = dependencies.projectRepository.listByObjective(objective.id);
            if (!Array.isArray(projects) || projects.length > MAX_PROJECTS) throw new DomainInvariantError('report-limit-exceeded', 'Objective report exceeds its project limit.');
            const tasks = projects.flatMap((project) => dependencies.taskRepository.listByProject(project.id));
            if (tasks.length > MAX_TASKS) throw new DomainInvariantError('report-limit-exceeded', 'Objective report exceeds its task limit.');
            const counts = Object.create(null);
            let estimatedCost = 0;
            let inputTokens = 0;
            let outputTokens = 0;
            let failedRequests = 0;
            const blockers = [];
            const audit = [];
            for (const task of tasks) {
                counts[task.status] = (counts[task.status] ?? 0) + 1;
                if (task.blockerReason) blockers.push(Object.freeze({ taskId: task.id,
                    reason: redactSecrets(String(task.blockerReason), 2000) }));
                for (const usage of dependencies.usageRepository.listByTask(task.id, { limit: 1000 })) {
                    estimatedCost += usage.estimatedCost;
                    inputTokens += usage.inputTokens;
                    outputTokens += usage.outputTokens;
                    if (!usage.success) failedRequests += 1;
                }
                const events = dependencies.auditRepository.listByTask(task.id);
                audit.push(Object.freeze({ taskId: task.id, entries: events.length,
                    latestAction: events.at(-1)?.action ?? null }));
            }
            return Object.freeze({ objective: Object.freeze({ id: objective.id,
                title: redactSecrets(String(objective.title ?? ''), 500), status: objective.status }),
                projectCount: projects.length, taskCount: tasks.length, taskStatusCounts: Object.freeze({ ...counts }),
                blockers: Object.freeze(blockers), cost: Object.freeze({ estimatedCost, inputTokens, outputTokens, failedRequests }),
                audit: Object.freeze(audit) });
        },
    });
}
