import { AgentRole } from '../constants';
import { DomainInvariantError } from './errors';

const EMPLOYEE_SLOTS = 4;

/** Validate the fixed four-slot employee roster for one department. */
export function validateDepartmentWorkforce(departmentId, employees) {
    if (typeof departmentId !== 'string' || !departmentId.trim() || !Array.isArray(employees)
        || employees.length !== EMPLOYEE_SLOTS) invalid();
    const ids = new Set();
    const specializations = new Set();
    const workforce = employees.map((employee) => {
        if (!employee || employee.role !== AgentRole.EMPLOYEE || employee.departmentId !== departmentId
            || typeof employee.id !== 'string' || !employee.id.trim() || ids.has(employee.id)
            || typeof employee.specialization !== 'string' || !employee.specialization.trim()
            || employee.specialization.length > 100 || specializations.has(employee.specialization.trim().toLowerCase())) invalid();
        ids.add(employee.id);
        specializations.add(employee.specialization.trim().toLowerCase());
        return Object.freeze({ ...employee, specialization: employee.specialization.trim() });
    });
    return Object.freeze(workforce);
}

function invalid() {
    throw new DomainInvariantError('invalid-department-workforce', 'A department workforce requires exactly four distinct, specialized employee slots assigned to that department.');
}
