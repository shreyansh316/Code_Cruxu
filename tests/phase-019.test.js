/** Phase 019 — deterministic one-level task escalation. */
import { describe, expect, it } from 'vitest';
import { AgentRole } from '../src/constants';
import { DomainInvariantError, getTaskEscalationRoute } from '../src/domain';

describe('Phase 019 — task escalation routing', () => {
    it('routes blocked and retry-exhausted work one level upward', () => {
        const matrix = [
            [AgentRole.EMPLOYEE, AgentRole.DEPT_MANAGER],
            [AgentRole.DEPT_MANAGER, AgentRole.HEAD_MANAGER],
            [AgentRole.HEAD_MANAGER, AgentRole.DIRECTOR],
            [AgentRole.DIRECTOR, AgentRole.CEO],
        ];
        for (const [sourceRole, targetRole] of matrix) {
            expect(getTaskEscalationRoute(sourceRole, 'BLOCKED')).toEqual({ sourceRole, targetRole, trigger: 'BLOCKED' });
            expect(getTaskEscalationRoute(sourceRole, 'RETRIES_EXHAUSTED').targetRole).toBe(targetRole);
        }
    });

    it('prevents employee-to-CEO and peer-manager shortcuts', () => {
        expect(getTaskEscalationRoute(AgentRole.EMPLOYEE, 'BLOCKED').targetRole).not.toBe(AgentRole.CEO);
        expect(getTaskEscalationRoute(AgentRole.DEPT_MANAGER, 'BLOCKED').targetRole).not.toBe(AgentRole.DEPT_MANAGER);
    });

    it('rejects CEO escalation, invalid roles, and unrelated triggers', () => {
        expect(() => getTaskEscalationRoute(AgentRole.CEO, 'BLOCKED')).toThrowError(
            expect.objectContaining({ code: 'task-escalation-unavailable' }),
        );
        expect(() => getTaskEscalationRoute('UNKNOWN', 'BLOCKED')).toThrowError(DomainInvariantError);
        expect(() => getTaskEscalationRoute(AgentRole.EMPLOYEE, 'QUESTION')).toThrowError(DomainInvariantError);
    });
});
