import { describe, expect, it } from 'vitest';
import { AgentRole } from '../src/constants';
import { validateDepartmentWorkforce } from '../src/domain';

const roster = ['research', 'engineering', 'quality', 'documentation'].map((specialization, index) => ({
    id: `employee-054-${index}`, role: AgentRole.EMPLOYEE, departmentId: 'department-054', specialization,
}));

describe('Phase 054 — fixed department workforce', () => {
    it('accepts exactly four independent employee specializations', () => {
        const result = validateDepartmentWorkforce('department-054', roster);
        expect(result).toHaveLength(4);
        expect(Object.isFrozen(result)).toBe(true);
    });
    it('rejects missing, excess, duplicate, misplaced, or unspecialized employee slots', () => {
        for (const employees of [roster.slice(0, 3), [...roster, { ...roster[0], id: 'extra' }],
            [roster[0], { ...roster[1], id: roster[0].id }, ...roster.slice(2)],
            [roster[0], { ...roster[1], departmentId: 'other' }, ...roster.slice(2)],
            [roster[0], { ...roster[1], specialization: 'RESEARCH' }, ...roster.slice(2)]]) {
            expect(() => validateDepartmentWorkforce('department-054', employees)).toThrow();
        }
    });
});
