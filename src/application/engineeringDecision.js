import { createEntityId, DomainInvariantError } from '../domain';
import { ApplicationError, createUseCase } from './useCase';

/** Persist an evidence-backed engineering decision only for an agent participating in its task. */
export function createEngineeringDecisionUseCase({ decisionRepository, taskRepository, agentRepository,
    auditRepository, unitOfWork, idFactory } = {}) {
    if (typeof decisionRepository?.create !== 'function' || typeof taskRepository?.getById !== 'function'
        || typeof agentRepository?.getById !== 'function' || typeof auditRepository?.append !== 'function'
        || typeof unitOfWork?.run !== 'function' || typeof idFactory !== 'function') {
        throw new TypeError('Engineering decision persistence requires decision, task, agent, audit, transaction, and ID ports.');
    }
    return createUseCase({ name: 'engineering-decision-record', dependencies: {
        decisionRepository, taskRepository, agentRepository, auditRepository, unitOfWork, idFactory,
    }, execute: ({ input, dependencies }) => {
        const taskId = createEntityId(input?.taskId);
        const authorId = createEntityId(input?.authorId);
        const task = dependencies.taskRepository.getById(taskId);
        if (!task) throw new ApplicationError('task-not-found', 'The decision task does not exist.');
        const author = dependencies.agentRepository.getById(authorId);
        if (!author) throw new ApplicationError('agent-not-found', 'The decision author does not exist.');
        if (task.creatorId !== author.id && task.assigneeId !== author.id) {
            throw new DomainInvariantError('decision-author-forbidden', 'Only the task creator or assignee may record this decision.');
        }
        return dependencies.unitOfWork.run(() => {
            const record = dependencies.decisionRepository.create({ ...input,
                id: createEntityId(dependencies.idFactory()), taskId, authorId });
            dependencies.auditRepository.append({ id: createEntityId(dependencies.idFactory()),
                action: 'ENGINEERING_DECISION_RECORDED', entity: 'engineering-decision', entityId: record.id,
                actorId: authorId, taskId, details: { selectedOption: record.selectedOption, confidence: record.confidence } });
            return record;
        });
    } });
}
