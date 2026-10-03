import { describe, expect, it } from 'vitest';
import { createEmployeeTaskPacket, validateEmployeeTaskResult } from '../src/agents';

const criteria = [{ id: 'criterion-053', description: 'Requirement is met', required: true, met: false }];
const task = { id: 'task-053', title: 'Implement bounded packet', description: 'Use only approved task context.', acceptanceCriteria: criteria };

describe('Phase 053 — employee task execution contract', () => {
    it('creates a frozen bounded packet with the required structured fields', () => {
        const packet = createEmployeeTaskPacket({ task, relevantContext: ['Approved note'], dependencies: ['task-previous'] });
        expect(packet).toMatchObject({ taskId: 'task-053', objective: task.title, requirements: task.description,
            relevantContext: ['Approved note'], dependencies: ['task-previous'], output: { status: 'PENDING' } });
        expect(Object.isFrozen(packet)).toBe(true);
        expect(Object.isFrozen(packet.acceptanceCriteria[0])).toBe(true);
    });
    it('rejects malformed identifiers, oversized context, and unbounded arrays', () => {
        expect(() => createEmployeeTaskPacket({ task: { ...task, id: '' } })).toThrow();
        expect(() => createEmployeeTaskPacket({ task, relevantContext: ['x'.repeat(2001)] })).toThrow();
        expect(() => createEmployeeTaskPacket({ task, dependencies: Array(101).fill('task-dependency') })).toThrow();
    });
    it('validates structured success, test and file evidence, and blockers', () => {
        const value = validateEmployeeTaskResult({ status: 'SUCCEEDED', result: { summary: 'Complete',
            acceptanceCriteria: [{ criterionId: 'criterion-053', met: true, evidence: 'Targeted check passed' }] },
            files: ['src/agents/employeeExecutionContract.js'], tests: ['phase-053.test.js passed'], blockers: [] }, criteria);
        expect(value.status).toBe('SUCCEEDED');
        expect(Object.isFrozen(value)).toBe(true);
        expect(() => validateEmployeeTaskResult({ ...value, files: ['x'.repeat(2001)] }, criteria)).toThrow();
        expect(() => validateEmployeeTaskResult({ ...value, status: 'BLOCKED' }, criteria)).toThrow();
    });
});
