import { AgentRole } from '../constants';
import { DomainInvariantError } from '../domain';
import { ApplicationError, createUseCase } from './useCase';

/** Expose execution pause/resume only through a persisted CEO identity check. */
export function createCEOExecutionControl({ agentRepository, executionControl } = {}) {
    if (typeof agentRepository?.getById !== 'function' || typeof executionControl?.pause !== 'function'
        || typeof executionControl?.resume !== 'function') {
        throw new TypeError('CEO execution control requires persisted identity and execution control ports.');
    }
    return createUseCase({ name: 'ceo-execution-control', dependencies: { agentRepository, executionControl },
        execute: ({ input, dependencies }) => {
            const ceo = dependencies.agentRepository.getById(input?.ceoId);
            if (!ceo || ceo.role !== AgentRole.CEO) throw new ApplicationError('ceo-control-forbidden', 'Only the persisted CEO may control execution.');
            if (!['PAUSE', 'RESUME'].includes(input.action)) throw new DomainInvariantError('invalid-execution-control', 'CEO control action must be PAUSE or RESUME.');
            const result = dependencies.executionControl[input.action === 'PAUSE' ? 'pause' : 'resume']();
            return Object.freeze({ action: input.action, changed: result.changed, status: dependencies.executionControl.status });
        },
    });
}
